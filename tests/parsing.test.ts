import { describe, expect, it } from "vitest";
import { segmentsToLines } from "../server/transcribe";
import { parseJsonLoose } from "../server/ai";
import { allQuestions, formatTime, parseCsv, parseDiscussionGuide, parseTime, parseTranscript, verifyQuotes } from "../shared/util";

describe("time helpers", () => {
  it("parses and formats timestamps", () => {
    expect(parseTime("01:05")).toBe(65);
    expect(parseTime("1:02:03")).toBe(3723);
    expect(parseTime("00:00:01,500")).toBe(1.5);
    expect(parseTime("hello")).toBeNull();
    expect(formatTime(3723)).toBe("1:02:03");
    expect(formatTime(65)).toBe("01:05");
    expect(formatTime(null)).toBe("");
  });
});

describe("parseTranscript", () => {
  it("reads SRT cues with multi-line text", () => {
    const lines = parseTranscript("1\n00:00:01,000 --> 00:00:04,000\nModerator: Hello\nthere\n\n2\n00:00:05,000 --> 00:00:07,000\nHi!\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ start: 1, end: 4, speaker: "Moderator", text: "Hello there" });
    expect(lines[1]).toMatchObject({ start: 5, speaker: "Moderator", text: "Hi!" });
  });

  it("reads WebVTT voice tags", () => {
    const lines = parseTranscript("WEBVTT\n\n00:01.000 --> 00:03.000\n<v Respondent>Main roz chai peeta hoon</v>\n");
    expect(lines[0]).toMatchObject({ start: 1, speaker: "Respondent", text: "Main roz chai peeta hoon" });
  });

  it("reads timestamped lines with speakers", () => {
    const lines = parseTranscript("[00:12] Mod: How often?\n00:15 R: Daily, yaar.\n(01:02:03) Speaker 1 - later");
    expect(lines.map((l) => [l.start, l.speaker, l.text])).toEqual([[12, "Mod", "How often?"], [15, "R", "Daily, yaar."], [3723, "Speaker 1", "later"]]);
  });

  it("reads CSV with a speaker column", () => {
    const lines = parseTranscript('time,speaker,text\n00:10,Moderator,"Hello, welcome"\n00:20,Respondent,Thanks');
    expect(lines.map((l) => [l.start, l.speaker, l.text])).toEqual([[10, "Moderator", "Hello, welcome"], [20, "Respondent", "Thanks"]]);
  });

  it("keeps untimed Word-style transcripts and carries speakers forward", () => {
    const lines = parseTranscript("Moderator: Tell me about snacks.\nRespondent: I love namkeen.\nEspecially in the evening.\nWell - it depends.");
    expect(lines.map((l) => [l.start, l.speaker, l.text])).toEqual([
      [null, "Moderator", "Tell me about snacks."],
      [null, "Respondent", "I love namkeen."],
      [null, "Respondent", "Especially in the evening."],
      [null, "Respondent", "Well - it depends."],
    ]);
  });
});

describe("parseDiscussionGuide", () => {
  it("finds sections, questions and probes and drops instructions", () => {
    const guide = parseDiscussionGuide([
      "SECTION A: WARM UP (5 mins)",
      "1. Tell me about yourself.",
      "MODERATOR NOTE: build rapport",
      "Section B - Habits",
      "2. When do you snack?",
      "   Probe: time of day",
      "• Which brands and why?",
      "Thank respondent and close",
    ].join("\n"));
    expect(guide.map((s) => s.title)).toEqual(["SECTION A: WARM UP (5 mins)", "Section B - Habits"]);
    expect(allQuestions(guide).map((q) => q.text)).toEqual([
      "Tell me about yourself.",
      "When do you snack? — Probe: time of day",
      "Which brands and why?",
    ]);
  });

  it("creates a General section when there are no headings", () => {
    const guide = parseDiscussionGuide("What do you eat?\nWhy?");
    expect(guide).toHaveLength(1);
    expect(guide[0].title).toBe("General");
  });
});

describe("verifyQuotes", () => {
  const lines = parseTranscript("[00:10] R: Mostly Haldiram's, because the taste is consistent.\n[00:20] R: Naya brand tabhi try karunga jab koi dost recommend kare.");
  it("verifies exact and trimmed quotes and attaches the timestamp", () => {
    const [exact, trimmed, fake] = verifyQuotes([
      { text: "the taste is consistent" },
      { text: "Naya brand tabhi try karunga … dost recommend kare" },
      { text: "I never said this" },
    ], lines);
    expect(exact).toMatchObject({ verified: true, time: 10 });
    expect(trimmed).toMatchObject({ verified: true, time: 20 });
    expect(fake).toMatchObject({ verified: false, time: null });
  });
});

describe("parseCsv", () => {
  it("handles quotes, commas and newlines inside cells", () => {
    expect(parseCsv('a,b\n"x, y","line1\nline2"\n')).toEqual([["a", "b"], ["x, y", "line1\nline2"]]);
  });
});

describe("segmentsToLines", () => {
  it("merges same-speaker fragments but keeps unlabelled sentences apart", () => {
    const labelled = segmentsToLines([
      { start: 0, end: 2, text: "Hello", speaker: "Speaker A" },
      { start: 2.5, end: 4, text: "and welcome.", speaker: "Speaker A" },
      { start: 4.5, end: 6, text: "Thanks.", speaker: "Speaker B" },
    ]);
    expect(labelled.map((l) => l.text)).toEqual(["Hello and welcome.", "Thanks."]);
    const plain = segmentsToLines([
      { start: 0, end: 3, text: "This is a full sentence from whisper output." },
      { start: 3.2, end: 6, text: "Another complete sentence follows here." },
    ]);
    expect(plain).toHaveLength(2);
  });
});

describe("parseJsonLoose", () => {
  it("tolerates fences and prose around JSON", () => {
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonLoose('Sure! {"a":2} Hope that helps')).toEqual({ a: 2 });
    expect(parseJsonLoose("nope")).toBeUndefined();
  });
});
