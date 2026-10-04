import path from "node:path";
import ExcelJS from "exceljs";
import mammoth from "mammoth";
import { type HTMLElement, NodeType, parse, type Node } from "node-html-parser";
import { parseCsv, parseTime } from "../shared/util";
import { HttpError } from "./storage";

/**
 * "structured" keeps document shape (headings → "## ", lists → "- ") for briefs, screeners and guides.
 * "transcript" turns paragraphs and table rows into one utterance per line ("[time] Speaker: text").
 */
export type ExtractMode = "structured" | "transcript";

export async function extractDocumentText(buffer: Buffer, name: string, mode: ExtractMode): Promise<string> {
  const ext = path.extname(name).toLowerCase();
  switch (ext) {
    case ".docx": {
      const { value } = await mammoth.convertToHtml({ buffer });
      return htmlToText(value, mode);
    }
    case ".pdf":
      return joinWrappedLines(await pdfToText(buffer), mode);
    case ".xlsx": {
      const rows = await spreadsheetRows(buffer, name);
      return mode === "transcript" ? rows.map(rowToUtterance).filter(Boolean).join("\n") : rows.map((row) => row.filter(Boolean).join(" — ")).filter(Boolean).join("\n");
    }
    case ".doc":
      throw new HttpError(400, "Old .doc files can't be read. Open it in Word and use File → Save As → Word Document (.docx).");
    case ".rtf":
    case ".pages":
    case ".pptx":
    case ".ppt":
      throw new HttpError(400, `${ext} files can't be read. Save as .docx or .pdf, or copy the text and paste it in.`);
    default:
      return decodeText(buffer);
  }
}

/** Handles UTF-8 (with or without BOM) and UTF-16 files saved by Windows Notepad as "Unicode". */
export function decodeText(buffer: Buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString("utf16le");
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.from(buffer.subarray(2));
    swapped.swap16();
    return swapped.toString("utf16le");
  }
  return buffer.toString("utf8").replace(/^﻿/, "");
}

async function pdfToText(buffer: Buffer) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  let pages: string[];
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    ({ text: pages } = await extractText(pdf, { mergePages: false }) as { text: string[] });
  } catch (error) {
    throw new HttpError(400, `This PDF could not be read (${(error as Error).message}). If it is password-protected, remove the password first.`);
  }
  const text = pages.join("\n").replace(/[ \t]+\n/g, "\n").trim();
  if (!text) throw new HttpError(400, "This PDF has no selectable text — it is probably a scan. Run it through OCR, or ask for the Word version.");
  return text;
}

const LINE_START = /^(\[?\(?(\d{1,2}:)?\d{1,3}:\d{2}|[\p{Lu}][\p{L}.' ]{0,30}(\s*\d{1,2})?(\s*\([^)]{1,30}\))?\s*:|[-•*●]\s|\d+(\.\d+)*[.)]\s|#)/u;

/** PDFs break long sentences across lines; glue continuation lines back onto the line they belong to. */
export function joinWrappedLines(text: string, mode: ExtractMode) {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const previous = out[out.length - 1];
    const continues = previous !== undefined && (mode === "transcript"
      ? !LINE_START.test(line) && !/^(moderator|respondent|interviewer|mod|resp)\b/i.test(line)
      : !/[.?!:)]$/.test(previous) && /^[\p{Ll}(]/u.test(line));
    if (continues) out[out.length - 1] = `${previous} ${line}`;
    else out.push(line);
  }
  return out.join("\n");
}

export async function spreadsheetRows(buffer: Buffer, name: string): Promise<string[][]> {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".csv" || ext === ".tsv" || ext === ".txt") return parseCsv(decodeText(buffer));
  if (ext !== ".xlsx") throw new HttpError(400, "Use an Excel (.xlsx) or CSV file. For .xls, open it in Excel and save as .xlsx.");
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new HttpError(400, "This Excel file could not be opened. Save it again as .xlsx and retry.");
  }
  // Use the first sheet that has data.
  const sheet = workbook.worksheets.find((ws) => ws.actualRowCount > 0);
  if (!sheet) return [];
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    for (let col = 1; col <= sheet.columnCount; col += 1) values.push(cellString(row.getCell(col).value));
    rows.push(values);
  });
  return rows.filter((row) => row.some((cell) => cell));
}

function cellString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("").trim();
    if ("text" in value) return String(value.text).trim();
    if ("result" in value) return cellString(value.result as ExcelJS.CellValue);
    return "";
  }
  return String(value).trim();
}

// ---------------------------------------------------------------------------
// HTML (from mammoth) → text
// ---------------------------------------------------------------------------

