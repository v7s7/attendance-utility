// Reads attendance exports from ZKTeco BioTime (the "Time Card" report and similar), as CSV or
// Excel. Columns are found by their titles wherever they are, then checked against what the
// cells hold, so a moved, renamed or extra column doesn't spoil the import. HR sees what was
// found and can correct it before importing.
//   Employee ID, First Name, Department, Date, Times, Time
//   010101010, NAME, IT GROUP, 2026-10-01, 2, 06:54:33;14:01:18
import { parsePunchCell, secToHms } from "./punches.ts";
import { isDate } from "./time.ts";

export type Cell = string | number | boolean | Date | null | undefined;

export const TIMECARD_FIELDS = ["employeeId", "name", "department", "date", "time"] as const;
export type TimecardField = (typeof TIMECARD_FIELDS)[number];

/** What each column of a file holds, by position; null = not used. Name and time may use several columns. */
export type ColumnMap = (TimecardField | null)[];

export interface TimecardLayout {
  /** The title row, or -1 when the file has none. */
  headerRow: number;
  columns: ColumnMap;
}

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

/** Fields that only one column can hold. */
const ONE_COLUMN: TimecardField[] = ["employeeId", "department", "date"];

/** Compare titles without case, spaces, symbols or the Arabic letter forms people mix up. */
function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]|ـ/gu, "");
}

/** Titles BioTime and HR's own sheets use, in English and Arabic. */
const TITLES: Record<TimecardField, string[]> = {
  employeeId: [
    "Employee ID", "Emp ID", "Employee No", "Employee Number", "Emp No", "Emp Code", "Employee Code", "Personnel ID",
    "Personnel No", "User ID", "Badge Number", "Badge No", "AC-No", "Enroll Number", "Enroll ID", "Staff ID", "Staff No",
    "CPR", "CPR No", "CPR Number", "ID", "ID No", "ID Number",
    "الرقم الشخصي", "رقم الموظف", "الرقم الوظيفي", "رقم الهوية", "رقم البطاقة", "كود الموظف",
  ],
  name: [
    "First Name", "Last Name", "Name", "Employee Name", "Emp Name", "Full Name", "Personnel Name",
    "الاسم", "اسم الموظف", "الاسم الأول", "الاسم الأخير", "الاسم الكامل", "اسم العائلة",
  ],
  department: ["Department", "Dept", "Department Name", "Section", "Division", "القسم", "الإدارة", "اسم القسم"],
  date: ["Date", "Att Date", "Attendance Date", "Punch Date", "Work Date", "التاريخ", "تاريخ الحضور", "تاريخ البصمة"],
  time: [
    "Time", "Punches", "Punch", "Punch Time", "Punch Times", "Check Time", "Clock Time", "Date Time", "Datetime",
    "Check In", "Check Out", "Clock In", "Clock Out", "Time In", "Time Out", "In Time", "Out Time", "In", "Out",
    "First Punch", "Last Punch", "First In", "Last Out",
    "الوقت", "الأوقات", "البصمات", "البصمة", "وقت البصمة", "الدخول", "الخروج", "وقت الدخول", "وقت الخروج",
    "الحضور", "الانصراف", "وقت الحضور", "وقت الانصراف",
  ],
};

const TITLE_LOOKUP = new Map<string, TimecardField>();
for (const field of TIMECARD_FIELDS) {
  for (const title of TITLES[field]) if (!TITLE_LOOKUP.has(norm(title))) TITLE_LOOKUP.set(norm(title), field);
}

/** Titles of columns that look like times or dates but aren't punches: totals, lateness, weekday... */
const NOT_PUNCHES =
  /total|work|late|early|over|duration|break|absen|requir|shift|schedul|timetable|status|state|remark|note|week|^day|^times$|^ot$|اجمال|مجموع|تاخير|مده|ساعات|حاله|ملاحظ|ورديه|اليوم/;

const pad2 = (n: string | number) => String(n).padStart(2, "0");
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// A date inside a cell: 2026-10-05, 05/10/2026, 05-10-26, 5 Oct 2026, Oct 5, 2026
const DATE_SOURCE =
  /\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?!\d)|(?<!\d)\d{1,2}[-/.]\d{1,2}[-/.](?:\d{4}|\d{2})(?!\d)|(?<!\d)\d{1,2}[-\s][A-Za-z]{3,9}\.?[-\s,]+(?:\d{4}|\d{2})(?!\d)|[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}(?!\d)/
    .source;
const DATES_IN_TEXT = new RegExp(DATE_SOURCE, "g");
const HAS_DATE = new RegExp(DATE_SOURCE);

