// Data model shared by the local server and the browser UI.
// All times are stored in seconds.

export type ID = string;

export type Segment = {
  id: ID;
  name: string;
  description: string;
  criteria: string;
  quota: number | null;
  color: string;
};

export type GuideQuestion = { id: ID; text: string };
export type GuideSection = { id: ID; title: string; questions: GuideQuestion[] };

export type MediaFile = {
  id: ID;
  originalName: string;
  storedName: string;
  mime: string;
  size: number;
  uploadedAt: string;
};

export type Participant = {
  id: ID;
  code: string;
  name: string;
  segmentId: ID | null;
  city: string;
  age: number | null;
  gender: string;
  sessionType: string;
  sessionDate: string;
  notes: string;
  media: MediaFile[];
};

export type TranscriptLine = {
  id: ID;
  /** null for untimed transcripts (e.g. Word documents without timestamps) */
  start: number | null;
  end: number | null;
  speaker: string;
  text: string;
};

export type Transcript = {
  participantId: ID;
  lines: TranscriptLine[];
  source: "import" | "ai" | "manual";
  language: string;
  updatedAt: string;
};

export type Quote = {
  text: string;
  time: number | null;
  translation: string;
  /** false when an AI-suggested quote could not be found in the transcript */
  verified: boolean;
};

export type GridCell = {
  summary: string;
  quotes: Quote[];
  status: "ai" | "reviewed" | "manual";
  updatedAt: string;
};

/** grid[participantId][questionId] */
export type Grid = Record<ID, Record<ID, GridCell>>;

export type SegmentReport = {
  recurring: string[];
  differences: string;
  contradictions: string;
  explore: string;
  excerpts: { participantId: ID; text: string; time: number | null; verified: boolean }[];
  source: "ai" | "manual";
  updatedAt: string;
};

export type Observation = {
  id: ID;
  participantId: ID;
  questionId: ID | null;
  code: string;
  note: string;
  quote: string;
  time: number | null;
  x: number;
  y: number;
};

export type Cluster = {
  id: ID;
  title: string;
  thought: string;
  observationIds: ID[];
  x: number;
  y: number;
};

export type RelationshipEndpoint = { kind: "obs" | "cluster"; id: ID };
export type Relationship = { id: ID; from: RelationshipEndpoint; to: RelationshipEndpoint; note: string };

export type Topline = {
  title: string;
  intro: string;
  blocks: ID[];
  body: string;
};

export type StudyDesign = {
  client: string;
  objectives: string;
  background: string;
  methodology: string;
  markets: string;
  languages: string;
  briefText: string;
  screenerText: string;
  guideText: string;
};

export type Study = {
  id: ID;
  name: string;
  /** The preloaded demo study with fictional data */
  demo?: boolean;
  createdAt: string;
  updatedAt: string;
  design: StudyDesign;
  segments: Segment[];
  guide: GuideSection[];
  participants: Participant[];
  grid: Grid;
  rowSynthesis: Record<ID, string>;
  segmentReports: Record<ID, SegmentReport>;
  observations: Observation[];
  clusters: Cluster[];
  connections: Relationship[];
  topline: Topline;
};

export type StudySummary = {
  id: ID;
  name: string;
  demo: boolean;
  client: string;
  updatedAt: string;
  participantCount: number;
  questionCount: number;
};

// ---- AI settings ----

export type LlmProviderId = "anthropic" | "openai" | "gemini" | "openrouter" | "ollama" | "openai-compatible";
export type SttProviderId = "none" | "openai" | "groq" | "openai-compatible";

export type LlmSettings = {
  provider: LlmProviderId | null;
  model: string;
  baseUrl: string;
  /** masked when sent to the browser */
  apiKey: string;
};

export type SttSettings = {
  provider: SttProviderId;
  model: string;
  baseUrl: string;
  apiKey: string;
  language: string;
};

export type Settings = {
  onboarded: boolean;
  /** Set once the demo study has been created, so deleting it is permanent */
  demoSeeded?: boolean;
  llm: LlmSettings;
  stt: SttSettings;
};

export type PublicSettings = Settings & {
  dataDir: string;
  llmKeySet: boolean;
  sttKeySet: boolean;
  ffmpegAvailable: boolean;
};

export type JobStatus = {
  id: ID;
  kind: "transcribe";
  studyId: ID;
  participantId: ID;
  state: "queued" | "running" | "done" | "error";
  progress: number;
  message: string;
  startedAt: string;
};
