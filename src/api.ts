import type { GridCell, GuideSection, JobStatus, LlmSettings, MediaFile, PublicSettings, Segment, SegmentReport, SttSettings, Study, StudySummary, Transcript } from "../shared/types";

export type ProviderInfo = { id: string; label: string; defaultBaseUrl: string; defaultModel: string; needsKey?: boolean; keyUrl: string };

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { "x-sweetleaf": "1", ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!response.ok) {
    const message = (data as { error?: string } | null)?.error ?? `Request failed (${response.status})`;
    throw new Error(message);
  }
  return data as T;
}

const s = (id: string) => `/api/studies/${encodeURIComponent(id)}`;

export const api = {
  settings: () => request<PublicSettings>("GET", "/api/settings"),
  saveSettings: (update: { onboarded?: boolean; llm?: Partial<LlmSettings>; stt?: Partial<SttSettings> }) => request<PublicSettings>("PUT", "/api/settings", update),
  providers: () => request<{ llm: ProviderInfo[]; stt: ProviderInfo[] }>("GET", "/api/providers"),
  listModels: (llm: Partial<LlmSettings>) => request<{ models: string[] }>("POST", "/api/ai/models", llm),
  testLlm: (llm: Partial<LlmSettings>) => request<{ reply: string }>("POST", "/api/ai/test", llm),
  testStt: (stt: Partial<SttSettings>) => request<{ ok: boolean }>("POST", "/api/stt/test", stt),

  studies: () => request<StudySummary[]>("GET", "/api/studies"),
  createStudy: (name: string) => request<Study>("POST", "/api/studies", { name }),
  createSample: () => request<Study>("POST", "/api/studies/sample", {}),
  importStudy: (backup: unknown) => request<Study>("POST", "/api/studies/import", backup),
  study: (id: string) => request<Study>("GET", s(id)),
  saveStudy: (study: Study) => request<{ updatedAt: string }>("PUT", s(study.id), study),
  deleteStudy: (id: string) => request<{ ok: boolean }>("DELETE", s(id)),

  transcriptIndex: (id: string) => request<Record<string, { lines: number; source: string; updatedAt: string }>>("GET", `${s(id)}/transcripts`),
  transcript: (id: string, participantId: string) => request<Transcript | null>("GET", `${s(id)}/transcripts/${participantId}`),
  saveTranscript: (id: string, transcript: Transcript) => request<{ ok: boolean }>("PUT", `${s(id)}/transcripts/${transcript.participantId}`, transcript),
  deleteTranscript: (id: string, participantId: string) => request<{ ok: boolean }>("DELETE", `${s(id)}/transcripts/${participantId}`),

  mediaUrl: (id: string, media: MediaFile) => `${s(id)}/media/${encodeURIComponent(media.storedName)}`,
  deleteMedia: (id: string, media: MediaFile) => request<{ ok: boolean }>("DELETE", `${s(id)}/media/${encodeURIComponent(media.storedName)}`),
  transcribe: (id: string, participantId: string, mediaId: string) => request<JobStatus>("POST", `${s(id)}/transcribe`, { participantId, mediaId }),
  jobs: (id: string) => request<JobStatus[]>("GET", `${s(id)}/jobs`),

  structureGuide: (text: string) => request<{ sections: GuideSection[] }>("POST", "/api/ai/structure-guide", { text }),
  extractSegments: (screener: string, brief: string, startIndex: number) => request<{ segments: Segment[] }>("POST", "/api/ai/extract-segments", { screener, brief, startIndex }),
  extractDesign: (brief: string) => request<Record<string, string>>("POST", "/api/ai/extract-design", { brief }),
  fillGrid: (id: string, participantId: string, questionIds?: string[]) => request<{ cells: Record<string, GridCell> }>("POST", `${s(id)}/ai/fill-grid`, { participantId, questionIds }),
  rowSynthesis: (id: string, questionId: string) => request<{ synthesis: string }>("POST", `${s(id)}/ai/row`, { questionId }),
  segmentReport: (id: string, segmentId: string) => request<{ report: SegmentReport }>("POST", `${s(id)}/ai/segment-report`, { segmentId }),
  suggestClusters: (id: string) => request<{ clusters: { title: string; thought: string; observationIds: string[] }[] }>("POST", `${s(id)}/ai/clusters`, {}),
  draftTopline: (id: string) => request<{ title: string; intro: string; body: string }>("POST", `${s(id)}/ai/topline`, {}),

  exportUrl: (id: string, kind: "grid.xlsx" | "topline.docx" | "topline.md" | "backup.json") => `${s(id)}/export/${kind}`,
};

/** Uploads a recording with progress (fetch cannot report upload progress). */
export function uploadMedia(studyId: string, file: File, onProgress: (fraction: number) => void): Promise<MediaFile> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${s(studyId)}/media?name=${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader("x-sweetleaf", "1");
    xhr.setRequestHeader("content-type", "application/octet-stream");
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(event.loaded / event.total); };
    xhr.onload = () => {
      let data: { error?: string } & MediaFile;
      try { data = JSON.parse(xhr.responseText); } catch { return reject(new Error("Upload failed.")); }
      if (xhr.status >= 400) reject(new Error(data.error ?? "Upload failed."));
      else resolve(data);
    };
    xhr.onerror = () => reject(new Error("Upload failed — is Sweetleaf still running?"));
    xhr.send(file);
  });
}

/** Reads TXT/SRT/VTT/CSV in the browser, and DOCX via the local server. */
export async function readDocumentText(file: File): Promise<string> {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (["txt", "srt", "vtt", "csv", "md", "tsv"].includes(ext)) return file.text();
  const response = await fetch(`/api/extract-text?name=${encodeURIComponent(file.name)}`, {
    method: "POST",
    headers: { "x-sweetleaf": "1", "content-type": "application/octet-stream" },
    body: file,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Could not read this file.");
  return data.text as string;
}
