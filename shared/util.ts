import type { GuideSection, Quote, Segment, Study, TranscriptLine } from "./types";

export const SEGMENT_COLORS = ["#2f6b57", "#b4643c", "#5b5fa8", "#a8456b", "#7a7a2e", "#2f7d99", "#8c5a2b", "#5e7f3a"];

export function makeId(prefix = "") {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}${Date.now().toString(36)}${random}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function formatTime(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "";
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Parses "mm:ss", "h:mm:ss", "hh:mm:ss,ms" or "mm:ss.ms" into seconds. */
export function parseTime(value: string): number | null {
  const match = value.trim().match(/^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})(?:[.,](\d{1,3}))?$/);
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const fraction = match[4] ? Number(`0.${match[4]}`) : 0;
  return hours * 3600 + minutes * 60 + seconds + fraction;
}

export function emptyStudy(name: string): Study {
  const now = nowIso();
  return {
    id: makeId("s"),
    name,
    createdAt: now,
    updatedAt: now,
    design: {
      client: "",
      objectives: "",
      background: "",
      methodology: "",
      markets: "",
      languages: "",
      briefText: "",
      screenerText: "",
      guideText: "",
    },
    segments: [],
    guide: [],
    participants: [],
    grid: {},
    rowSynthesis: {},
    segmentReports: {},
    observations: [],
    clusters: [],
    connections: [],
    topline: { title: name, intro: "", blocks: [], body: "" },
  };
}

