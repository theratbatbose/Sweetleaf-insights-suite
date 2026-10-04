// Generates the fictional example study in examples/ (Word, Excel, PDF, text files in the formats
// transcription vendors and research teams commonly use). Run: node scripts/make-examples.mjs
// The PDF transcript is produced separately by printing examples/source/R03.html to PDF.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "examples");
mkdirSync(path.join(root, "transcripts"), { recursive: true });
mkdirSync(path.join(root, "source"), { recursive: true });

const p = (text, opts = {}) => new Paragraph({ children: [new TextRun({ text, ...opts })] });
const h = (text, level = HeadingLevel.HEADING_1) => new Paragraph({ heading: level, children: [new TextRun(text)] });
const bullet = (text, level = 0) => new Paragraph({ bullet: { level }, children: [new TextRun(text)] });
const save = async (file, children) => writeFileSync(path.join(root, file), await Packer.toBuffer(new Document({ sections: [{ children }] })));

// ---- brief ----
await save("01 Brief - Tea-time snacking.docx", [
  new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun("Research brief: Tea-time snacking (FICTIONAL EXAMPLE)")] }),
  h("Client"), p("Example Foods Pvt Ltd (fictional)"),
  h("Background"), p("Example Foods sells packaged namkeen in North India and wants to understand evening tea-time snacking before launching a baked range in the South."),
  h("Objectives"),
  bullet("Understand the role of snacks in the evening chai ritual"),
  bullet("Map how people choose between brands and loose/local options"),
  bullet("Identify barriers and triggers for trying a new baked snack"),
  h("Methodology"), p("8 in-depth interviews (IDIs), 60 minutes, in-home, Hindi/Hinglish and Tamil/English. Lucknow, Delhi, Chennai, Coimbatore."),
]);

// ---- screener ----
await save("02 Screener.docx", [
  new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun("Recruitment screener (FICTIONAL EXAMPLE)")] }),
  p("S1. Age: 25–45. S2. SEC A/B. S3. Main shopper for household snacks."),
  p("S4. How often do you eat packaged namkeen with evening tea?", { bold: true }),
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      ["Answer", "Segment", "Quota"],
      ["5 or more days a week", "Heavy snackers", "4"],
      ["1–2 days a week or less", "Light snackers", "4"],
    ].map((cells) => new TableRow({ children: cells.map((cell) => new TableCell({ children: [p(cell)] })) })),
  }),
  p("Terminate: works in market research, advertising or a snack company."),
]);

// ---- discussion guide: heading styles, numbered questions, bulleted probes, moderator notes ----
await save("03 Discussion guide.docx", [
  new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun("Discussion guide – Tea-time snacking IDIs (FICTIONAL EXAMPLE)")] }),
  p("Moderator note: 60 minutes. Record with consent. Respondent may answer in Hindi or Tamil.", { italics: true }),
  h("A. Introduction and warm-up (5 mins)"),
  p("1. Please introduce yourself – family, work, a typical weekday evening."),
  h("B. The evening chai ritual (15 mins)"),
  p("2. Walk me through your last evening tea time. Who was there, what did you eat?"),
  bullet("Probe: time, place, who prepares"),
  bullet("Probe: weekday vs weekend"),
  p("3. What role do snacks play at that moment?"),
  h("C. Brand choice (15 mins)"),
  p("4. Which snacks and brands do you buy for tea time, and why those?"),
  bullet("Probe: packaged vs loose / halwai"),
  p("5. How do you decide when trying something new?"),
  h("D. New baked snack concept (15 mins)"),
  p("Show concept board 1. Allow 1 minute.", { italics: true }),
  p("6. What is your first reaction to this baked snack?"),
  p("7. What would stop you from buying it? What would make you try it?"),
  h("E. Close (5 mins)"),
  p("Thank the respondent and close."),
]);

// ---- recruitment list ----
const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet("Recruits");
sheet.addRow(["Resp. ID", "Name", "Segment", "City", "Age", "Gender", "Interview date", "Recruiter remarks"]);
[
  ["R01", "Priya S.", "Heavy snackers", "Lucknow", 34, "F", new Date("2026-09-12"), "Joint family"],
  ["R02", "Arjun M.", "Heavy snackers", "Delhi", 41, "M", new Date("2026-09-13"), ""],
  ["R03", "Kavya R.", "Light snackers", "Chennai", 28, "F", new Date("2026-09-15"), "Health conscious"],
  ["R04", "Senthil K.", "Light snackers", "Coimbatore", 37, "M", new Date("2026-09-16"), ""],
].forEach((row) => sheet.addRow(row));
await workbook.xlsx.writeFile(path.join(root, "04 Recruitment list.xlsx"));

