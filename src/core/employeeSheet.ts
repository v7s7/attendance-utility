// The employee sheet: HR fills full names, schedules and hourly wages for many employees in
// Excel and uploads it, instead of opening each employee. Empty cells change nothing.
import type { EmployeeUpdate, EmployeeView } from "./api.ts";
import type { Schedule, WageProfile } from "./types.ts";
import { WAGE_SCALES } from "./wageTables.ts";
import { hourlyRate } from "./wages.ts";

export const SHEET_COLUMNS = [
  "id",
  "exportedName",
  "fullName",
  "employeeNo",
  "department",
  "schedule",
  "scale",
  "grade",
  "step",
  "rate",
] as const;

export type SheetColumn = (typeof SHEET_COLUMNS)[number];

/** Column titles in the sheet the app gives out. */
export const SHEET_TITLES: Record<SheetColumn, { ar: string; en: string }> = {
  id: { ar: "الرقم الشخصي", en: "CPR" },
  exportedName: { ar: "الاسم في جهاز البصمة", en: "Name in BioTime" },
  fullName: { ar: "الاسم الكامل", en: "Full name" },
  employeeNo: { ar: "الرقم الوظيفي", en: "Employee no." },
  department: { ar: "القسم", en: "Department" },
  schedule: { ar: "جدول الدوام", en: "Work schedule" },
  scale: { ar: "جدول الأجور", en: "Wage table" },
  grade: { ar: "الدرجة", en: "Grade" },
  step: { ar: "الرتبة", en: "Step" },
  rate: { ar: "أجر الساعة (إدخال يدوي)", en: "Hourly wage (typed)" },
};

/** Other titles HR's own sheets may use for the same columns. */
const ALIASES: Record<SheetColumn, string[]> = {
  id: ["الرقم الشخصى", "رقم البطاقة", "employee id", "id"],
  exportedName: ["اسم البصمة", "first name"],
  fullName: ["الاسم", "اسم الموظف", "name", "employee name"],
  employeeNo: ["رقم الموظف", "employee number"],
  department: ["الإدارة", "الادارة", "القسم / الإدارة"],
  schedule: ["الدوام", "نوع الدوام", "schedule"],
  scale: ["الجدول", "الكادر", "scale", "table"],
  grade: [],
  step: ["الخطوة", "rank"],
  rate: ["أجر الساعة", "hourly wage", "hourly rate", "rate"],
};

/** Compare titles and names without case, spaces, brackets or the letter forms people mix up. */
function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s_()\-.:/]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

const HEADER_LOOKUP = new Map<string, SheetColumn>();
for (const col of SHEET_COLUMNS) {
  for (const title of [SHEET_TITLES[col].ar, SHEET_TITLES[col].en, ...ALIASES[col]]) {
    if (!HEADER_LOOKUP.has(norm(title))) HEADER_LOOKUP.set(norm(title), col);
  }
}

/** Words for "the minimum" step, the column before step 1. */
const MINIMUM = ["الحد الأدنى", "الحد الادنى", "الأدنى", "minimum", "min"].map(norm);
const DEFAULT_SCHEDULE = ["الافتراضي", "افتراضي", "default"].map(norm);

export type SheetProblemCode =
  | "missing_id"
  | "unknown_employee"
  | "duplicate"
  | "unknown_schedule"
  | "unknown_scale"
  | "incomplete_wage"
  | "bad_wage"
  | "bad_rate";

export interface SheetProblem {
  /** The row number as Excel shows it. */
  row: number;
  id: string;
  code: SheetProblemCode;
  value: string;
}

export interface SheetUpdate {
  row: number;
  employee: EmployeeView;
  update: EmployeeUpdate;
}

export type SheetResult =
  | { ok: true; columns: SheetColumn[]; updates: SheetUpdate[]; unchanged: number; problems: SheetProblem[] }
  | { ok: false; error: "no_header" };

export type SheetCell = string | number | boolean | Date | null | undefined;

function text(value: SheetCell): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

/** CPRs typed as numbers lose their leading zero in Excel: 010101010 becomes 10101010. */
const digitsKey = (id: string) => id.replace(/\D/g, "").replace(/^0+/, "");

export function matchScale(value: string): string | null {
  const v = norm(value);
  const exact = WAGE_SCALES.find((s) => [s.id, s.ar, s.en, String(s.table)].some((name) => norm(name) === v));
  if (exact) return exact.id;
  if (/عموم|اعتياد|general|ordinary/.test(v)) return "general";
  if (/تخصص|special/.test(v)) return "specialist";
  if (/تنفيذ|exec/.test(v)) return "executive";
  return null;
}

function wholeNumber(value: string): number | null {
  const n = Number(value.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)));
  return Number.isInteger(n) && n >= 0 ? n : null;
}

const sameWage = (a: WageProfile, b: WageProfile) =>
  (a.mode ?? null) === (b.mode ?? null) &&
  (a.mode === "custom"
    ? a.rate === b.rate
    : (a.scale ?? null) === (b.scale ?? null) && (a.grade ?? null) === (b.grade ?? null) && (a.step ?? null) === (b.step ?? null));