const HEADER_WORDS = /^(s\.?\s*no\.?|sr\.?\s*no\.?|#|time|timestamp|time\s*code|timecode|speaker|name|person|role|dialogue|dialog|text|transcript|verbatim|conversation|response|remarks?|translation|english|hindi)$/i;

function inlineText(node: Node): string {
  return (node as HTMLElement).text.replace(/ /g, " ").replace(/[ \t]+/g, " ").trim();
}

/** True when (nearly) all of a paragraph is bold ("strong") or italic ("em"). */
function isWhollyStyled(element: HTMLElement, tag: "strong" | "em") {
  const text = inlineText(element);
  if (!text) return false;
  const styled = element.querySelectorAll(tag).map((node) => inlineText(node)).join("").replace(/\s+/g, "");
  return styled.length >= text.replace(/\s+/g, "").length * 0.9;
}

function rowToUtterance(cells: string[]): string {
  const filled = cells.map((cell) => cell.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!filled.length) return "";
  if (filled.every((cell) => HEADER_WORDS.test(cell))) return "";
  if (filled.length === 1) return filled[0];
  const timeIndex = filled.findIndex((cell) => parseTime(cell.replace(/[[\]()]/g, "")) !== null);
  const rest = filled.filter((_, index) => index !== timeIndex);
  // Skip a leading serial-number column.
  if (rest.length > 1 && /^\d{1,4}\.?$/.test(rest[0])) rest.shift();
  const time = timeIndex >= 0 ? `[${filled[timeIndex].replace(/[[\]()]/g, "")}] ` : "";
  if (rest.length === 1) return `${time}${rest[0]}`;
  const [first, ...others] = rest;
  const speakerLike = first.length <= 30 && !/[.?!]$/.test(first);
  return speakerLike ? `${time}${first.replace(/:$/, "")}: ${others.join(" ")}` : `${time}${rest.join(" ")}`;
}

export function htmlToText(html: string, mode: ExtractMode): string {
  const root = parse(html);
  const out: string[] = [];

  const walk = (node: Node, listDepth: number) => {
    if (node.nodeType === NodeType.TEXT_NODE) {
      const text = node.text.trim();
      if (text) out.push(text);
      return;
    }
    if (node.nodeType !== NodeType.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    const tag = element.tagName?.toLowerCase();
    switch (tag) {
      case "h1": case "h2": case "h3": case "h4": case "h5": case "h6": {
        const text = inlineText(element);
        if (text) out.push(mode === "structured" ? `## ${text}` : text);
        return;
      }
      case "p": {
        const text = inlineText(element);
        if (!text) return;
        if (mode === "structured" && listDepth === 0 && text.length < 90 && !text.includes("?") && isWhollyStyled(element, "strong")) out.push(`## ${text}`);
        else if (mode === "structured" && isWhollyStyled(element, "em")) out.push(`Note: ${text}`);
        else out.push(listDepth && mode === "structured" ? `${"    ".repeat(listDepth - 1)}- ${text}` : text);
        return;
      }
      case "ul": case "ol":
        element.childNodes.forEach((child) => walk(child, listDepth + 1));
        return;
      case "li": {
        const own = element.childNodes.filter((child) => !["ul", "ol"].includes((child as HTMLElement).tagName?.toLowerCase() ?? ""));
        const text = own.map((child) => inlineText(child)).join(" ").replace(/\s+/g, " ").trim();
        if (text) out.push(mode === "structured" ? `${"    ".repeat(Math.max(0, listDepth - 1))}- ${text}` : text);
        element.childNodes.filter((child) => ["ul", "ol"].includes((child as HTMLElement).tagName?.toLowerCase() ?? "")).forEach((child) => walk(child, listDepth));
        return;
      }
      case "table": {
        for (const row of element.querySelectorAll("tr")) {
          const cells = row.querySelectorAll("td,th").map((cell) => cell.querySelectorAll("p").length
            ? cell.querySelectorAll("p").map((p) => inlineText(p)).filter(Boolean).join(mode === "transcript" ? " " : "\n")
            : inlineText(cell));
          if (mode === "transcript") {
            const line = rowToUtterance(cells);
            if (line) out.push(line);
          } else {
            for (const cell of cells) for (const line of cell.split("\n")) if (line.trim() && !HEADER_WORDS.test(line.trim())) out.push(line.trim());
          }
        }
        return;
      }
      case "br":
        return;
      default:
        element.childNodes.forEach((child) => walk(child, listDepth));
    }
  };

  root.childNodes.forEach((child) => walk(child, 0));
  return out.join("\n");
}
