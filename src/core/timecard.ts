// Reads rows of a ZKTeco BioTime "Time Card" CSV export:
//   Employee ID, First Name, Department, Date, Times, Time
//   010101010, NAME, IT GROUP, 2026-10-01, 2, 06:54:33;14:01:18
import { parsePunchCell } from "./punches.ts";
import { isDate } from "./time.ts";

export interface TimecardRow {
  employeeId: string;
  name: string;
  department: string;
  date: string;
  times: string[];
  invalid: string[];
}

export interface TimecardEmployee {
  employeeId: string;
  name: string;
  department: string;
  from: string;
  to: string;
  days: number;
}

// Header names vary between exports; compare them without case, spaces or symbols
const FIELDS = {
  employeeId: ["employeeid", "cpr", "cprno", "empid", "employeeno", "personnelid", "id"],
  name: ["firstname", "name", "employeename", "fullname"],
  department: ["department", "dept"],
  date: ["date"],
  time: ["time", "punches"],
} as const;

const clean = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

function readFields(row: Record<string, unknown>): Record<keyof typeof FIELDS, string> {
  const norm: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) norm[k.toLowerCase().replace(/[^a-z0-9]/g, "")] = clean(v);

  const pick = (aliases: readonly string[]) => norm[aliases.find((a) => norm[a]) ?? ""] ?? "";
  return {
    employeeId: pick(FIELDS.employeeId),
    name: pick(FIELDS.name),
    department: pick(FIELDS.department),
    date: pick(FIELDS.date),
    time: pick(FIELDS.time),
  };
}

const pad2 = (n: string | number) => String(n).padStart(2, "0");

/** "2026-10-05", "05/10/2026" (Bahrain writes the day first) or an Excel serial number -> "YYYY-MM-DD" */
export function normalizeDate(value: string): string {
  const s = value.trim();
  if (isDate(s)) return s;

  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (dmy) {
    const date = dmy[3] + "-" + pad2(dmy[2]) + "-" + pad2(dmy[1]);
    return isDate(date) ? date : "";
  }

  if (/^\d{5}(\.\d+)?$/.test(s)) {
    return new Date(Math.round((Number(s) - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
  }
  return "";
}

/** CSV rows (already split into objects by the CSV reader) -> clean rows, skipping lines without a date or ID. */
export function readTimecard(rows: Record<string, unknown>[]): TimecardRow[] {
  const out: TimecardRow[] = [];
  for (const row of rows) {
    const f = readFields(row);
    const date = normalizeDate(f.date);
    if (!date || !f.employeeId) continue;
    const { times, invalid } = parsePunchCell(f.time);
    out.push({ employeeId: f.employeeId, name: f.name, department: f.department, date, times, invalid });
  }
  return out;
}

/** One line per employee: first and last date in the file and how many days have punches. */
export function summarizeTimecard(rows: TimecardRow[]): TimecardEmployee[] {
  const byId = new Map<string, TimecardEmployee & { dates: Set<string> }>();
  for (const r of rows) {
    const e = byId.get(r.employeeId) ?? {
      employeeId: r.employeeId,
      name: r.name,
      department: r.department,
      from: r.date,
      to: r.date,
      days: 0,
      dates: new Set<string>(),
    };
    if (r.date < e.from) e.from = r.date;
    if (r.date > e.to) e.to = r.date;
    e.name ||= r.name;
    e.department ||= r.department;
    e.dates.add(r.date);
    byId.set(r.employeeId, e);
  }
  return [...byId.values()]
    .map(({ dates, ...e }) => ({ ...e, days: dates.size }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.employeeId.localeCompare(b.employeeId));
}
