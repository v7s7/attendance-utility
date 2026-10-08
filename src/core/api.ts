// The shapes the API sends and receives, shared by the server and the web app.
import type { PeriodTotals } from "./period.ts";
import type { DayResult, Holiday, MonthSummary, Rules, Schedule, WageProfile } from "./types.ts";

export type Role = "admin" | "hr";

export interface User {
  id: number;
  username: string;
  displayName: string;
  role: Role;
  active: boolean;
}

export interface Organization {
  /** Shown at the top of printed reports, e.g. the directorate's name. */
  name: string;
  /** The department or unit line under it. */
  unit: string;
}

export interface SettingsData {
  rules: Rules;
  organization: Organization;
  defaultScheduleId: number;
  schedules: Schedule[];
  holidays: Holiday[];
}

export interface LockInfo {
  month: string;
  lockedBy: string;
  lockedAt: string;
}

export interface EmployeeView {
  /** Employee ID from the attendance system (the CPR). */
  id: string;
  /** Full name typed by HR, else the exported name. */
  name: string;
  exportedName: string;
  fullName: string;
  employeeNo: string;
  department: string;
  /** The schedule HR chose; null means the default schedule. */
  scheduleChoice: number | null;
  /** The schedule that applies. */
  scheduleId: number;
  scheduleName: string;
  wage: WageProfile;
  rate: number | null;
  active: boolean;
}

/** The details HR can change for an employee; anything left out stays as it is. */
export interface EmployeeUpdate {
  fullName?: string;
  employeeNo?: string;
  department?: string;
  scheduleId?: number | null;
  wage?: WageProfile;
  active?: boolean;
}

export interface EmployeeMonthReport {
  month: string;
  locked: LockInfo | null;
  organization: Organization;
  employee: EmployeeView;
  schedule: Schedule;
  days: DayResult[];
  summary: MonthSummary;
  /** Annual leave days taken from the start of the year to the end of this month. */
  annualLeaveYear: number;
}

/** A working day on which almost nobody punched: probably a public holiday that is not set yet. */
export interface PossibleHoliday {
  date: string;
  weekday: number;
  absent: number;
  total: number;
}

export interface MonthOverview {
  month: string;
  locked: LockInfo | null;
  organization: Organization;
  rows: { employee: EmployeeView; summary: MonthSummary }[];
  possibleHolidays: PossibleHoliday[];
  /** Working days that some employee has no data for (outside every imported period). */
  missingDays: string[];
}

/** One employee over several months: each month as it stands (or as approved), and the sum. */
export interface EmployeePeriodReport {
  from: string;
  to: string;
  organization: Organization;
  employee: EmployeeView;
  /** Each month in full: its days and its own totals. */
  months: EmployeeMonthReport[];
  totals: PeriodTotals;
}

/** Everyone over several months: each employee's months added up. */
export interface PeriodOverview {
  from: string;
  to: string;
  organization: Organization;
  /** The months in the period that have data. */
  months: string[];
  rows: { employee: EmployeeView; totals: PeriodTotals }[];
}

/** A day HR should check: a missing punch, or an absence that may need an excuse. */
export interface ReviewItem {
  employee: { id: string; name: string; department: string };
  day: DayResult;
}

export interface MonthReview {
  month: string;
  locked: LockInfo | null;
  /** Oldest day first; on each day, by name. */
  items: ReviewItem[];
}

export interface MonthListItem {
  month: string;
  locked: LockInfo | null;
  employees: number;
  needsReview: number;
  missingWage: number;
  deductibleMin: number;
  deductionFils: number;
  partial: boolean;
}

export interface ImportRecord {
  id: number;
  fileName: string;
  userName: string;
  createdAt: string;
  dateFrom: string;
  dateTo: string;
  rowCount: number;
  employeeCount: number;
  punchesAdded: number;
}

export interface ImportResult {
  importId: number;
  employees: number;
  newEmployees: number;
  punchesAdded: number;
  punchesExisting: number;
  unreadable: number;
}

export interface ImportDeleted {
  punchesRemoved: number;
  /** Employees only this import had added. */
  employeesRemoved: number;
}

export interface AuditEntry {
  id: number;
  at: string;
  userName: string;
  action: string;
  target: string;
  details: Record<string, unknown>;
}

/** Error body for any failed request; `error` is a code the web app translates. */
export interface ApiErrorBody {
  error: string;
  message?: string;
  issues?: { path: string; message: string }[];
}
