import type { Cluster, GridCell, Observation, Study, Transcript, TranscriptLine } from "../shared/types";
import { emptyStudy, makeId, newSegment, nowIso, parseTime } from "../shared/util";

// A fully worked demo study with FICTIONAL data, so every feature can be tried without real files.
// It mirrors the files in examples/ (with slightly longer transcripts).

type Raw = [time: string | null, speaker: string, text: string];

const TRANSCRIPTS: Record<string, Raw[]> = {
  R01: [
    ["00:00:20", "Moderator", "Namaste Priya ji. Apne baare mein thoda bataiye."],
    ["00:00:31", "Respondent", "Main Lucknow mein rehti hoon, joint family hai, office se six baje tak aa jaati hoon."],
    ["00:03:05", "Moderator", "Kal shaam ki chai ke baare mein bataiye."],
    ["00:03:12", "Respondent", "Chai toh saas banati hain, aur saath mein namkeen zaroor hota hai. Bina namkeen ke chai adhoori lagti hai."],
    ["00:05:40", "Moderator", "Snacks ka us waqt kya role hai?"],
    ["00:05:48", "Respondent", "Woh family ka time hai. Sab saath baithte hain, din ki baatein hoti hain, aur namkeen beech mein rakha hota hai."],
    ["00:09:40", "Moderator", "Kaunsa brand lete hain?"],
    ["00:09:47", "Respondent", "Mostly Haldiram's. Taste consistent hai and the kids also like it. Loose wala kabhi kabhi halwai se."],
    ["00:21:02", "Moderator", "Naya kuch try karne ka decision kaise lete hain?"],
    ["00:21:10", "Respondent", "Agar padosan ya office mein koi recommend kare, tab try karti hoon. Ad dekh ke nahi."],
    ["00:34:30", "Moderator", "Is baked snack ke baare mein pehli reaction?"],
    ["00:34:41", "Respondent", "Baked achha lagta hai health ke liye, but mujhe doubt hai ki crunchy hoga ya nahi. Price bhi dekhna padega."],
    ["00:41:15", "Moderator", "Kya cheez aapko rokegi, aur kya try karwayegi?"],
    ["00:41:22", "Respondent", "Agar sample mil jaaye ya chhota pack ho dus-bees rupaye ka, toh try kar lungi. Bada pack seedha nahi lungi."],
  ],
  // Untimed, as many vendor Word transcripts are.
  R02: [
    [null, "Moderator", "Arjun ji, apne baare mein bataiye."],
    [null, "Respondent", "Delhi mein rehta hoon, wife aur do bachche. Shaam ko saat baje tak ghar aa jaata hoon."],
    [null, "Moderator", "Shaam ki chai mein aap kya khaate hain?"],
    [null, "Respondent", "Bhujia ya mathri. Weekend pe samosa bhi aa jaata hai market se."],
    [null, "Moderator", "Chai ke saath snack kyun zaroori hai?"],
    [null, "Respondent", "Thakaan utarti hai. Mere liye chai ke saath tasty chahiye, healthy baad mein."],
    [null, "Moderator", "Brand choose kaise karte hain?"],
    [null, "Respondent", "Jo dukaan wala de de, usually Bikaji ya Haldiram's. Honestly brand se zyada fresh hona matter karta hai."],
    [null, "Moderator", "Naya snack kab try karte hain?"],
    [null, "Respondent", "Jab dukaan wala bole ki naya aaya hai, ya bachche ad dekh ke maange."],
    [null, "Moderator", "Baked snack ka concept dekh ke kya lagta hai?"],
    [null, "Respondent", "Baked matlab diet wala lagta hai. Taste pe shak hai."],
    [null, "Moderator", "Kya cheez try karwayegi?"],
    [null, "Respondent", "Agar dukaan pe chakhne ko mile. Warna main apna purana wala hi lunga."],
  ],
  R03: [
    ["00:01:02", "Moderator", "Kavya, tell me about your evenings."],
    ["00:01:10", "Kavya", "I get home by seven. Filter coffee, not chai, and maybe some murukku if my mother has made it."],
    ["00:06:30", "Moderator", "What role do snacks play at that time?"],
    ["00:06:41", "Kavya", "It's my break before cooking. Something small, but I feel guilty if it's fried every day."],
    ["00:12:30", "Moderator", "Do you buy packaged snacks?"],
    ["00:12:38", "Kavya", "Rarely. I check the label for palm oil. If it is baked and has less salt, I might try it."],
    ["00:19:05", "Moderator", "How do you decide to try something new?"],
    ["00:19:12", "Kavya", "Instagram reels and reviews, honestly. If a nutritionist I follow mentions it, I'll look for it."],
    ["00:30:15", "Moderator", "What is your first reaction to this baked snack?"],
    ["00:30:24", "Kavya", "Interesting. But the pack looks very North Indian, I'm not sure it is meant for us."],
    ["00:36:50", "Moderator", "What would stop you, and what would make you try it?"],
    ["00:37:02", "Kavya", "South Indian flavours like curry leaf or pepper would make me try it. Too much masala would stop me."],
  ],
  R04: [
    ["00:00:15", "Moderator", "Senthil sir, unga family, work pathi sollunga."],
    ["00:00:24", "Senthil", "I work in a textile mill, two children in school. I reach home by six thirty."],
    ["00:03:40", "Moderator", "Evening snacks pathi sollunga."],
    ["00:03:48", "Senthil", "Evening tea with biscuits, sometimes bajji from the shop near the bus stand."],
    ["00:08:20", "Moderator", "What does that tea time mean for you?"],
    ["00:08:29", "Senthil", "It is the only time I sit with the kids before their homework."],
    ["00:15:40", "Moderator", "Do you buy namkeen brands?"],
    ["00:15:47", "Senthil", "Not much. Local mixture is cheaper and fresher. Brands are for when guests come."],
    ["00:22:10", "Moderator", "When do you try something new?"],
    ["00:22:18", "Senthil", "When there is an offer in the supermarket. Buy one get one, then I try."],
    ["00:31:05", "Moderator", "Baked snack concept – first reaction?"],
    ["00:31:12", "Senthil", "Kids may like it. If price is below thirty rupees I will try once."],
    ["00:38:40", "Moderator", "Enna thadai, enna try panna vaikkum?"],
    ["00:38:49", "Senthil", "If it tastes like our mixture, fine. If it is like diet food, the kids will not eat it."],
  ],
};

