import { spawn } from "node:child_process";
import { createWriteStream, existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";
import mammoth from "mammoth";
import type { LlmSettings, MediaFile, PublicSettings, Settings, SttSettings, Study, Transcript } from "../shared/types";
import { emptyStudy, makeId, newSegment, nowIso } from "../shared/util";
import { LLM_PROVIDERS, listModels, testConnection } from "./ai";
import { draftTopline, extractDesign, extractSegments, fillGrid, segmentReport, structureGuide, suggestClusters, synthesiseRow } from "./analysis";
import { gridWorkbook, toplineDocx, toplineMarkdown } from "./exports";
import { sampleStudy } from "./sample";
import {
  assertSafeId, DATA_DIR, deleteStudy, deleteTranscript, ensureDataDir, getAllTranscripts, getSettings, getStudy,
  getTranscript, HttpError, listStudies, mediaDir, saveSettings, saveStudy, saveTranscript,
} from "./storage";
import { ffmpegAvailable, getJob, listJobs, startTranscription, STT_PROVIDERS } from "./transcribe";

const PORT = Number(process.env.PORT || 4317);
const HOST = "127.0.0.1";
const here = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = [path.resolve(here, "../dist"), path.resolve(here, "../../dist")].find((dir) => existsSync(path.join(dir, "index.html")));

const app = express();
app.disable("x-powered-by");

// Only answer requests addressed to this computer (blocks DNS-rebinding attacks from websites).
app.use((req, res, next) => {
  const host = (req.headers.host ?? "").replace(/:\d+$/, "");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(host)) return res.status(403).send("Sweetleaf only accepts local connections.");
  next();
});

// Writes need a custom header, which other websites cannot send without a CORS preflight we never approve.
app.use("/api", (req, res, next) => {
  if (req.method !== "GET" && req.headers["x-sweetleaf"] !== "1") return res.status(403).json({ error: "Missing request header." });
  next();
});

app.use("/api", express.json({ limit: "100mb" }));

const studyId = (req: Request) => assertSafeId(String(req.params.id));

// ---- settings & onboarding ----

const mask = (key: string) => (key ? `••••${key.slice(-4)}` : "");

async function publicSettings(): Promise<PublicSettings> {
  const settings = await getSettings();
  return {
    ...settings,
    llm: { ...settings.llm, apiKey: mask(settings.llm.apiKey) },
    stt: { ...settings.stt, apiKey: mask(settings.stt.apiKey) },
    dataDir: DATA_DIR,
    llmKeySet: Boolean(settings.llm.apiKey),
    sttKeySet: Boolean(settings.stt.apiKey),
    ffmpegAvailable: await ffmpegAvailable(),
  };
}

/** Merges a partial update; a key is only replaced when a new one is typed. */
function mergeLlm(saved: LlmSettings, update: Partial<LlmSettings> = {}): LlmSettings {
  const providerChanged = update.provider !== undefined && update.provider !== saved.provider;
  const typedKey = typeof update.apiKey === "string" && !update.apiKey.startsWith("••••") ? update.apiKey.trim() : undefined;
  return {
    provider: update.provider !== undefined ? update.provider : saved.provider,
    model: update.model ?? (providerChanged ? "" : saved.model),
    baseUrl: update.baseUrl ?? (providerChanged ? "" : saved.baseUrl),
    apiKey: typedKey ?? (providerChanged ? "" : saved.apiKey),
  };
}

function mergeStt(saved: SttSettings, update: Partial<SttSettings> = {}): SttSettings {
  const providerChanged = update.provider !== undefined && update.provider !== saved.provider;
  const typedKey = typeof update.apiKey === "string" && !update.apiKey.startsWith("••••") ? update.apiKey.trim() : undefined;
  return {
    provider: update.provider ?? saved.provider,
    model: update.model ?? (providerChanged ? "" : saved.model),
    baseUrl: update.baseUrl ?? (providerChanged ? "" : saved.baseUrl),
    language: update.language ?? saved.language,
    apiKey: typedKey ?? (providerChanged ? "" : saved.apiKey),
  };
}

app.get("/api/settings", async (_req, res) => { res.json(await publicSettings()); });

