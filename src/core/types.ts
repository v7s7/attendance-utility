// Shared types for the rules engine, the API and the web app.

/** How a schedule decides lateness and which hours count. */
export type ScheduleKind = "flexible" | "fixed" | "hours";

/** A work schedule that HR assigns to employees. */
export interface Schedule {
  id: number;
  name: string;
  kind: ScheduleKind;
  /** flexible / fixed: counting starts here. hours: the usual start, only used to read a lone punch. */
  start: string;
  /** flexible: arriving after this is late. Not used by the other kinds. */
  latestStart: string;
  /** Required hours per weekday, Sunday first, as "HH:MM"; null means a day off. */
  hours: (string | null)[];
}

/** Deduction rules shared by every schedule. */
export interface Rules {
  deductEarlyLeave: boolean;
  /** Lateness forgiven each month before deducting. */
  allowanceHours: number;
  absenceMode: "list" | "deduct";
  incompleteMode: "hold" | "deduct";
  permissionLimitCount: number;
  permissionLimitTime: string;
  /** Taps this close together count as one punch. */
  duplicateWindowMin: number;
}

export const EXCUSES = ["sick", "annual", "permission", "health", "mission", "other"] as const;
export type Excuse = (typeof EXCUSES)[number];

/**
 * HR's decision for an absence that is not leave: "salary" deducts the day's hours at the
 * hourly wage, separately from lateness. (Sick and annual leave are excuses.)
 */
export type AbsenceDecision = "salary";

/** What HR recorded for one employee on one day. */
export interface Adjustment {
  inTime: string | null;
  outTime: string | null;
  excuse: Excuse | null;
  note: string;
  absence?: AbsenceDecision | null;
}

export interface Holiday {
  date: string;
  name: string;
}

export interface DateRange {
  from: string;
  to: string;
}

/** Hourly wage source: a step in the CSB wage tables, or a rate typed by HR. */
export interface WageProfile {
  mode?: "table" | "custom";
  scale?: string;
  grade?: number;
  step?: number;
  rate?: number;
}

export type NoteCode =
  | "unsorted"
  | "duplicates"
  | "singleIn"
  | "singleOut"
  | "multi"
  | "inAfterMidday"
  | "outBeforeMidday"
  | "invalid"
  /** Every tap of the day, when there were more than an IN and an OUT. */
  | "punches";

/** An explanation of a guess made while reading punches, shown to HR. */
export interface Note {
  code: NoteCode;
  n?: number;
  at?: string;
}

export type DayStatus =
  | "OK"
  | "SHORT"
  | "ABSENT"
  | "INCOMPLETE"
  | "IN_PROGRESS"
  | "EXCUSED"
  | "HOLIDAY"
  | "NO_DATA";

export type IncompleteReason = "missingIn" | "missingOut" | "invalid";

export interface DayResult {
  date: string;
  weekday: number;
  requiredMin: number;
  status: DayStatus;
  reason: IncompleteReason | null;
  inTime: string | null;
  outTime: string | null;
  inManual: boolean;
  outManual: boolean;
  /** What the device recorded, before any HR edit. */
  deviceIn: string | null;
  deviceOut: string | null;
  workedMin: number | null;
  /** Worked minus required: positive above, negative below. */
  diffMin: number | null;
  lateMin: number;
  earlyMin: number;
  /** Hours-only schedules: the shortage, which has no late/early split. */
  shortfallMin: number;
  excuse: Excuse | null;
  /** For absent days: HR decided to deduct it from the salary. */
  absence: AbsenceDecision | null;
  /** For excused days, the time that would otherwise have been deducted. */
  excusedMin: number;
  note: string;
  holidayName: string;
  notes: Note[];
}

export interface MonthSummary {
  month: string;
  workingDays: number;
  presentDays: number;
  okDays: number;
  shortDays: number;
  absentDays: number;
  incompleteDays: number;
  inProgressDays: number;
  excusedDays: number;
  sickDays: number;
  annualDays: number;
  holidayDays: number;
  noDataDays: number;
  lateDays: number;
  lateMin: number;
  earlyMin: number;
  shortfallMin: number;
  extraDays: number;
  /** Time above the required hours; shown only, it never offsets lateness. */
  extraMin: number;
  workedMin: number;
  /** The hours the employee was expected to work: every working day except holidays, leave and today. */
  requiredMin: number;
  absenceMin: number;
  /** Absent days HR deducted from the salary. */
  salaryAbsenceDays: number;
  /** Absent days still waiting for HR's decision (sick, annual leave or salary). */
  pendingAbsentDays: number;
  incompleteMin: number;
  permissionCount: number;
  permissionMin: number;
  permissionOver: boolean;
  latenessMin: number;
  allowanceMin: number;
  /** The monthly allowance in force when the month was worked out. */
  allowanceLimitMin: number;
  deductAbsenceMin: number;
  deductIncompleteMin: number;
  deductibleMin: number;
  rate: number | null;
  /** 1 BHD = 1000 fils; null until the hourly wage is set. */
  deductionFils: number | null;
  /** The deduction in two parts: lateness (after the allowance) and absences from the salary. */
  latenessFils: number | null;
  absenceFils: number | null;
  needsReview: number;
  /** Some days in the month have no attendance data. */
  partial: boolean;
}