const GUIDE: [string, string[]][] = [
  ["A. Introduction and warm-up (5 mins)", ["Please introduce yourself – family, work, a typical weekday evening."]],
  ["B. The evening chai ritual (15 mins)", [
    "Walk me through your last evening tea time. Who was there, what did you eat? — Probe: time, place, who prepares; weekday vs weekend",
    "What role do snacks play at that moment?",
  ]],
  ["C. Brand choice (15 mins)", [
    "Which snacks and brands do you buy for tea time, and why those? — Probe: packaged vs loose / halwai",
    "How do you decide when trying something new?",
  ]],
  ["D. New baked snack concept (15 mins)", [
    "What is your first reaction to this baked snack?",
    "What would stop you from buying it? What would make you try it?",
  ]],
];

// [summary, [quote, translation?][], status?] per participant, per question (in guide order).
type Cell = [string, [string, string?][], GridCell["status"]?] | null;
const GRID: Record<string, Cell[]> = {
  R01: [
    ["Lives in a joint family in Lucknow; home from the office by six.", [["Main Lucknow mein rehti hoon, joint family hai, office se six baje tak aa jaati hoon.", "I live in Lucknow in a joint family; I'm home from the office by six."]]],
    ["Her mother-in-law makes the evening chai; namkeen is always served with it.", [["Chai toh saas banati hain, aur saath mein namkeen zaroor hota hai.", "My mother-in-law makes the tea, and there's always namkeen with it."]]],
    ["Tea time is family time; the snack completes the ritual.", [["Bina namkeen ke chai adhoori lagti hai.", "Tea feels incomplete without namkeen."]]],
    ["Buys Haldiram's for consistent taste and because the kids like it; occasionally loose from the halwai.", [["Mostly Haldiram's. Taste consistent hai and the kids also like it.", "Mostly Haldiram's. The taste is consistent and the kids like it too."]], "ai"],
    ["Tries new things on personal recommendation, not advertising.", [["Agar padosan ya office mein koi recommend kare, tab try karti hoon. Ad dekh ke nahi.", "If a neighbour or someone at the office recommends it, I try it. Not from an ad."]]],
    ["Likes the health angle but doubts it will be crunchy; price will matter.", [["mujhe doubt hai ki crunchy hoga ya nahi", "I doubt whether it will be crunchy"]]],
    ["A sample or a small ₹10–20 pack would get her to try; she won't start with a big pack.", [["Agar sample mil jaaye ya chhota pack ho dus-bees rupaye ka, toh try kar lungi.", "If I get a sample or a small ₹10–20 pack, I'll try it."]]],
  ],
  R02: [
    ["Lives in Delhi with his wife and two children; home by seven.", []],
    ["Bhujia or mathri on weekdays; samosas from the market at weekends.", [["Bhujia ya mathri. Weekend pe samosa bhi aa jaata hai market se.", "Bhujia or mathri. At weekends samosas come from the market."]]],
    ["The snack is a way to unwind; taste comes before health.", [["Mere liye chai ke saath tasty chahiye, healthy baad mein.", "With tea I want something tasty; healthy comes later."]]],
    ["Takes whatever the shop offers (Bikaji or Haldiram's); freshness matters more than brand.", [["Honestly brand se zyada fresh hona matter karta hai.", "Honestly, being fresh matters more than the brand."]]],
    ["The shopkeeper and the children's requests drive trial.", [["Jab dukaan wala bole ki naya aaya hai, ya bachche ad dekh ke maange.", "When the shopkeeper says something new has come, or the kids ask after seeing an ad."]], "ai"],
    ["'Baked' reads as diet food; sceptical about taste.", [["Baked matlab diet wala lagta hai.", "Baked feels like diet food."]]],
    ["Would try only if he can taste it in the shop first.", [["Agar dukaan pe chakhne ko mile.", "If I can taste it at the shop."]]],
  ],
  R03: [
    ["Home by seven; drinks filter coffee rather than chai.", [["I get home by seven. Filter coffee, not chai, and maybe some murukku if my mother has made it."]]],
    // An AI draft whose quote is NOT in the transcript, to show the quote check.
    ["Evening drink is filter coffee, with home-made murukku when available.", [["I always have chai with biscuits in the evening."]], "ai"],
    ["A small break before cooking, with guilt about fried food.", [["I feel guilty if it's fried every day."]]],
    ["Rarely buys packaged snacks; reads labels for palm oil.", [["Rarely. I check the label for palm oil."]]],
    ["Discovers new products through Instagram reels and nutritionists she follows.", [["If a nutritionist I follow mentions it, I'll look for it."]]],
    ["Curious, but the pack feels North Indian — not 'for us'.", [["But the pack looks very North Indian, I'm not sure it is meant for us."]]],
    ["Southern flavours (curry leaf, pepper) would make her try; heavy masala would stop her.", [["South Indian flavours like curry leaf or pepper would make me try it."]]],
  ],
  R04: [
    ["Works in a textile mill; two school-age children; home by 6:30.", [["I work in a textile mill, two children in school."]]],
    ["Tea with biscuits, sometimes bajji from a shop near the bus stand.", [["Evening tea with biscuits, sometimes bajji from the shop near the bus stand."]]],
    ["Tea time is time with the children.", [["It is the only time I sit with the kids before their homework."]]],
    ["Prefers cheaper, fresher local mixture; brands are kept for guests.", [["Local mixture is cheaper and fresher. Brands are for when guests come."]]],
    ["Supermarket offers trigger trial.", [["When there is an offer in the supermarket. Buy one get one, then I try."]]],
    ["Kids may like it; would try once below ₹30.", [["If price is below thirty rupees I will try once."]]],
    ["Must taste like local mixture; 'diet food' would be rejected by the kids.", [["If it is like diet food, the kids will not eat it."]]],
  ],
};

