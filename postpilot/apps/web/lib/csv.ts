import type { Platform } from "@/lib/shared-types";
import { isPlatform } from "@/lib/platforms";

export const CSV_HEADERS = ["date", "platform", "post_type", "title", "caption", "hashtags", "media_link", "status"] as const;
export type CsvHeader = (typeof CSV_HEADERS)[number];

export interface ImportRow {
  rowNumber: number;
  date: string;
  platform: Platform | "";
  postType: string;
  title: string;
  caption: string;
  hashtags: string;
  mediaLink: string;
  sourceStatus: string;
  errors: string[];
}

export interface CsvParseResult { rows: ImportRow[]; errors: string[] }

function parseRecords(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const text = input.replace(/^\uFEFF/, "");
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field); field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field); field = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else field += char;
  }
  if (quoted) throw new Error("A quoted field is not closed.");
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseImportCsv(input: string): CsvParseResult {
  if (!input.trim()) return { rows: [], errors: [] };
  let records: string[][];
  try { records = parseRecords(input); } catch (error) { return { rows: [], errors: [error instanceof Error ? error.message : "Could not parse CSV."] }; }
  if (records.length < 2) return { rows: [], errors: ["Add a header and at least one content row."] };

  const headers = records[0].map((header) => header.trim().toLowerCase().replaceAll(" ", "_"));
  const missing = CSV_HEADERS.filter((required) => !headers.includes(required));
  if (missing.length) return { rows: [], errors: [`Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`] };
  const value = (record: string[], key: CsvHeader) => (record[headers.indexOf(key)] ?? "").trim();

  const rows = records.slice(1).map((record, index): ImportRow => {
    const date = value(record, "date");
    const rawPlatform = value(record, "platform").toLowerCase();
    const caption = value(record, "caption");
    const mediaLink = value(record, "media_link");
    const sourceStatus = value(record, "status").toLowerCase() || "draft";
    const errors: string[] = [];
    if (!isRealDate(date)) errors.push("Use a real date in YYYY-MM-DD format.");
    if (!isPlatform(rawPlatform)) errors.push("Unknown platform.");
    if (!caption) errors.push("Caption is required.");
    if (!["draft", "ready", "scheduled"].includes(sourceStatus)) errors.push("Status must be draft, ready, or scheduled.");
    if (rawPlatform === "instagram" && !mediaLink) errors.push("Instagram rows require media_link.");
    if (mediaLink) {
      try {
        const url = new URL(mediaLink);
        if (url.protocol !== "https:") errors.push("Media link must use HTTPS.");
        const configuredHost = process.env.NEXT_PUBLIC_R2_MEDIA_HOST?.toLowerCase();
        if (configuredHost && url.hostname.toLowerCase() !== configuredHost) errors.push(`Media link must use ${configuredHost}.`);
      }
      catch { errors.push("Media link is not a valid URL."); }
    }
    return {
      rowNumber: index + 2,
      date,
      platform: isPlatform(rawPlatform) ? rawPlatform : "",
      postType: value(record, "post_type"),
      title: value(record, "title"),
      caption,
      hashtags: value(record, "hashtags"),
      mediaLink,
      sourceStatus,
      errors,
    };
  });
  return { rows, errors: [] };
}

export function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
