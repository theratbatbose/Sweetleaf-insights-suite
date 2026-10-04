import type { GridCell, GuideSection, LlmSettings, Segment, SegmentReport, Study, Transcript, TranscriptLine } from "../shared/types";
import { allQuestions, makeId, nowIso, transcriptToText, verifyQuotes } from "../shared/util";
import { chatJson } from "./ai";
import { HttpError } from "./storage";

const RESEARCH_PRINCIPLES = `You assist a qualitative market researcher in India. The researcher stays in charge: your output is a draft they will review.
Rules:
- Use only evidence present in the material provided. Never invent respondents, quotes, numbers or opinions.
- Quotes must be copied verbatim from the transcript, in the original language and script (Hindi, Hinglish, Tamil, etc. stay as spoken). Quote respondents, not the moderator.
- When a quote is not in English, add a faithful English translation; otherwise leave translation empty.
- Write summaries in clear, plain English from the respondent's point of view. Note hesitation, contradiction and emotion where the transcript shows it.
- If something was not discussed, say so by leaving the field empty rather than guessing.`;

/** ~120k characters ≈ 30k tokens: fits comfortably in current hosted models. */
const MAX_TRANSCRIPT_CHARS = 120_000;
const QUESTIONS_PER_CALL = 20;

function chunkTranscript(lines: TranscriptLine[]) {
  const parts: TranscriptLine[][] = [];
  let current: TranscriptLine[] = [];
  let size = 0;
  for (const line of lines) {
    const length = line.text.length + line.speaker.length + 12;
    if (size + length > MAX_TRANSCRIPT_CHARS && current.length) {
      parts.push(current);
      current = [];
      size = 0;
    }
    current.push(line);
    size += length;
  }
  if (current.length) parts.push(current);
  return parts;
}

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

function studyContext(study: Study) {
  const d = study.design;
  return [
    `Study: ${study.name}`,
    d.client && `Client: ${d.client}`,
    d.objectives && `Objectives:\n${d.objectives}`,
    d.methodology && `Methodology: ${d.methodology}`,
    d.markets && `Markets: ${d.markets}`,
  ].filter(Boolean).join("\n");
}

function participantLabel(study: Study, participantId: string) {
  const participant = study.participants.find((entry) => entry.id === participantId);
  if (!participant) return participantId;
  const segment = study.segments.find((entry) => entry.id === participant.segmentId);
  return [participant.code, participant.name, segment?.name, participant.city, participant.age ? `${participant.age}y` : ""].filter(Boolean).join(" · ");
}

// ---------------------------------------------------------------------------
// Study setup from documents
// ---------------------------------------------------------------------------

export async function structureGuide(llm: LlmSettings, text: string): Promise<GuideSection[]> {
  const result = await chatJson<{ sections?: { title?: string; questions?: string[] }[] }>(llm,
    `${RESEARCH_PRINCIPLES}\nYou convert a discussion guide into a clean analysis framework.`,
    `Convert this discussion guide into sections and questions for an analysis grid.
- Keep the guide's own section order and wording. Keep each main question as one item; fold its probes into the same item after " — Probe: ".
- Drop moderator instructions, timings, stimulus notes and greetings/thank-yous.
Return {"sections":[{"title":"...","questions":["...","..."]}]}

DISCUSSION GUIDE:
${text.slice(0, 60_000)}`, 12_000);
  return (result.sections ?? [])
    .map((section) => ({
      id: makeId("g"),
      title: String(section.title ?? "Section").trim(),
      questions: (section.questions ?? []).filter((q) => typeof q === "string" && q.trim()).map((q) => ({ id: makeId("q"), text: q.trim() })),
    }))
    .filter((section) => section.questions.length);
}

export type ExtractedSegment = { name: string; description: string; criteria: string; quota: number | null };