app.put("/api/settings", async (req, res) => {
  const saved = await getSettings();
  const body = req.body as Partial<Settings>;
  await saveSettings({
    onboarded: body.onboarded ?? saved.onboarded,
    llm: mergeLlm(saved.llm, body.llm),
    stt: mergeStt(saved.stt, body.stt),
  });
  res.json(await publicSettings());
});

app.get("/api/providers", (_req, res) => { res.json({ llm: LLM_PROVIDERS, stt: STT_PROVIDERS }); });

app.post("/api/ai/models", async (req, res) => {
  const llm = mergeLlm((await getSettings()).llm, req.body);
  res.json({ models: await listModels(llm) });
});

app.post("/api/ai/test", async (req, res) => {
  const llm = mergeLlm((await getSettings()).llm, req.body);
  res.json({ reply: await testConnection(llm) });
});

app.post("/api/stt/test", async (req, res) => {
  const stt = mergeStt((await getSettings()).stt, req.body);
  const info = STT_PROVIDERS.find((provider) => provider.id === stt.provider);
  if (!info) throw new HttpError(400, "Choose a transcription service.");
  const url = `${(stt.baseUrl || info.defaultBaseUrl).replace(/\/+$/, "")}/models`;
  let response: globalThis.Response;
  try {
    response = await fetch(url, { headers: stt.apiKey ? { authorization: `Bearer ${stt.apiKey}` } : {}, signal: AbortSignal.timeout(20_000) });
  } catch (error) {
    throw new HttpError(502, `Could not reach ${new URL(url).origin}: ${(error as Error).message}`);
  }
  if (!response.ok) throw new HttpError(502, `The service rejected the connection (${response.status}). Check the key.`);
  res.json({ ok: true });
});

async function llmSettings() {
  const settings = await getSettings();
  if (!settings.llm.provider) throw new HttpError(400, "No AI provider is connected. Open Settings → AI to connect one.");
  return settings.llm;
}

// ---- studies ----

app.get("/api/studies", async (_req, res) => { res.json(await listStudies()); });

app.post("/api/studies", async (req, res) => {
  const name = String(req.body?.name ?? "").trim() || "Untitled study";
  res.json(await saveStudy(emptyStudy(name)));
});

app.post("/api/studies/sample", async (_req, res) => {
  const { study, transcripts } = sampleStudy();
  const saved = await saveStudy(study);
  for (const transcript of transcripts) await saveTranscript(saved.id, transcript);
  res.json(saved);
});

app.post("/api/studies/import", async (req, res) => {
  const backup = req.body as { study?: Study; transcripts?: Record<string, Transcript> };
  if (!backup?.study || !Array.isArray(backup.study.participants) || !Array.isArray(backup.study.guide)) {
    throw new HttpError(400, "This file is not a Sweetleaf study backup.");
  }
  const study: Study = { ...emptyStudy(backup.study.name), ...backup.study, id: makeId("s"), createdAt: nowIso() };
  // Media files are not part of the JSON backup.
  study.participants = study.participants.map((participant) => ({ ...participant, media: [] }));
  const saved = await saveStudy(study);
  for (const transcript of Object.values(backup.transcripts ?? {})) {
    if (study.participants.some((participant) => participant.id === transcript.participantId)) await saveTranscript(saved.id, transcript);
  }
  res.json(saved);
});

app.get("/api/studies/:id", async (req, res) => { res.json(await getStudy(studyId(req))); });

app.put("/api/studies/:id", async (req, res) => {
  const id = studyId(req);
  const study = req.body as Study;
  if (study.id !== id) throw new HttpError(400, "Study id mismatch.");
  await getStudy(id);
  const saved = await saveStudy(study);
  res.json({ updatedAt: saved.updatedAt });
});

app.delete("/api/studies/:id", async (req, res) => {
  await deleteStudy(studyId(req));
  res.json({ ok: true });
});

// ---- transcripts ----

app.get("/api/studies/:id/transcripts", async (req, res) => {
  const all = await getAllTranscripts(studyId(req));
  res.json(Object.fromEntries(Object.entries(all).map(([participantId, transcript]) => [participantId, { lines: transcript.lines.length, source: transcript.source, updatedAt: transcript.updatedAt }])));
});

app.get("/api/studies/:id/transcripts/:pid", async (req, res) => {
  res.json(await getTranscript(studyId(req), assertSafeId(String(req.params.pid))));
});

