import type { Study, Transcript } from "../shared/types";
import { emptyStudy, makeId, newSegment, nowIso, parseTime } from "../shared/util";

/** The illustrative "New Beverage Category" study, for exploring the workflow. Not real research. */
export function sampleStudy(): { study: Study; transcripts: Transcript[] } {
  const study = emptyStudy("Sample · New Beverage Category");
  study.design = {
    ...study.design,
    client: "Example client (illustrative)",
    objectives: "- Understand how people discover and decide to try a new beverage category\n- Identify the barriers to first trial for each segment\n- Find the signals that make an unfamiliar choice feel safe",
    methodology: "4 in-depth interviews (IDIs), 60 minutes, video call",
    markets: "Mumbai, Delhi, Bengaluru, Pune",
    languages: "English, Hinglish",
  };
  const names = ["Loyalists", "Flirters", "Competitor users", "Non-users"];
  const descriptions = ["Drink the category weekly and stick to one brand", "Try new options occasionally", "Regular users of a competing brand", "Do not buy the category"];
  study.segments = names.map((name, index) => newSegment(name, index, { description: descriptions[index], quota: 1 }));

  study.guide = [
    { id: makeId("g"), title: "Warm-up", questions: [{ id: makeId("q"), text: "Tell me a little about yourself and a typical day." }] },
    { id: makeId("g"), title: "Discovery", questions: [
      { id: makeId("q"), text: "How do you usually come across new drinks or brands?" },
      { id: makeId("q"), text: "Whose opinion matters when deciding whether to try something new? — Probe: friends, family, influencers, ads" },
    ] },
    { id: makeId("g"), title: "Barriers to trial", questions: [
      { id: makeId("q"), text: "What makes you hesitate before trying something unfamiliar?" },
      { id: makeId("q"), text: "What would make it feel safe to try?" },
    ] },
  ];

  const people = [
    { code: "P17", name: "Aarav", city: "Mumbai", age: 28, seg: 0, gender: "Male" },
    { code: "P09", name: "Maya", city: "Delhi", age: 25, seg: 1, gender: "Female" },
    { code: "P12", name: "Rehan", city: "Bengaluru", age: 32, seg: 2, gender: "Male" },
    { code: "P04", name: "Isha", city: "Pune", age: 23, seg: 3, gender: "Female" },
  ];
  study.participants = people.map((person) => ({
    id: makeId("p"),
    code: person.code,
    name: person.name,
    segmentId: study.segments[person.seg].id,
    city: person.city,
    age: person.age,
    gender: person.gender,
    sessionType: "IDI",
    sessionDate: "",
    notes: "",
    media: [],
  }));

  const raw: Record<string, [string, string, string][]> = {
    P17: [
      ["00:30", "Moderator", "To start, how do you usually come across new drinks?"],
      ["14:03", "Aarav", "I usually discover things through people first. If somebody I know is already using it, it gives me a reason to pay attention."],
      ["14:21", "Aarav", "I'd rather see someone I actually know using it. Otherwise it feels a bit like a brand trying to convince me."],
      ["22:08", "Aarav", "I don't want to waste money on something I don't know I'll like. I think the social proof makes that feel safer."],
      ["30:19", "Aarav", "When someone tells me they used it and liked it, I don't need the brand to work that hard."],
      ["35:41", "Aarav", "I don't think that means I'm never interested in something new. It just means I want somebody else to go first."],
    ],
    P09: [
      ["09:42", "Maya", "Usually my friends tell me what is worth trying first."],
      ["12:18", "Maya", "I'll try it once if it looks interesting enough. Packaging bahut matter karta hai for me."],
    ],
    P12: [
      ["16:13", "Rehan", "If someone I know has had it, it feels less like an ad."],
      ["24:11", "Rehan", "I need to know why I should leave what already works."],
    ],
    P04: [
      ["07:13", "Isha", "I don't really know anyone who buys it."],
      ["19:02", "Isha", "It feels like something made for someone else."],
    ],
  };
  const transcripts: Transcript[] = study.participants.map((participant) => ({
    participantId: participant.id,
    source: "import",
    language: "en",
    updatedAt: nowIso(),
    lines: (raw[participant.code] ?? []).map(([time, speaker, text]) => ({ id: makeId("l"), start: parseTime(time), end: null, speaker, text })),
  }));

  const byCode = (code: string) => study.participants.find((participant) => participant.code === code)!.id;
  const observation = (code: string, label: string, note: string, quote: string, time: string, x: number, y: number) => ({
    id: makeId("o"), participantId: byCode(code), questionId: null, code: label, note, quote, time: parseTime(time), x, y,
  });
  study.observations = [
    observation("P17", "Social validation", "People trust peer recommendation more than brand recommendation.", "I'd rather see someone I actually know using it.", "14:21", 40, 40),
    observation("P17", "Risk avoidance", "Trying something unfamiliar feels like a financial and social risk.", "I don't want to waste money on something I don't know I'll like.", "22:08", 300, 40),
    observation("P09", "Discovery", "Friends act as a filter for new options before the participant looks for brands.", "Usually my friends tell me what is worth trying first.", "09:42", 40, 260),
    observation("P12", "Credibility", "Familiarity with another person's experience gives the recommendation credibility.", "If someone I know has had it, it feels less like an ad.", "16:13", 300, 260),
  ];
  const [o1, o2, o3, o4] = study.observations;
  study.clusters = [
    { id: makeId("c"), title: "Social reassurance", thought: "People use other people's experiences to reduce the perceived risk of trying something unfamiliar.", observationIds: [o1.id, o3.id, o4.id], x: 600, y: 40 },
    { id: makeId("c"), title: "Risk avoidance", thought: "Unfamiliar choices are evaluated through signals that make the decision feel safer and more credible.", observationIds: [o2.id], x: 600, y: 300 },
  ];
  study.connections = [{ id: makeId("r"), from: { kind: "cluster", id: study.clusters[0].id }, to: { kind: "cluster", id: study.clusters[1].id }, note: "reduces perceived risk" }];
  study.topline = {
    title: "The role of social proof in trial",
    intro: "The category is not discovered in isolation. Familiarity, social proof and the lived experience of other people make unfamiliar choices feel safer — and more credible.",
    blocks: [study.clusters[0].id],
    body: "## Implications\n\nThe implication is that…",
  };
  return { study, transcripts };
}
