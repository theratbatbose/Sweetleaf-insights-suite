import ExcelJS from "exceljs";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { GridCell, Study } from "../shared/types";
import { allQuestions, formatTime } from "../shared/util";

function cellText(cell: GridCell | undefined) {
  if (!cell) return "";
  const quotes = cell.quotes.map((quote) => {
    const time = quote.time !== null ? ` [${formatTime(quote.time)}]` : "";
    const translation = quote.translation ? `\n   (${quote.translation})` : "";
    const flag = quote.verified ? "" : " [NOT FOUND IN TRANSCRIPT — verify]";
    return `“${quote.text}”${time}${flag}${translation}`;
  });
  return [cell.summary, ...quotes].filter(Boolean).join("\n\n");
}

export async function gridWorkbook(study: Study): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sweetleaf Suite";
  const sheet = workbook.addWorksheet("Analysis grid", { views: [{ state: "frozen", xSplit: 2, ySplit: 2 }] });

  // Order columns by segment so cuts sit side by side, as in a typical debrief grid.
  const segmentOrder = new Map(study.segments.map((segment, index) => [segment.id, index]));
  const participants = [...study.participants].sort((a, b) =>
    (segmentOrder.get(a.segmentId ?? "") ?? 999) - (segmentOrder.get(b.segmentId ?? "") ?? 999));

  sheet.addRow(["Section", "Question", ...participants.map((p) => `${p.code} · ${p.name}`), "Across respondents"]);
  sheet.addRow(["", "", ...participants.map((p) => study.segments.find((s) => s.id === p.segmentId)?.name ?? "No segment"), ""]);
  for (const question of allQuestions(study.guide)) {
    sheet.addRow([question.sectionTitle, question.text, ...participants.map((p) => cellText(study.grid[p.id]?.[question.id])), study.rowSynthesis[question.id] ?? ""]);
  }

  sheet.getColumn(1).width = 22;
  sheet.getColumn(2).width = 42;
  for (let i = 3; i <= participants.length + 3; i += 1) sheet.getColumn(i).width = 48;
  sheet.eachRow((row, rowNumber) => {
    row.alignment = { wrapText: true, vertical: "top" };
    if (rowNumber <= 2) row.font = { bold: true };
  });
  participants.forEach((participant, index) => {
    const color = study.segments.find((s) => s.id === participant.segmentId)?.color?.replace("#", "") ?? "999999";
    sheet.getCell(2, index + 3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `33${color}` } };
  });

  const people = workbook.addWorksheet("Participants");
  people.addRow(["Code", "Name", "Segment", "City", "Age", "Gender", "Session type", "Session date", "Notes"]);
  for (const p of participants) {
    people.addRow([p.code, p.name, study.segments.find((s) => s.id === p.segmentId)?.name ?? "", p.city, p.age ?? "", p.gender, p.sessionType, p.sessionDate, p.notes]);
  }
  people.getRow(1).font = { bold: true };
  people.columns.forEach((column) => { column.width = 18; });

  const notes = workbook.addWorksheet("Observations");
  notes.addRow(["Participant", "Time", "Code", "Observation", "Quote"]);
  for (const o of study.observations) {
    const p = study.participants.find((entry) => entry.id === o.participantId);
    notes.addRow([p ? `${p.code} · ${p.name}` : o.participantId, formatTime(o.time), o.code, o.note, o.quote]);
  }
  notes.getRow(1).font = { bold: true };
  notes.columns.forEach((column, index) => { column.width = index >= 3 ? 60 : 18; });
  notes.eachRow((row) => { row.alignment = { wrapText: true, vertical: "top" }; });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function markdownToParagraphs(markdown: string): Paragraph[] {
  return markdown.split(/\n/).filter((line) => line.trim()).map((line) => {
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length === 1 ? HeadingLevel.HEADING_1 : heading[1].length === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
      return new Paragraph({ heading: level, children: [new TextRun(heading[2])] });
    }
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) return new Paragraph({ bullet: { level: 0 }, children: inlineRuns(bullet[1]) });
    return new Paragraph({ children: inlineRuns(line), spacing: { after: 120 } });
  });
}

function inlineRuns(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((part) =>
    part.startsWith("**") ? new TextRun({ text: part.slice(2, -2), bold: true }) : new TextRun(part));
}

export function toplineMarkdown(study: Study) {
  const blocks = study.topline.blocks
    .map((id) => study.clusters.find((cluster) => cluster.id === id))
    .filter(Boolean)
    .map((cluster) => `## ${cluster!.title}\n\n${cluster!.thought}`);
  return [`# ${study.topline.title || study.name}`, study.topline.intro, ...blocks, study.topline.body].filter((part) => part && part.trim()).join("\n\n");
}

export async function toplineDocx(study: Study): Promise<Buffer> {
  const doc = new Document({
    creator: "Sweetleaf Suite",
    title: study.topline.title || study.name,
    sections: [{ children: markdownToParagraphs(toplineMarkdown(study)) }],
  });
  return Packer.toBuffer(doc);
}