app.put("/api/studies/:id/transcripts/:pid", async (req, res) => {
  const participantId = assertSafeId(String(req.params.pid));
  const transcript = req.body as Transcript;
  if (!Array.isArray(transcript?.lines)) throw new HttpError(400, "Invalid transcript.");
  await saveTranscript(studyId(req), { ...transcript, participantId });
  res.json({ ok: true });
});

app.delete("/api/studies/:id/transcripts/:pid", async (req, res) => {
  await deleteTranscript(studyId(req), assertSafeId(String(req.params.pid)));
  res.json({ ok: true });
});

// ---- media ----

const MEDIA_TYPES: Record<string, string> = {
  ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".mkv": "video/x-matroska", ".avi": "video/x-msvideo",
  ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".wav": "audio/wav", ".aac": "audio/aac", ".ogg": "audio/ogg", ".opus": "audio/ogg", ".flac": "audio/flac", ".wma": "audio/x-ms-wma", ".amr": "audio/amr",
};

app.post("/api/studies/:id/media", async (req, res) => {
  const id = studyId(req);
  await getStudy(id);
  const originalName = path.basename(String(req.query.name ?? "recording"));
  const ext = path.extname(originalName).toLowerCase();
  if (!MEDIA_TYPES[ext]) throw new HttpError(400, `Unsupported file type "${ext}". Use MP4, MOV, WEBM, MKV, MP3, M4A, WAV or similar.`);
  const storedName = `${makeId("m")}${ext}`;
  const dir = mediaDir(id);
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, storedName);
  try {
    await pipeline(req, createWriteStream(target));
  } catch (error) {
    await fs.rm(target, { force: true });
    throw error;
  }
  const { size } = await fs.stat(target);
  const media: MediaFile = { id: makeId("media"), originalName, storedName, mime: MEDIA_TYPES[ext], size, uploadedAt: nowIso() };
  res.json(media);
});

app.get("/api/studies/:id/media/:file", (req, res, next) => {
  const file = path.basename(String(req.params.file));
  res.sendFile(file, { root: mediaDir(studyId(req)), acceptRanges: true, headers: { "cache-control": "no-store" } }, (error) => {
    if (error && !res.headersSent) next(new HttpError(404, "Recording not found on disk."));
  });
});

app.delete("/api/studies/:id/media/:file", async (req, res) => {
  await fs.rm(path.join(mediaDir(studyId(req)), path.basename(String(req.params.file))), { force: true });
  res.json({ ok: true });
});

// ---- document import ----

app.post("/api/extract-text", express.raw({ type: () => true, limit: "60mb" }), async (req, res) => {
  const name = String(req.query.name ?? "");
  const ext = path.extname(name).toLowerCase();
  const buffer = req.body as Buffer;
  if (ext === ".docx") {
    const { value } = await mammoth.extractRawText({ buffer });
    return res.json({ text: value });
  }
  if (ext === ".doc" || ext === ".pdf") {
    throw new HttpError(400, `${ext.toUpperCase().slice(1)} files can't be read directly. Open it in Word and save as .docx, or copy the text and paste it in.`);
  }
  res.json({ text: buffer.toString("utf8") });
});

// ---- transcription jobs ----

app.post("/api/studies/:id/transcribe", async (req, res) => {
  const { participantId, mediaId } = req.body ?? {};
  res.json(await startTranscription(studyId(req), assertSafeId(String(participantId)), String(mediaId)));
});

app.get("/api/studies/:id/jobs", (req, res) => { res.json(listJobs(studyId(req))); });
app.get("/api/jobs/:jobId", (req, res) => {
  const job = getJob(String(req.params.jobId));
  if (!job) throw new HttpError(404, "Job not found.");
  res.json(job);
});

// ---- AI assistance ----

app.post("/api/ai/structure-guide", async (req, res) => {
  res.json({ sections: await structureGuide(await llmSettings(), String(req.body?.text ?? "")) });
});

app.post("/api/ai/extract-segments", async (req, res) => {
  const segments = await extractSegments(await llmSettings(), String(req.body?.screener ?? ""), String(req.body?.brief ?? ""));
  res.json({ segments: segments.map((segment, index) => newSegment(segment.name, Number(req.body?.startIndex ?? 0) + index, segment)) });
});