export async function extractSegments(llm: LlmSettings, screener: string, brief: string): Promise<ExtractedSegment[]> {
  const result = await chatJson<{ segments?: Partial<ExtractedSegment>[] }>(llm,
    `${RESEARCH_PRINCIPLES}\nYou read recruitment screeners and research briefs.`,
    `Identify the respondent segments ("cuts") this study recruits, e.g. Loyalists / Lapsers / Non-users, or age × city groups.
For each give: name (short), description (one sentence), criteria (the screener conditions that define it), quota (number of respondents if stated, else null).
Return {"segments":[{"name":"","description":"","criteria":"","quota":null}]}

SCREENER:
${screener.slice(0, 40_000) || "(none)"}

BRIEF:
${brief.slice(0, 20_000) || "(none)"}`);
  return (result.segments ?? []).filter((segment) => segment.name).map((segment) => ({
    name: String(segment.name).trim(),
    description: String(segment.description ?? "").trim(),
    criteria: String(segment.criteria ?? "").trim(),
    quota: typeof segment.quota === "number" ? segment.quota : null,
  }));
}

export async function extractDesign(llm: LlmSettings, brief: string) {
  const result = await chatJson<Record<string, string>>(llm,
    `${RESEARCH_PRINCIPLES}\nYou read research briefs and proposals.`,
    `Extract the study design from this brief. Keep the client's wording where possible. Use empty strings for anything not stated.
Return {"client":"","objectives":"(bullet list, one per line starting with '- ')","background":"","methodology":"(e.g. 24 IDIs, 60 min, in-home)","markets":"(cities)","languages":""}

BRIEF:
${brief.slice(0, 60_000)}`);
  const pick = (key: string) => typeof result[key] === "string" ? result[key].trim() : "";
  return { client: pick("client"), objectives: pick("objectives"), background: pick("background"), methodology: pick("methodology"), markets: pick("markets"), languages: pick("languages") };
}

// ---------------------------------------------------------------------------
// Analysis grid
// ---------------------------------------------------------------------------

type RawCell = { questionId?: string; summary?: string; quotes?: { text?: string; translation?: string }[] };

export async function fillGrid(llm: LlmSettings, study: Study, transcript: Transcript, questionIds?: string[]) {
  const questions = allQuestions(study.guide).filter((question) => !questionIds?.length || questionIds.includes(question.id));
  if (!questions.length) throw new HttpError(400, "Add discussion guide questions in Setup before filling the grid.");
  if (!transcript.lines.length) throw new HttpError(400, "This participant has no transcript yet.");

  const parts = chunkTranscript(transcript.lines);
  const collected = new Map<string, { summaries: string[]; quotes: { text: string; translation?: string }[] }>();

  for (const [partIndex, lines] of parts.entries()) {
    for (const batch of chunk(questions, QUESTIONS_PER_CALL)) {
      const result = await chatJson<{ cells?: RawCell[] }>(llm, RESEARCH_PRINCIPLES,
        `${studyContext(study)}

Respondent: ${participantLabel(study, transcript.participantId)}
${parts.length > 1 ? `This is part ${partIndex + 1} of ${parts.length} of the transcript.\n` : ""}
For each discussion-guide question below, write what THIS respondent said about it, as an analysis-grid cell:
- summary: 1–3 sentences in English capturing their answer, reasons and any nuance. Empty string if the topic did not come up.
- quotes: up to 2 short, telling verbatim quotes (exact words from the transcript). Empty list if none.
Answers often appear outside the question's place in the interview — search the whole transcript.

QUESTIONS:
${batch.map((question) => `[${question.id}] ${question.text}`).join("\n")}

Return {"cells":[{"questionId":"...","summary":"...","quotes":[{"text":"...","translation":""}]}]}

TRANSCRIPT:
${transcriptToText(lines)}`, 16_000);

      for (const cell of result.cells ?? []) {
        if (!cell.questionId || !batch.some((question) => question.id === cell.questionId)) continue;
        const entry = collected.get(cell.questionId) ?? { summaries: [], quotes: [] };
        if (cell.summary?.trim()) entry.summaries.push(cell.summary.trim());
        for (const quote of cell.quotes ?? []) if (quote?.text) entry.quotes.push({ text: quote.text, translation: quote.translation });
        collected.set(cell.questionId, entry);
      }
    }
  }

  const cells: Record<string, GridCell> = {};
  for (const [questionId, entry] of collected) {
    if (!entry.summaries.length && !entry.quotes.length) continue;
    cells[questionId] = {
      summary: entry.summaries.join(" "),
      quotes: verifyQuotes(entry.quotes.slice(0, 4), transcript.lines),
      status: "ai",
      updatedAt: nowIso(),
    };
  }
  return cells;
}

