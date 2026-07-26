// Table → CSV, RFC 4180.
//
// Serializes the PIPELINE OUTPUT, not the source table: the user asking for
// "the data behind this chart" means the rows the chart is drawn from, filters
// and all.

import type { Field, Row } from "../model/table";
import { asText } from "../model/table";

/** Quote a field iff it contains a comma, a quote, or a line break. */
export function csvField(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

export function toCSV(fields: Field[], rows: Row[]): string {
  const lines: string[] = [];
  lines.push(fields.map((f) => csvField(f.name)).join(","));
  for (const row of rows) {
    lines.push(fields.map((f) => csvField(asText(row[f.name]))).join(","));
  }
  // A trailing newline, so `wc -l` and every line-oriented tool agree with the
  // row count.
  return `${lines.join("\n")}\n`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking immediately would race the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCSV(fields: Field[], rows: Row[], filename: string): void {
  downloadBlob(new Blob([toCSV(fields, rows)], { type: "text/csv;charset=utf-8" }), filename);
}
