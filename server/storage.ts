import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Settings, Study, StudySummary, Transcript } from "../shared/types";
import { allQuestions } from "../shared/util";

export const DATA_DIR = path.resolve(process.env.SWEETLEAF_DATA_DIR || path.join(os.homedir(), "SweetleafData"));
const STUDIES_DIR = path.join(DATA_DIR, "studies");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;

export function assertSafeId(id: string) {
  if (!SAFE_ID.test(id)) throw new HttpError(400, "Invalid identifier");
  return id;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function ensureDataDir() {
  await fs.mkdir(STUDIES_DIR, { recursive: true });
}

/** Write via a temp file + rename so a crash never leaves a half-written study. */
async function writeJsonAtomic(file: string, data: unknown, mode?: number) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, JSON.stringify(data, null, 2), { encoding: "utf8", mode });
  await fs.rename(temp, file);
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

// Serialise writes per file so concurrent saves cannot interleave.
const writeQueues = new Map<string, Promise<unknown>>();
function queued<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  writeQueues.set(key, next);
  return next;
}

export function studyDir(studyId: string) {
  return path.join(STUDIES_DIR, assertSafeId(studyId));
}

export function mediaDir(studyId: string) {
  return path.join(studyDir(studyId), "media");
}

export async function listStudies(): Promise<StudySummary[]> {
  await ensureDataDir();
  const entries = await fs.readdir(STUDIES_DIR, { withFileTypes: true });
  const summaries: StudySummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !SAFE_ID.test(entry.name)) continue;
    const study = await readJson<Study>(path.join(STUDIES_DIR, entry.name, "study.json")).catch(() => null);
    if (!study) continue;
    summaries.push({
      id: study.id,
      name: study.name,
      demo: Boolean(study.demo),
      client: study.design?.client ?? "",
      updatedAt: study.updatedAt,
      participantCount: study.participants?.length ?? 0,
      questionCount: allQuestions(study.guide ?? []).length,
    });
  }
  return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getStudy(studyId: string): Promise<Study> {
  const study = await readJson<Study>(path.join(studyDir(studyId), "study.json"));
  if (!study) throw new HttpError(404, "Study not found");
  return study;
}

export async function saveStudy(study: Study): Promise<Study> {
  assertSafeId(study.id);
  const file = path.join(studyDir(study.id), "study.json");
  return queued(file, async () => {
    const saved = { ...study, updatedAt: new Date().toISOString() };
    await writeJsonAtomic(file, saved);
    return saved;
  });
}

export async function deleteStudy(studyId: string) {
  await fs.rm(studyDir(studyId), { recursive: true, force: true });
}

export async function getTranscript(studyId: string, participantId: string): Promise<Transcript | null> {
  return readJson<Transcript>(path.join(studyDir(studyId), "transcripts", `${assertSafeId(participantId)}.json`));
}

export async function getAllTranscripts(studyId: string): Promise<Record<string, Transcript>> {
  const dir = path.join(studyDir(studyId), "transcripts");
  const result: Record<string, Transcript> = {};
  let files: string[] = [];
  try { files = await fs.readdir(dir); } catch { return result; }
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const transcript = await readJson<Transcript>(path.join(dir, file)).catch(() => null);
    if (transcript) result[transcript.participantId] = transcript;
  }
  return result;
}

export async function saveTranscript(studyId: string, transcript: Transcript) {
  const file = path.join(studyDir(studyId), "transcripts", `${assertSafeId(transcript.participantId)}.json`);
  return queued(file, () => writeJsonAtomic(file, { ...transcript, updatedAt: new Date().toISOString() }));
}

export async function deleteTranscript(studyId: string, participantId: string) {
  await fs.rm(path.join(studyDir(studyId), "transcripts", `${assertSafeId(participantId)}.json`), { force: true });
}

// ---- settings ----

export const defaultSettings: Settings = {
  onboarded: false,
  llm: { provider: null, model: "", baseUrl: "", apiKey: "" },
  stt: { provider: "none", model: "", baseUrl: "", apiKey: "", language: "" },
};

export async function getSettings(): Promise<Settings> {
  const saved = await readJson<Partial<Settings>>(SETTINGS_FILE);
  return {
    onboarded: saved?.onboarded ?? false,
    demoSeeded: saved?.demoSeeded ?? false,
    llm: { ...defaultSettings.llm, ...(saved?.llm ?? {}) },
    stt: { ...defaultSettings.stt, ...(saved?.stt ?? {}) },
  };
}

export async function saveSettings(settings: Settings) {
  // 0600: API keys are readable only by the current OS user.
  return queued(SETTINGS_FILE, () => writeJsonAtomic(SETTINGS_FILE, settings, 0o600));
}