export async function synthesiseRow(llm: LlmSettings, study: Study, questionId: string) {
  const question = allQuestions(study.guide).find((entry) => entry.id === questionId);
  if (!question) throw new HttpError(404, "Question not found.");
  const answers = study.participants
    .map((participant) => ({ participant, cell: study.grid[participant.id]?.[questionId] }))
    .filter(({ cell }) => cell && (cell.summary || cell.quotes.length));
  if (!answers.length) throw new HttpError(400, "Fill some grid cells for this question first.");
  const result = await chatJson<{ synthesis?: string }>(llm, RESEARCH_PRINCIPLES,
    `${studyContext(study)}

Question: ${question.text}

Each respondent's grid cell:
${answers.map(({ participant, cell }) => `- ${participantLabel(study, participant.id)}: ${cell!.summary} ${cell!.quotes.map((quote) => `“${quote.text}”`).join(" ")}`).join("\n")}

Write the "across respondents" synthesis for this row: the dominant pattern, how segments differ, and notable exceptions. 3–5 sentences. Refer to respondents by code. Do not count percentages.
Return {"synthesis":"..."}`);
  return (result.synthesis ?? "").trim();
}

// ---------------------------------------------------------------------------
// Segment (cut) synthesis
// ---------------------------------------------------------------------------

export async function segmentReport(llm: LlmSettings, study: Study, segment: Segment, transcripts: Record<string, Transcript>): Promise<SegmentReport> {
  const members = study.participants.filter((participant) => participant.segmentId === segment.id);
  if (!members.length) throw new HttpError(400, "No participants are assigned to this segment yet.");
  const questions = allQuestions(study.guide);
  const memberEvidence = members.map((participant) => {
    const cells = questions
      .map((question) => ({ question, cell: study.grid[participant.id]?.[question.id] }))
      .filter(({ cell }) => cell && (cell.summary || cell.quotes.length))
      .map(({ question, cell }) => `  • ${question.text}: ${cell!.summary} ${cell!.quotes.map((quote) => `“${quote.text}”`).join(" ")}`);
    const notes = study.observations.filter((observation) => observation.participantId === participant.id).map((observation) => `  • Researcher note: ${observation.note}`);
    let evidence = [...cells, ...notes].join("\n");
    if (!evidence) {
      const transcript = transcripts[participant.id];
      evidence = transcript ? transcriptToText(transcript.lines).slice(0, Math.floor(80_000 / members.length)) : "(no data yet)";
    }
    return `[${participant.id}] ${participantLabel(study, participant.id)}\n${evidence}`;
  }).join("\n\n");
  const others = study.segments.filter((entry) => entry.id !== segment.id).map((entry) => entry.name).join(", ");

  const result = await chatJson<{ recurring?: string[]; differences?: string; contradictions?: string; explore?: string; excerpts?: { participantId?: string; text?: string }[] }>(llm, RESEARCH_PRINCIPLES,
    `${studyContext(study)}

Segment: ${segment.name}${segment.description ? ` — ${segment.description}` : ""}
Other segments in the study: ${others || "none"}

Evidence for each respondent in this segment:
${memberEvidence.slice(0, 150_000)}

Write a cumulative view of this segment:
- recurring: 3–6 short theme labels that recur across respondents
- differences: how respondents within this segment differ, and how the segment seems distinct from the others (only where evidence supports it)
- contradictions: outliers or tensions in what they said
- explore: open questions worth probing in remaining fieldwork or analysis
- excerpts: 3–5 verbatim quotes that best represent the segment, each with the respondent's id in square brackets above
Return {"recurring":[],"differences":"","contradictions":"","explore":"","excerpts":[{"participantId":"","text":""}]}`);

  const excerpts = (result.excerpts ?? []).filter((excerpt) => excerpt.text && members.some((member) => member.id === excerpt.participantId)).map((excerpt) => {
    const lines = transcripts[excerpt.participantId!]?.lines ?? [];
    const gridQuotes = questions.flatMap((question) => study.grid[excerpt.participantId!]?.[question.id]?.quotes ?? []);
    const [verified] = verifyQuotes([{ text: excerpt.text! }], lines);
    const fromGrid = gridQuotes.find((quote) => quote.text.trim() === excerpt.text!.trim());
    return {
      participantId: excerpt.participantId!,
      text: excerpt.text!.trim(),
      time: verified.verified ? verified.time : fromGrid?.time ?? null,
      verified: verified.verified || Boolean(fromGrid?.verified),
    };
  });

  return {
    recurring: (result.recurring ?? []).filter((item) => typeof item === "string"),
    differences: result.differences ?? "",
    contradictions: result.contradictions ?? "",
    explore: result.explore ?? "",
    excerpts,
    source: "ai",
    updatedAt: nowIso(),
  };
}