/** A cell as text. Excel dates come as UTC dates; a time alone sits on 30 Dec 1899. */
export function cellText(value: Cell): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    const exact = new Date(Math.round(value.getTime() / 1000) * 1000).toISOString();
    const [date, time] = [exact.slice(0, 10), exact.slice(11, 19)];
    if (value.getUTCFullYear() < 1901) return time;
    return time === "00:00:00" ? date : `${date} ${time}`;
  }
  return String(value)
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** A time cell as text: Excel may give a time as a fraction of a day (0.2875 is 06:54). */
function timeText(value: Cell): string {
  if (typeof value === "number" && value >= 0 && value < 1) return secToHms(Math.round(value * 86400) % 86400);
  return cellText(value);
}

/** Excel writes an ID kept as text as ="010101010" or '010101010 in some files. */
const cleanId = (text: string) => text.replace(/^="?|"$/g, "").replace(/^'/, "").trim();

/**
 * "2026-10-05", "05/10/2026" (Bahrain writes the day first; `dayFirst` false reads 10/05/2026
 * the American way), "5 Oct 2026", "Oct 5, 2026" or an Excel serial number -> "YYYY-MM-DD".
 * A time after the date is ignored.
 */
export function normalizeDate(value: string, dayFirst = true): string {
  const s = value.trim();
  const ymd = (y: string, m: string | number, d: string) => {
    const date = (y.length === 2 ? "20" + y : y) + "-" + pad2(m) + "-" + pad2(d);
    return isDate(date) ? date : "";
  };
  const month = (name: string) => MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;

  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/.exec(s);
  if (m) return ymd(m[1], m[2], m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/.exec(s);
  if (m) return dayFirst ? ymd(m[3], m[2], m[1]) : ymd(m[3], m[1], m[2]);
  m = /^(\d{1,2})[-\s]([A-Za-z]{3,9})\.?[-\s,]+(\d{4}|\d{2})(?!\d)/.exec(s);
  if (m && month(m[2])) return ymd(m[3], month(m[2]), m[1]);
  m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})(?!\d)/.exec(s);
  if (m && month(m[1])) return ymd(m[3], month(m[1]), m[2]);

  if (/^\d{5}(\.\d+)?$/.test(s)) {
    return new Date(Math.round((Number(s) - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
  }
  return "";
}

/** Day first unless a date in the file can only be read month first, like 10/13/2026. */
function guessDayFirst(values: string[]): boolean {
  for (const v of values) {
    const m = /(?<!\d)(\d{1,2})[-/.](\d{1,2})[-/.](?:\d{4}|\d{2})(?!\d)/.exec(v);
    if (!m) continue;
    if (Number(m[1]) > 12) return true;
    if (Number(m[2]) > 12) return false;
  }
  return true;
}

/** The punch times in a cell, leaving out any date written with them. */
const punchesIn = (text: string) => parsePunchCell(text.replace(DATES_IN_TEXT, " "));

interface ColumnStats {
  filled: number;
  dates: number;
  times: number;
  ids: number;
  words: number;
}

function columnStats(rows: Cell[][], col: number): ColumnStats {
  const s: ColumnStats = { filled: 0, dates: 0, times: 0, ids: 0, words: 0 };
  for (const row of rows) {
    const text = cellText(row[col]);
    if (!text) continue;
    s.filled++;
    if (HAS_DATE.test(text)) s.dates++;
    const punches = punchesIn(timeText(row[col]));
    if (punches.times.length && !punches.invalid.length) s.times++;
    if (/^[A-Za-z]{0,3}-?\d{3,15}$/.test(cleanId(text))) s.ids++;
    if (/\p{L}{2,}/u.test(text) && !/\d/.test(text)) s.words++;
  }
  return s;
}

/** Find the title row and what each column holds. */
export function detectLayout(rows: Cell[][]): TimecardLayout {
  // The title row: the one near the top that names the most fields
  let headerRow = -1;
  let best = 1;
  rows.slice(0, 30).forEach((row, i) => {
    const fields = new Set(row.map((c) => TITLE_LOOKUP.get(norm(cellText(c)))).filter(Boolean));
    if (fields.size > best) [best, headerRow] = [fields.size, i];
  });

  const sample = rows.slice(headerRow + 1, headerRow + 301);
  const width = Math.max(0, ...rows.slice(Math.max(headerRow, 0), headerRow + 301).map((r) => r.length));
  const titles = Array.from({ length: width }, (_, i) => (headerRow < 0 ? "" : norm(cellText(rows[headerRow][i]))));
  const stats = titles.map((_, i) => columnStats(sample, i));
  const share = (i: number, key: Exclude<keyof ColumnStats, "filled">) => (stats[i].filled ? stats[i][key] / stats[i].filled : 0);

  // A title counts when the cells agree with it (an empty column, e.g. no one punched out, is fine)
  const fits = (field: TimecardField, i: number) => {
    if (!stats[i].filled) return true;
    if (field === "date") return share(i, "dates") >= 0.5;
    if (field === "time") return share(i, "times") >= 0.5;
    return share(i, "dates") < 0.5 && share(i, "times") < 0.5;
  };

  const columns: ColumnMap = titles.map(() => null);
  titles.forEach((title, i) => {
    const field = TITLE_LOOKUP.get(title);
    if (!field || !fits(field, i) || (ONE_COLUMN.includes(field) && columns.includes(field))) return;
    columns[i] = field;
  });

  // What the titles didn't give, from what the cells hold
  const free = titles.map((_, i) => i).filter((i) => columns[i] === null && stats[i].filled && !NOT_PUNCHES.test(titles[i]));
  const pick = (field: TimecardField, test: (i: number) => boolean) => {
    if (columns.includes(field)) return;
    const i = free.find((c) => columns[c] === null && test(c));
    if (i !== undefined) columns[i] = field;
  };
  pick("employeeId", (i) => share(i, "ids") >= 0.8 && share(i, "dates") < 0.5);
  pick("date", (i) => share(i, "dates") >= 0.8 && share(i, "times") < 0.5);
  if (!columns.includes("time")) {
    for (const i of free) if (columns[i] === null && share(i, "times") >= 0.8) columns[i] = "time";
  }
  pick("name", (i) => share(i, "words") >= 0.8);

  // A "Date" column that holds the date and time of each punch, with no other time column
  const dateCol = columns.indexOf("date");
  if (!columns.includes("time") && dateCol >= 0 && share(dateCol, "times") >= 0.8) columns[dateCol] = "time";

  return { headerRow, columns };
}

/** Use column `index` for `field` (null: don't use it). A field only one column can hold moves there. */
export function setColumn(columns: ColumnMap, index: number, field: TimecardField | null): ColumnMap {
  return columns.map((f, i) => (i === index ? field : field && f === field && ONE_COLUMN.includes(field) ? null : f));
}

const columnsOf = (columns: ColumnMap, field: TimecardField) => columns.flatMap((f, i) => (f === field ? [i] : []));

/** What the import needs but the layout doesn't give: the ID, the times, and the date unless the times carry it. */
export function missingFields(rows: Cell[][], { headerRow, columns }: TimecardLayout): TimecardField[] {
  const timeCols = columnsOf(columns, "time");
  const datedTimes = rows.slice(headerRow + 1, headerRow + 301).some((r) => timeCols.some((i) => HAS_DATE.test(timeText(r[i]))));
  const missing: TimecardField[] = [];
  if (!columns.includes("employeeId")) missing.push("employeeId");
  if (!columns.includes("date") && !datedTimes) missing.push("date");
  if (!timeCols.length) missing.push("time");
  return missing;
}

/** The rows of a file read with a layout, skipping lines without an ID or a date (titles, totals, blanks). */
export function readTimecard(rows: Cell[][], { headerRow, columns }: TimecardLayout): TimecardRow[] {
  const [idCol] = columnsOf(columns, "employeeId");
  const [dateCol] = columnsOf(columns, "date");
  const [deptCol] = columnsOf(columns, "department");
  const nameCols = columnsOf(columns, "name");
  const timeCols = columnsOf(columns, "time");
  if (idCol === undefined) return [];

  const body = rows.slice(headerRow + 1);
  const dayFirst = guessDayFirst(
    dateCol === undefined ? body.flatMap((r) => timeCols.map((i) => timeText(r[i]))) : body.map((r) => cellText(r[dateCol])),
  );

  const out: TimecardRow[] = [];
  for (const row of body) {
    const id = cleanId(cellText(row[idCol]));
    const punches = timeCols.map((i) => timeText(row[i])).filter(Boolean);
    const date =
      dateCol === undefined
        ? normalizeDate(punches.flatMap((p) => p.match(DATES_IN_TEXT) ?? [])[0] ?? "", dayFirst)
        : normalizeDate(cellText(row[dateCol]), dayFirst);
    if (!id || id.length > 40 || !date) continue;

    const times: string[] = [];
    const invalid: string[] = [];
    for (const p of punches) {
      const read = punchesIn(p);
      times.push(...read.times);
      invalid.push(...read.invalid.map((s) => s.slice(0, 50)));
    }
    out.push({
      employeeId: id,
      name: nameCols.map((i) => cellText(row[i])).filter(Boolean).join(" ").slice(0, 200),
      department: deptCol === undefined ? "" : cellText(row[deptCol]).slice(0, 200),
      date,
      times: times.slice(0, 50),
      invalid: invalid.slice(0, 50),
    });
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
