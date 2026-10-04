function cell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** Excel drops leading zeros from numbers; ="..." keeps an ID such as 010101010 as text. */
export function asText(value: string): string {
  return `="${value}"`;
}

/** Download rows as a CSV file that Excel opens with Arabic intact. */
export function downloadCsv(fileName: string, rows: (string | number | null)[][]): void {
  const text = "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