// ---- transcripts ----
// R01: Word, three-column table (Time | Speaker | Dialogue) — common vendor layout.
const r01 = [
  ["00:00:20", "Moderator", "Namaste Priya ji. Apne baare mein thoda bataiye."],
  ["00:00:31", "Respondent", "Main Lucknow mein rehti hoon, joint family hai, office se six baje tak aa jaati hoon."],
  ["00:03:05", "Moderator", "Kal shaam ki chai ke baare mein bataiye."],
  ["00:03:12", "Respondent", "Chai toh saas banati hain, aur saath mein namkeen zaroor hota hai. Bina namkeen ke chai adhoori lagti hai."],
  ["00:09:40", "Moderator", "Kaunsa brand lete hain?"],
  ["00:09:47", "Respondent", "Mostly Haldiram's. Taste consistent hai and the kids also like it. Loose wala kabhi kabhi halwai se."],
  ["00:21:02", "Moderator", "Naya kuch try karne ka decision kaise lete hain?"],
  ["00:21:10", "Respondent", "Agar padosan ya office mein koi recommend kare, tab try karti hoon. Ad dekh ke nahi."],
  ["00:34:30", "Moderator", "Is baked snack ke baare mein pehli reaction?"],
  ["00:34:41", "Respondent", "Baked achha lagta hai health ke liye, but mujhe doubt hai ki crunchy hoga ya nahi. Price bhi dekhna padega."],
];
await save("transcripts/R01 Priya - Lucknow.docx", [
  p("IDI Transcript – R01 – Lucknow – 12 Sep 2026 (FICTIONAL EXAMPLE)", { bold: true }),
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [["Time", "Speaker", "Dialogue"], ...r01].map((cells) => new TableRow({
      children: cells.map((cell) => new TableCell({ children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun(cell)] })] })),
    })),
  }),
]);

// R02: Word, speaker name on its own line, untimed — another common layout.
const r02 = [
  ["MODERATOR", "Arjun ji, shaam ki chai mein aap kya khaate hain?"],
  ["RESPONDENT", "Bhujia ya mathri. Weekend pe samosa bhi aa jaata hai market se."],
  ["MODERATOR", "Brand choose kaise karte hain?"],
  ["RESPONDENT", "Jo dukaan wala de de, usually Bikaji ya Haldiram's. Honestly brand se zyada fresh hona matter karta hai."],
  ["MODERATOR", "Baked snack ka concept dekh ke kya lagta hai?"],
  ["RESPONDENT", "Baked matlab diet wala lagta hai. Mere liye chai ke saath tasty chahiye, healthy baad mein."],
];
await save("transcripts/R02 Arjun - Delhi.docx", [
  p("R02 | Delhi | Heavy snacker (FICTIONAL EXAMPLE)", { bold: true }),
  ...r02.flatMap(([speaker, text]) => [p(speaker, { bold: true }), p(text)]),
]);

// R03: PDF (printed from HTML) with "Speaker: text" lines and timestamps.
const r03 = [
  ["00:01:02", "Moderator", "Kavya, tell me about your evenings."],
  ["00:01:10", "Kavya", "I get home by seven. Filter coffee, not chai, and maybe some murukku if my mother has made it."],
  ["00:12:30", "Moderator", "Do you buy packaged snacks?"],
  ["00:12:38", "Kavya", "Rarely. I check the label for palm oil. If it is baked and has less salt, I might try it."],
  ["00:30:15", "Moderator", "What is your first reaction to this baked snack?"],
  ["00:30:24", "Kavya", "Interesting. But the pack looks very North Indian, I'm not sure it is meant for us."],
];
writeFileSync(path.join(root, "source", "R03.html"), `<!doctype html><meta charset="utf-8"><title>R03</title><body style="font-family:sans-serif">
<h3>R03 – Chennai – Light snacker (FICTIONAL EXAMPLE)</h3>
${r03.map(([t, s, x]) => `<p>[${t}] ${s}: ${x}</p>`).join("\n")}</body>`);

// R04: Windows Notepad "Unicode" (UTF-16) text with timestamps, Tamil-English mix.
const r04 = [
  "[00:00:15] Moderator: Senthil sir, evening snacks pathi sollunga.",
  "[00:00:22] Senthil: Evening tea with biscuits, sometimes bajji from the shop near the bus stand.",
  "[00:15:40] Moderator: Do you buy namkeen brands?",
  "[00:15:47] Senthil: Not much. Local mixture is cheaper and fresher. Brands are for when guests come.",
  "[00:31:05] Moderator: Baked snack concept – first reaction?",
  "[00:31:12] Senthil: Kids may like it. If price is below thirty rupees I will try once.",
].join("\r\n");
writeFileSync(path.join(root, "transcripts", "R04 Senthil - Coimbatore.txt"), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(r04, "utf16le")]));

console.log("Examples written to", root);