app.post("/api/ai/extract-design", async (req, res) => {
  res.json(await extractDesign(await llmSettings(), String(req.body?.brief ?? "")));
});

app.post("/api/studies/:id/ai/fill-grid", async (req, res) => {
  const id = studyId(req);
  const participantId = assertSafeId(String(req.body?.participantId));
  const transcript = await getTranscript(id, participantId);
  if (!transcript) throw new HttpError(400, "This participant has no transcript yet.");
  res.json({ cells: await fillGrid(await llmSettings(), await getStudy(id), transcript, req.body?.questionIds) });
});

app.post("/api/studies/:id/ai/row", async (req, res) => {
  res.json({ synthesis: await synthesiseRow(await llmSettings(), await getStudy(studyId(req)), String(req.body?.questionId)) });
});

app.post("/api/studies/:id/ai/segment-report", async (req, res) => {
  const id = studyId(req);
  const study = await getStudy(id);
  const segment = study.segments.find((entry) => entry.id === req.body?.segmentId);
  if (!segment) throw new HttpError(404, "Segment not found.");
  res.json({ report: await segmentReport(await llmSettings(), study, segment, await getAllTranscripts(id)) });
});

app.post("/api/studies/:id/ai/clusters", async (req, res) => {
  res.json({ clusters: await suggestClusters(await llmSettings(), await getStudy(studyId(req))) });
});

app.post("/api/studies/:id/ai/topline", async (req, res) => {
  res.json(await draftTopline(await llmSettings(), await getStudy(studyId(req))));
});

// ---- exports ----

const safeFileName = (name: string) => name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "study";

app.get("/api/studies/:id/export/grid.xlsx", async (req, res) => {
  const study = await getStudy(studyId(req));
  res.attachment(`${safeFileName(study.name)}-analysis-grid.xlsx`).type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").send(await gridWorkbook(study));
});

app.get("/api/studies/:id/export/topline.docx", async (req, res) => {
  const study = await getStudy(studyId(req));
  res.attachment(`${safeFileName(study.name)}-topline.docx`).type("application/vnd.openxmlformats-officedocument.wordprocessingml.document").send(await toplineDocx(study));
});

app.get("/api/studies/:id/export/topline.md", async (req, res) => {
  const study = await getStudy(studyId(req));
  res.attachment(`${safeFileName(study.name)}-topline.md`).type("text/markdown").send(toplineMarkdown(study));
});

app.get("/api/studies/:id/export/backup.json", async (req, res) => {
  const id = studyId(req);
  const study = await getStudy(id);
  res.attachment(`${safeFileName(study.name)}-backup.json`).json({ format: "sweetleaf-study", version: 2, exportedAt: nowIso(), study, transcripts: await getAllTranscripts(id) });
});

app.use("/api", (_req, res) => { res.status(404).json({ error: "Not found" }); });

// ---- the app itself ----

if (CLIENT_DIR) {
  app.use(express.static(CLIENT_DIR, { index: "index.html" }));
  app.get("/{*splat}", (_req, res) => { res.sendFile(path.join(CLIENT_DIR, "index.html")); });
}

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (status >= 500) console.error(error);
  if (!res.headersSent) res.status(status).json({ error: message });
});

function openBrowser(url: string) {
  const command = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(command, args, { stdio: "ignore", detached: true }).on("error", () => undefined).unref();
  } catch { /* the URL is printed anyway */ }
}

await ensureDataDir();
const server = app.listen(PORT, HOST, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n  Sweetleaf Suite is running at ${url}`);
  console.log(`  Your studies are saved in ${DATA_DIR}`);
  console.log("  Keep this window open while you work. Press Ctrl+C to stop.\n");
  if (!CLIENT_DIR) console.log("  (API only — run `npm run build` first, or use `npm run dev`.)\n");
  if (process.env.SWEETLEAF_OPEN === "1" && CLIENT_DIR) openBrowser(url);
});
server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.log(`\n  Sweetleaf already seems to be running at http://localhost:${PORT} — opening it.\n`);
    if (process.env.SWEETLEAF_OPEN === "1") openBrowser(`http://localhost:${PORT}`);
    process.exit(0);
  }
  throw error;
});
// Long AI calls and large uploads must not be cut off by Node's default timeouts.
server.requestTimeout = 0;
server.headersTimeout = 120_000;