/** Read an uploaded sheet (rows of cells) against the employees and schedules in the app. */
export function readEmployeeSheet(rows: SheetCell[][], employees: EmployeeView[], schedules: Schedule[]): SheetResult {
  // The title row is the first one (of the first ten) with a CPR column
  const headerIndex = rows.slice(0, 10).findIndex((r) => r.some((c) => HEADER_LOOKUP.get(norm(text(c))) === "id"));
  if (headerIndex < 0) return { ok: false, error: "no_header" };

  const columns = new Map<SheetColumn, number>();
  rows[headerIndex].forEach((c, i) => {
    const col = HEADER_LOOKUP.get(norm(text(c)));
    if (col && !columns.has(col)) columns.set(col, i);
  });

  const byId = new Map(employees.map((e) => [e.id, e]));
  const byDigits = new Map<string, EmployeeView | null>();
  for (const e of employees) {
    const key = digitsKey(e.id);
    if (key) byDigits.set(key, byDigits.has(key) ? null : e); // null: two employees share it, so no guessing
  }

  const updates: SheetUpdate[] = [];
  const problems: SheetProblem[] = [];
  const seen = new Set<string>();
  let unchanged = 0;

  rows.slice(headerIndex + 1).forEach((cells, i) => {
    const row = headerIndex + i + 2;
    const get = (col: SheetColumn) => {
      const index = columns.get(col);
      return index === undefined ? "" : text(cells[index]);
    };
    const id = get("id");
    const problem = (code: SheetProblemCode, value = "") => problems.push({ row, id, code, value });

    if (!id) {
      if (cells.some((c) => text(c) !== "")) problem("missing_id");
      return;
    }
    const employee = byId.get(id) ?? (digitsKey(id) ? byDigits.get(digitsKey(id)) : undefined);
    if (!employee) return void problem("unknown_employee");
    if (seen.has(employee.id)) return void problem("duplicate");
    seen.add(employee.id);
    const problemsBefore = problems.length;

    const update: EmployeeUpdate = {};
    for (const field of ["fullName", "employeeNo", "department"] as const) {
      const value = get(field);
      if (value && value !== employee[field]) update[field] = value;
    }

    const scheduleText = get("schedule");
    if (scheduleText) {
      const choice = DEFAULT_SCHEDULE.includes(norm(scheduleText))
        ? null
        : (schedules.find((s) => norm(s.name) === norm(scheduleText))?.id ?? undefined);
      if (choice === undefined) problem("unknown_schedule", scheduleText);
      else if (choice !== employee.scheduleChoice) update.scheduleId = choice;
    }

    const [scaleText, gradeText, stepText, rateText] = [get("scale"), get("grade"), get("step"), get("rate")];
    let wage: WageProfile | null = null;
    if (scaleText || gradeText || stepText) {
      // Only the cells that are filled change; e.g. a new step keeps the table and grade
      const base = employee.wage.mode === "table" ? employee.wage : {};
      const scale = scaleText ? matchScale(scaleText) : (base.scale ?? null);
      const grade = gradeText ? wholeNumber(gradeText) : (base.grade ?? null);
      const step = stepText ? (MINIMUM.includes(norm(stepText)) ? 0 : wholeNumber(stepText)) : (base.step ?? null);
      const profile: WageProfile = { mode: "table", scale: scale ?? undefined, grade: grade ?? undefined, step: step ?? undefined };
      if (scaleText && !scale) problem("unknown_scale", scaleText);
      else if (!scale || grade === null || step === null) problem("incomplete_wage");
      else if (hourlyRate(profile) === null) problem("bad_wage", [scaleText, gradeText, stepText].filter(Boolean).join(" / "));
      else wage = profile;
    } else if (rateText) {
      const rate = Number(rateText.replace(",", "."));
      if (rate > 0 && rate < 1000) wage = { mode: "custom", rate };
      else problem("bad_rate", rateText);
    }
    if (wage && !sameWage(wage, employee.wage)) update.wage = wage;

    if (Object.keys(update).length) updates.push({ row, employee, update });
    else if (problems.length === problemsBefore) unchanged++;
  });

  return { ok: true, columns: SHEET_COLUMNS.filter((c) => columns.has(c)), updates, unchanged, problems };
}

/** A cell of the sheet the app gives out: plain values, or styled ones for the title row and CPRs. */
export type SheetOutCell =
  | string
  | number
  | null
  | { value: string; type?: StringConstructor; fontWeight?: "bold"; backgroundColor?: string };

/** The employee sheet HR downloads: a title row, then every employee with what is set today. */
export function employeeSheetData(employees: EmployeeView[], lang: "ar" | "en", minimumWord: string): SheetOutCell[][] {
  const scaleName = (id: string | undefined) => {
    const scale = WAGE_SCALES.find((s) => s.id === id);
    return scale ? scale[lang] : "";
  };
  return [
    SHEET_COLUMNS.map((c) => ({ value: SHEET_TITLES[c][lang], fontWeight: "bold" as const, backgroundColor: "#CCE7E1" })),
    ...employees.map((e): SheetOutCell[] => {
      const table = e.wage.mode === "table" ? e.wage : null;
      return [
        // As text, so Excel keeps the leading zero of the CPR
        { value: e.id, type: String },
        e.exportedName,
        e.fullName,
        e.employeeNo,
        e.department,
        e.scheduleChoice === null ? "" : e.scheduleName,
        table ? scaleName(table.scale) : "",
        table?.grade ?? null,
        table?.step === undefined ? null : table.step === 0 ? minimumWord : table.step,
        e.wage.mode === "custom" ? (e.wage.rate ?? null) : null,
      ];
    }),
  ];
}
