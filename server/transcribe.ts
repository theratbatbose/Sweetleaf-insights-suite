import { spawn } from "node:child_process";
import { existsSync, openAsBlob, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";
import type { JobStatus, SttProviderId, SttSettings, TranscriptLine } from "../shared/types";
import { makeId } from "../shared/util";
import { getSettings, getStudy, HttpError, mediaDir, saveTranscript } from "./storage";

export const STT_PROVIDERS: { id: SttProviderId; label: string; defaultBaseUrl: string; defaultModel: string; keyUrl: string }[] = [
  { id: "openai", label: "OpenAI (speaker-separated)", defaultBaseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o-transcribe-diarize", keyUrl: "https://platform.openai.com/api-keys" },
  { id: "groq", label: "Groq Whisper (fast, low cost)", defaultBaseUrl: "https://api.groq.com/openai/v1", defaultModel: "whisper-large-v3", keyUrl: "https://console.groq.com/keys" },
  { id: "openai-compatible", label: "Local / other Whisper server (OpenAI-compatible)", defaultBaseUrl: "http://127.0.0.1:8000/v1", defaultModel: "whisper-1", keyUrl: "" },
];

/** Chunk length in seconds. Keeps every request well under the 25 MB upload limit. */
const CHUNK_SECONDS = 600;

function findFfmpeg(): string | null {
  const bundled = ffmpegStatic as unknown as string | null;
  if (bundled && existsSync(bundled)) return bundled;
  return process.env.FFMPEG_PATH || null;
}

let ffmpegChecked: boolean | null = null;
export async function ffmpegAvailable(): Promise<boolean> {
  if (ffmpegChecked !== null) return ffmpegChecked;
  const candidate = findFfmpeg() ?? "ffmpeg";
  ffmpegChecked = await new Promise<boolean>((resolve) => {
    const child = spawn(candidate, ["-version"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
  return ffmpegChecked;
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(findFfmpeg() ?? "ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-2000); });
    child.on("error", (error) => reject(new Error(`ffmpeg could not start: ${error.message}`)));
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg failed: ${stderr.split("\n").filter(Boolean).slice(-2).join(" ")}`)));
  });
}

/** Extracts mono 16 kHz speech audio and splits it into fixed-length MP3 chunks. */
async function extractAudioChunks(input: string, workDir: string) {
  await runFfmpeg([
    "-hide_banner", "-loglevel", "error", "-y", "-i", input,
    "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "32k",
    "-f", "segment", "-segment_time", String(CHUNK_SECONDS), "-reset_timestamps", "1",
    path.join(workDir, "chunk%03d.mp3"),
  ]);
  const files = (await fs.readdir(workDir)).filter((file) => file.startsWith("chunk")).sort();
  if (!files.length) throw new Error("No audio track was found in this file.");
  return files.map((file) => path.join(workDir, file));
}

type SttSegment = { start: number; end: number; text: string; speaker?: string };

async function transcribeChunk(stt: SttSettings, file: string): Promise<SttSegment[]> {
  const info = STT_PROVIDERS.find((provider) => provider.id === stt.provider);
  if (!info) throw new HttpError(400, "No transcription service is connected. Open Settings → Transcription.");
  const model = stt.model || info.defaultModel;
  const diarize = /diarize/.test(model);
  const form = new FormData();
  form.append("file", await openAsBlob(file, { type: "audio/mpeg" }), path.basename(file));
  form.append("model", model);
  if (diarize) {
    form.append("response_format", "diarized_json");
    form.append("chunking_strategy", "auto");
  } else {
    form.append("response_format", "verbose_json");
  }
  if (stt.language) form.append("language", stt.language);

  const url = `${(stt.baseUrl || info.defaultBaseUrl).replace(/\/+$/, "")}/audio/transcriptions`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: stt.apiKey ? { authorization: `Bearer ${stt.apiKey}` } : {},
      body: form,
      signal: AbortSignal.timeout(15 * 60 * 1000),
    });
  } catch (error) {
    throw new Error(`Could not reach the transcription service: ${(error as Error).message}`);
  }
  const text = await response.text();
  if (!response.ok) {
    let message = text.slice(0, 300);
    try { message = JSON.parse(text)?.error?.message ?? message; } catch { /* keep raw text */ }
    throw new Error(`Transcription service error (${response.status}): ${message}`);
  }
  const data = JSON.parse(text);
  if (Array.isArray(data.segments) && data.segments.length) {
    return data.segments.map((segment: SttSegment) => ({
      start: Number(segment.start) || 0,
      end: Number(segment.end) || 0,
      text: String(segment.text ?? "").trim(),
      speaker: segment.speaker ? `Speaker ${segment.speaker}` : undefined,
    }));
  }
  return data.text ? [{ start: 0, end: 0, text: String(data.text).trim() }] : [];
}

/** Joins short fragments from the same speaker into readable transcript lines. */
export function segmentsToLines(segments: SttSegment[]): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  for (const segment of segments) {
    if (!segment.text) continue;
    const previous = lines[lines.length - 1];
    const sameSpeaker = previous && previous.speaker === (segment.speaker ?? "");
    const shortGap = previous && previous.end !== null && segment.start - previous.end < 1.5;
    // Without speaker labels, keep Whisper's sentence-sized segments; only absorb tiny fragments.
    const mergeable = previous && (previous.speaker ? previous.text.length + segment.text.length < 320 : previous.text.length < 40);
    if (previous && sameSpeaker && shortGap && mergeable) {
      previous.text = `${previous.text} ${segment.text}`;
      previous.end = segment.end;
    } else {
      lines.push({ id: makeId("l"), start: segment.start, end: segment.end, speaker: segment.speaker ?? "", text: segment.text });
    }
  }
  return lines;
}

// ---- background jobs ----

const jobs = new Map<string, JobStatus>();
let queue: Promise<unknown> = Promise.resolve();

export function listJobs(studyId: string) {
  return [...jobs.values()].filter((job) => job.studyId === studyId);
}

export function getJob(jobId: string) {
  return jobs.get(jobId) ?? null;
}

export async function startTranscription(studyId: string, participantId: string, mediaId: string) {
  const settings = await getSettings();
  if (settings.stt.provider === "none") throw new HttpError(400, "Connect a transcription service in Settings → Transcription first, or import a transcript file instead.");
  if (!(await ffmpegAvailable())) throw new HttpError(500, "The audio tool (ffmpeg) is not available. Re-run the installer, or import a transcript file instead.");
  const study = await getStudy(studyId);
  const participant = study.participants.find((entry) => entry.id === participantId);
  const media = participant?.media.find((entry) => entry.id === mediaId);
  if (!participant || !media) throw new HttpError(404, "Recording not found.");
  const existing = [...jobs.values()].find((job) => job.participantId === participantId && (job.state === "queued" || job.state === "running"));
  if (existing) return existing;

  const job: JobStatus = {
    id: makeId("job"),
    kind: "transcribe",
    studyId,
    participantId,
    state: "queued",
    progress: 0,
    message: "Waiting to start…",
    startedAt: new Date().toISOString(),
  };
  jobs.set(job.id, job);
  const input = path.join(mediaDir(studyId), media.storedName);
  queue = queue.then(() => runTranscription(job, input, settings.stt)).catch(() => undefined);
  return job;
}

async function runTranscription(job: JobStatus, input: string, stt: SttSettings) {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "sweetleaf-audio-"));
  try {
    job.state = "running";
    job.message = "Extracting audio…";
    const chunks = await extractAudioChunks(input, workDir);
    const all: SttSegment[] = [];
    for (let index = 0; index < chunks.length; index += 1) {
      job.message = `Transcribing part ${index + 1} of ${chunks.length}…`;
      job.progress = index / chunks.length;
      const offset = index * CHUNK_SECONDS;
      const segments = await transcribeChunk(stt, chunks[index]);
      all.push(...segments.map((segment) => ({ ...segment, start: segment.start + offset, end: segment.end + offset })));
    }
    const lines = segmentsToLines(all);
    if (!lines.length) throw new Error("The transcription service returned no speech.");
    await saveTranscript(job.studyId, { participantId: job.participantId, lines, source: "ai", language: stt.language, updatedAt: "" });
    job.state = "done";
    job.progress = 1;
    job.message = `Transcribed ${lines.length} lines.`;
  } catch (error) {
    job.state = "error";
    job.message = (error as Error).message;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}