export function sampleStudy(): { study: Study; transcripts: Transcript[] } {
  const study = emptyStudy("Demo · Tea-time snacking (fictional)");
  study.demo = true;
  study.design = {
    client: "Example Foods Pvt Ltd (fictional)",
    objectives: "- Understand the role of snacks in the evening chai ritual\n- Map how people choose between brands and loose/local options\n- Identify barriers and triggers for trying a new baked snack",
    background: "Example Foods sells packaged namkeen in North India and wants to understand evening tea-time snacking before launching a baked range in the South.",
    methodology: "4 in-depth interviews (IDIs), 60 minutes, in-home",
    markets: "Lucknow, Delhi, Chennai, Coimbatore",
    languages: "Hindi/Hinglish, Tamil/English",
    briefText: "Research brief (fictional): Example Foods wants to understand evening tea-time snacking before launching a baked namkeen range in South India.",
    screenerText: "S4. How often do you eat packaged namkeen with evening tea?\n5 or more days a week → Heavy snackers (quota 2)\n1–2 days a week or less → Light snackers (quota 2)",
    guideText: GUIDE.map(([title, questions]) => [`## ${title}`, ...questions.map((q, i) => `${i + 1}. ${q}`)].join("\n")).join("\n"),
  };
  const heavy = newSegment("Heavy snackers", 0, { description: "Packaged namkeen with tea 5+ days a week", criteria: "S4 = 5 or more days a week", quota: 2 });
  const light = newSegment("Light snackers", 1, { description: "Namkeen with tea 1–2 days a week or less", criteria: "S4 = 1–2 days a week or less", quota: 2 });
  study.segments = [heavy, light];
  study.guide = GUIDE.map(([title, questions]) => ({ id: makeId("g"), title, questions: questions.map((text) => ({ id: makeId("q"), text })) }));
  const questionIds = study.guide.flatMap((section) => section.questions.map((question) => question.id));

  const people = [
    { code: "R01", name: "Priya S.", segment: heavy, city: "Lucknow", age: 34, gender: "F", date: "2026-09-12", notes: "Joint family" },
    { code: "R02", name: "Arjun M.", segment: heavy, city: "Delhi", age: 41, gender: "M", date: "2026-09-13", notes: "" },
    { code: "R03", name: "Kavya R.", segment: light, city: "Chennai", age: 28, gender: "F", date: "2026-09-15", notes: "Health conscious" },
    { code: "R04", name: "Senthil K.", segment: light, city: "Coimbatore", age: 37, gender: "M", date: "2026-09-16", notes: "" },
  ];
  study.participants = people.map((person) => ({
    id: makeId("p"), code: person.code, name: person.name, segmentId: person.segment.id, city: person.city, age: person.age,
    gender: person.gender, sessionType: "IDI", sessionDate: person.date, notes: person.notes, media: [],
  }));
  const idOf = (code: string) => study.participants.find((participant) => participant.code === code)!.id;

  const transcripts: Transcript[] = study.participants.map((participant) => ({
    participantId: participant.id,
    source: "import",
    language: "",
    updatedAt: nowIso(),
    lines: TRANSCRIPTS[participant.code].map(([time, speaker, text]): TranscriptLine => ({ id: makeId("l"), start: time ? parseTime(time) : null, end: null, speaker, text })),
  }));
  const timeOf = (code: string, quote: string) => {
    const lines = transcripts.find((transcript) => transcript.participantId === idOf(code))!.lines;
    return lines.find((line) => line.text.includes(quote));
  };

  for (const [code, cells] of Object.entries(GRID)) {
    const row: Record<string, GridCell> = {};
    cells.forEach((cell, index) => {
      if (!cell) return;
      const [summary, quotes, status = "reviewed"] = cell;
      row[questionIds[index]] = {
        summary,
        status,
        updatedAt: nowIso(),
        quotes: quotes.map(([text, translation = ""]) => {
          const line = timeOf(code, text);
          return { text, translation, time: line?.start ?? null, verified: Boolean(line) };
        }),
      };
    });
    study.grid[idOf(code)] = row;
  }
  study.rowSynthesis = {
    [questionIds[2]]: "Tea time is social time: for most respondents the snack accompanies family time rather than hunger (R01, R04). Health guilt appears only among Light snackers (R03).",
    [questionIds[3]]: "Freshness and familiar taste beat brand. Heavy snackers in the North default to Haldiram's or Bikaji (R01, R02); Light snackers in the South lean on local mixture or check labels (R03, R04).",
    [questionIds[5]]: "'Baked' is read through a health lens: welcome to the health-conscious (R03) but a warning sign of 'diet food' for taste-first respondents (R02, R04). Crunch and price are the open questions.",
  };

  study.segmentReports = {
    [heavy.id]: {
      recurring: ["Chai ritual", "Familiar brands", "Taste first", "Word of mouth"],
      differences: "Both default to known brands, but R01 is loyal to Haldiram's for consistency while R02 cares more about freshness than the name. Compared with Light snackers, they talk about taste and habit, not health.",
      contradictions: "R01 likes the health angle of 'baked' but doubts the crunch; R02 dismisses 'baked' as diet food.",
      explore: "Would a sampling or ₹10 pack overcome the 'diet food' perception among taste-first families?",
      excerpts: [
        { participantId: idOf("R01"), text: "Bina namkeen ke chai adhoori lagti hai.", time: timeOf("R01", "Bina namkeen")?.start ?? null, verified: true },
        { participantId: idOf("R02"), text: "Baked matlab diet wala lagta hai.", time: null, verified: true },
      ],
      source: "manual",
      updatedAt: nowIso(),
    },
    [light.id]: {
      recurring: ["Local snacks", "Price and offers", "Label reading", "Regional relevance"],
      differences: "R03 is health- and label-led and discovers through Instagram; R04 is price-led and buys on offers. Both feel the concept is designed for North India.",
      contradictions: "R03 would welcome a baked snack, yet the same 'healthy' signal makes R04 fear the kids will reject it.",
      explore: "Which South Indian flavours (curry leaf, pepper) and price points would make the range feel local?",
      excerpts: [
        { participantId: idOf("R03"), text: "But the pack looks very North Indian, I'm not sure it is meant for us.", time: timeOf("R03", "pack looks")?.start ?? null, verified: true },
        { participantId: idOf("R04"), text: "If price is below thirty rupees I will try once.", time: timeOf("R04", "thirty rupees")?.start ?? null, verified: true },
      ],
      source: "manual",
      updatedAt: nowIso(),
    },
  };

  const note = (code: string, label: string, text: string, quote: string, questionIndex: number, x: number, y: number): Observation => ({
    id: makeId("o"), participantId: idOf(code), questionId: questionIds[questionIndex], code: label, note: text, quote, time: timeOf(code, quote)?.start ?? null, x, y,
  });
  study.observations = [
    note("R02", "Taste first", "Taste beats health at tea time; 'baked' reads as diet food.", "Baked matlab diet wala lagta hai.", 5, 30, 30),
    note("R04", "Taste first", "Fear that a baked snack will taste like diet food the kids reject.", "If it is like diet food, the kids will not eat it.", 6, 270, 30),
    note("R01", "Low-risk trial", "Small, cheap packs lower the risk of trying.", "Agar sample mil jaaye ya chhota pack ho dus-bees rupaye ka, toh try kar lungi.", 6, 30, 250),
    note("R04", "Low-risk trial", "A price below ₹30 or an offer triggers trial.", "If price is below thirty rupees I will try once.", 5, 270, 250),
    note("R03", "Regional fit", "The pack feels North Indian — Southern respondents may not see it as 'for us'.", "But the pack looks very North Indian, I'm not sure it is meant for us.", 5, 30, 470),
    note("R03", "Regional fit", "Local flavours (curry leaf, pepper) would drive trial in the South.", "South Indian flavours like curry leaf or pepper would make me try it.", 6, 270, 470),
    note("R01", "Ritual", "Namkeen completes the chai ritual — the snack is about family time, not hunger.", "Bina namkeen ke chai adhoori lagti hai.", 2, 510, 470),
  ];
  const [o1, o2, o3, o4, o5, o6] = study.observations;
  const cluster = (title: string, thought: string, ids: string[], y: number): Cluster => ({ id: makeId("c"), title, thought, observationIds: ids, x: 800, y });
  study.clusters = [
    cluster("'Baked' signals diet, not treat", "For taste-first families, 'baked' promises health at the cost of the indulgence that tea time is for.", [o1.id, o2.id], 30),
    cluster("Make trial cheap and small", "A sample, a ₹10–30 pack or an offer turns curiosity into trial without risking a disappointing big pack.", [o3.id, o4.id], 320),
    cluster("Feel local in the South", "Southern consumers need regional flavours and cues before the range feels made for them.", [o5.id, o6.id], 610),
  ];
  study.connections = [{ id: makeId("r"), from: { kind: "cluster", id: study.clusters[0].id }, to: { kind: "cluster", id: study.clusters[1].id }, note: "small packs reduce the risk" }];
  study.topline = {
    title: "Win the chai moment on taste first — 'baked' is a reason to believe, not the reason to buy",
    intro: "Evening namkeen is part of a family ritual, chosen for familiar taste and freshness. A baked range is welcome to health-conscious consumers but risks reading as 'diet food' to taste-first families, and the current pack feels North Indian to Southern consumers.",
    blocks: study.clusters.map((entry) => entry.id),
    body: "## Implications\n\n- Lead communication with taste and crunch; position 'baked' as a supporting benefit.\n- Launch with low-risk trial formats: sampling at the shop and ₹10–30 packs.\n- Develop South-specific flavours (curry leaf, pepper) and pack cues before a Southern launch.\n\n## Areas for further exploration\n\n- Does in-store tasting overcome the 'diet food' perception?\n- Which regional flavour cues signal 'made for us' in Tamil Nadu?",
  };
  return { study, transcripts };
}