export function newSegment(name: string, index: number, extra: Partial<Segment> = {}): Segment {
  return {
    id: makeId("seg"),
    name,
    description: "",
    criteria: "",
    quota: null,
    color: SEGMENT_COLORS[index % SEGMENT_COLORS.length],
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Transcript parsing
// ---------------------------------------------------------------------------

const KNOWN_SPEAKER = /^((?:moderator|mod|interviewer|int|facilitator|respondent|resp|participant|r\d*|m|p\d*|speaker\s*\d+|spk\s*\d+))\s*[:\-–—]\s+(.+)$/i;
const NAMED_SPEAKER = /^([A-Z][A-Za-z.']{0,20}(?:\s[A-Z][A-Za-z.']{0,20})?)\s*:\s+(.+)$/;

function splitSpeaker(text: string): { speaker: string; text: string } {
  const vtt = text.match(/^<v(?:\.[^\s>]+)?\s+([^>]+)>(.*?)(?:<\/v>)?$/i);
  if (vtt) return { speaker: vtt[1].trim(), text: vtt[2].trim() };
  const match = text.match(KNOWN_SPEAKER) ?? text.match(NAMED_SPEAKER);
  if (match) return { speaker: match[1].trim(), text: match[2].trim() };
  return { speaker: "", text };
}

function cleanCueText(text: string) {
  return text.replace(/<(?!v[\s.])[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Accepts SRT, WebVTT, timestamped text ("00:12 text", "[00:01:12] Mod: text"),
 * simple CSV ("time,text" or "time,speaker,text") and untimed text/Word transcripts
 * where each paragraph optionally starts with a speaker label.
 */
export function parseTranscript(contents: string): TranscriptLine[] {
  const raw = contents.replace(/^﻿/, "").replace(/\r/g, "");
  const lines = raw.split("\n");
  const result: TranscriptLine[] = [];
  const push = (start: number | null, end: number | null, speaker: string, text: string) => {
    const cleaned = text.trim();
    if (cleaned) result.push({ id: makeId("l"), start, end, speaker, text: cleaned });
  };

  // SRT / VTT cues
  if (/-->/.test(raw)) {
    for (let i = 0; i < lines.length; i += 1) {
      const cue = lines[i].match(/((?:\d{1,2}:)?\d{1,3}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{1,3}:\d{2}[.,]\d{1,3})/);
      if (!cue) continue;
      const textLines: string[] = [];
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== "" && !/-->/.test(lines[j])) {
        textLines.push(lines[j].trim());
        j += 1;
      }
      const joined = textLines.join(" ");
      const { speaker, text } = splitSpeaker(joined);
      push(parseTime(cue[1]), parseTime(cue[2]), speaker, cleanCueText(text));
      i = j - 1;
    }
    if (result.length) return mergeSpeakerLess(result);
  }

  let lastSpeaker = "";
  for (const original of lines) {
    const line = original.trim();
    if (!line || /^WEBVTT/i.test(line) || /^\d+$/.test(line)) continue;
    if (/^"?(timestamp|time|start|timecode)"?\s*[,;\t]/i.test(line)) continue;

    const csv = line.match(/^"?(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)"?\s*[,\t]\s*(.+)$/);
    if (csv) {
      const cells = splitCsvRow(csv[2]);
      const time = parseTime(csv[1].replace(",", "."));
      if (cells.length >= 2) {
        push(time, null, cells[0], cells.slice(1).join(", "));
        lastSpeaker = cells[0];
      } else {
        const { speaker, text } = splitSpeaker(cells[0] ?? "");
        if (speaker) lastSpeaker = speaker;
        push(time, null, speaker || lastSpeaker, text);
      }
      continue;
    }

    const timed = line.match(/^[[(]?((?:\d{1,2}:)?\d{1,3}:\d{2}(?:[.,]\d+)?)[\])]?\s*[-–—:]?\s*(.*)$/);
    if (timed) {
      const { speaker, text } = splitSpeaker(timed[2]);
      if (speaker) lastSpeaker = speaker;
      push(parseTime(timed[1].replace(",", ".")), null, speaker || lastSpeaker, text);
      continue;
    }

    // Speaker label then timestamp: "Moderator (00:12): text" / "Mod [00:12] text"
    const labelled = line.match(/^([^:[(]{1,24})\s*[[(]((?:\d{1,2}:)?\d{1,3}:\d{2})[\])]\s*[:\-–—]?\s*(.+)$/);
    if (labelled) {
      lastSpeaker = labelled[1].trim();
      push(parseTime(labelled[2]), null, lastSpeaker, labelled[3]);
      continue;
    }

    const { speaker, text } = splitSpeaker(line);
    if (speaker) lastSpeaker = speaker;
    push(null, null, speaker || lastSpeaker, text);
  }
  return result;
}

function mergeSpeakerLess(lines: TranscriptLine[]) {
  let last = "";
  return lines.map((line) => {
    if (line.speaker) last = line.speaker;
    return line.speaker ? line : { ...line, speaker: last };
  });
}

export function splitCsvRow(row: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < row.length; i += 1) {
    const ch = row[i];
    if (quoted) {
      if (ch === '"' && row[i + 1] === '"') { current += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else current += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === "," || ch === "\t") { cells.push(current.trim()); current = ""; }
    else current += ch;
  }
  cells.push(current.trim());
  return cells;
}

export function parseCsv(contents: string): string[][] {
  const text = contents.replace(/^﻿/, "").replace(/\r/g, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell.trim()); cell = ""; }
    else if (ch === "\n") { row.push(cell.trim()); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows.filter((r) => r.some((c) => c));
}

export function transcriptToText(lines: TranscriptLine[]) {
  return lines.map((line) => {
    const time = line.start === null ? "" : `[${formatTime(line.start)}] `;
    const speaker = line.speaker ? `${line.speaker}: ` : "";
    return `${time}${speaker}${line.text}`;
  }).join("\n");
}

// ---------------------------------------------------------------------------
// Discussion guide parsing (heuristic, used when no AI is connected)
// ---------------------------------------------------------------------------

const INSTRUCTION = /^(mod(erator)?\.?\s*(note|instruction)s?|note|instruction|interviewer note|show card|show stimulus|time check|thank (the )?(respondent|participant)|close)\b/i;

export function parseDiscussionGuide(text: string): GuideSection[] {
  const sections: GuideSection[] = [];
  let current: GuideSection | null = null;
  let lastIndent = 0;

  const ensureSection = () => {
    if (!current) {
      current = { id: makeId("g"), title: "General", questions: [] };
      sections.push(current);
    }
    return current;
  };

  for (const rawLine of text.replace(/\r/g, "").split("\n")) {
    if (!rawLine.trim()) continue;
    const indent = rawLine.match(/^[\t ]*/)?.[0].replace(/\t/g, "    ").length ?? 0;
    const line = rawLine.trim();
    const stripped = line.replace(/^(?:[-•*●○▪◦]|\d+(?:\.\d+)*[.)]?|[a-z][.)]|\(?[ivx]+[.)])\s+/i, "").trim();
    if (!stripped) continue;

    const letters = stripped.replace(/[^A-Za-z]/g, "");
    const isAllCaps = letters.length >= 4 && letters === letters.toUpperCase();
    const isHeading =
      /^#{1,6}\s/.test(line) ||
      /^(section|part|module|phase|block|chapter)\s*[\dIVX]*\b/i.test(line) ||
      /^[IVX]+[.)]\s/.test(line) ||
      /^[A-Z][.)]\s/.test(line) ||
      (/\(\s*\d+\s*-?\s*\d*\s*(min|mins|minutes)\s*\)/i.test(stripped) && !stripped.includes("?")) ||
      (isAllCaps && stripped.length < 90 && !stripped.includes("?")) ||
      (/:$/.test(stripped) && stripped.length < 70 && !stripped.includes("?"));

    if (isHeading) {
      current = { id: makeId("g"), title: stripped.replace(/^#+\s*/, "").replace(/:$/, "").trim(), questions: [] };
      sections.push(current);
      lastIndent = 0;
      continue;
    }
    if (INSTRUCTION.test(stripped)) continue;

    const section = ensureSection();
    const isProbe = /^probes?\b[:\s-]*/i.test(stripped);
    const previous = section.questions[section.questions.length - 1];
    if (previous && (isProbe || (indent > lastIndent && indent >= 4))) {
      const probe = stripped.replace(/^probes?\b[:\s-]*/i, "").trim();
      if (probe) previous.text += previous.text.includes("Probe:") ? `; ${probe}` : ` — Probe: ${probe}`;
      continue;
    }
    section.questions.push({ id: makeId("q"), text: stripped });
    lastIndent = indent;
  }

  return sections.filter((section) => section.questions.length);
}

export function allQuestions(guide: GuideSection[]) {
  return guide.flatMap((section) => section.questions.map((question) => ({ ...question, sectionId: section.id, sectionTitle: section.title })));
}

// ---------------------------------------------------------------------------
// Quote verification: AI quotes must be traceable to the transcript
// ---------------------------------------------------------------------------

function normalize(value: string) {
  return value.toLowerCase().normalize("NFKC").replace(/[\p{P}\p{S}]/gu, " ").replace(/\s+/g, " ").trim();
}

/** Returns the matching line (for its timestamp) if the quote appears in the transcript. */
export function locateQuote(quote: string, lines: TranscriptLine[]): TranscriptLine | null | undefined {
  const target = normalize(quote.replace(/\.\.\.|…/g, " "));
  if (target.length < 4) return undefined;
  // Check fragments split on ellipses individually: quotes are often trimmed.
  const fragments = quote.split(/\.\.\.|…/).map(normalize).filter((part) => part.length >= 4);
  if (!fragments.length) return undefined;
  const normalizedLines = lines.map((line) => normalize(line.text));
  // Prefer a quote that sits within one line…
  for (let i = 0; i < lines.length; i += 1) {
    if (fragments.every((fragment) => normalizedLines[i].includes(fragment))) return lines[i];
  }
  // …otherwise allow it to run across up to three consecutive lines, anchored where it starts.
  const head = fragments[0].split(" ").slice(0, 4).join(" ");
  for (let i = 0; i < lines.length; i += 1) {
    if (!normalizedLines[i].includes(head)) continue;
    const window = [normalizedLines[i], normalizedLines[i + 1] ?? "", normalizedLines[i + 2] ?? ""].join(" ");
    if (fragments.every((fragment) => window.includes(fragment))) return lines[i];
  }
  return undefined;
}

export function verifyQuotes(quotes: { text: string; time?: number | null; translation?: string }[], lines: TranscriptLine[]): Quote[] {
  return quotes
    .filter((quote) => quote && typeof quote.text === "string" && quote.text.trim())
    .map((quote) => {
      const line = locateQuote(quote.text, lines);
      return {
        text: quote.text.trim(),
        translation: (quote.translation ?? "").trim(),
        time: line ? line.start : (typeof quote.time === "number" ? quote.time : null),
        verified: Boolean(line),
      };
    });
}