// ---------------------------------------------------------------------------
// Inference and topline
// ---------------------------------------------------------------------------

export async function suggestClusters(llm: LlmSettings, study: Study) {
  if (study.observations.length < 2) throw new HttpError(400, "Log at least two observations first.");
  const result = await chatJson<{ clusters?: { title?: string; thought?: string; observationIds?: string[] }[] }>(llm, RESEARCH_PRINCIPLES,
    `${studyContext(study)}

These are the researcher's observations:
${study.observations.map((observation) => `[${observation.id}] (${participantLabel(study, observation.participantId)}${observation.code ? `, code: ${observation.code}` : ""}) ${observation.note}${observation.quote ? ` — “${observation.quote}”` : ""}`).join("\n")}

Suggest 2–7 clusters that group observations sharing an underlying idea. For each: a short title, a one-sentence "thought" stating the insight in the researcher's voice, and the observation ids it contains. An observation may be left out if it fits nowhere.
Return {"clusters":[{"title":"","thought":"","observationIds":[]}]}`);
  const valid = new Set(study.observations.map((observation) => observation.id));
  return (result.clusters ?? [])
    .map((cluster) => ({ title: String(cluster.title ?? "Cluster"), thought: String(cluster.thought ?? ""), observationIds: (cluster.observationIds ?? []).filter((id) => valid.has(id)) }))
    .filter((cluster) => cluster.observationIds.length);
}

export async function draftTopline(llm: LlmSettings, study: Study) {
  const clusterText = study.clusters.map((cluster) => `- ${cluster.title}: ${cluster.thought} (${cluster.observationIds.length} observations)`).join("\n");
  const segmentText = study.segments.map((segment) => {
    const report = study.segmentReports[segment.id];
    return report ? `- ${segment.name}: themes ${report.recurring.join(", ")}. ${report.differences}` : "";
  }).filter(Boolean).join("\n");
  const rows = allQuestions(study.guide).map((question) => study.rowSynthesis[question.id] ? `- ${question.text}: ${study.rowSynthesis[question.id]}` : "").filter(Boolean).join("\n");
  if (!clusterText && !segmentText && !rows) throw new HttpError(400, "Build some clusters, segment views or row syntheses first — the topline is drafted from your analysis.");

  const result = await chatJson<{ title?: string; intro?: string; body?: string }>(llm, RESEARCH_PRINCIPLES,
    `${studyContext(study)}

The researcher's synthesis so far:
Clusters (insights):
${clusterText || "(none)"}

Segment views:
${segmentText || "(none)"}

Across-respondent findings by question:
${rows || "(none)"}

Draft a topline report the researcher will edit:
- title: a crisp headline insight
- intro: a 2–3 sentence executive summary
- body: markdown with "## " sections that answer each study objective, then "## Implications" and "## Areas for further exploration". Ground every point in the synthesis above; do not add facts.
Return {"title":"","intro":"","body":""}`, 12_000);
  return { title: (result.title ?? "").trim(), intro: (result.intro ?? "").trim(), body: (result.body ?? "").trim() };
}

