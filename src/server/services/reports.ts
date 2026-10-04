import type {
  EmployeeMonthReport,
  EmployeePeriodReport,
  EmployeeView,
  LockInfo,
  MonthListItem,
  MonthOverview,
  MonthReview,
  PeriodOverview,
  PossibleHoliday,
} from "../../core/api.ts";
import { sumMonths } from "../../core/period.ts";
import { buildEmployeeMonth } from "../../core/report.ts";
import { DEFAULT_SCHEDULES } from "../../core/schedule.ts";
import { firstDayOfMonth, lastDayOfMonth, localToday, monthOf, monthsBetween } from "../../core/time.ts";
import type { Holiday, Rules, Schedule } from "../../core/types.ts";
import { hourlyRate } from "../../core/wages.ts";
import type { Db } from "../db/database.ts";
import { notFound } from "../http.ts";
import {
  adjustmentsFor,
  annualLeaveDays,
  employeeDataRanges,
  coverageFor,
  dataRanges,
  employeesWithData,
  issuesFor,
  punchesFor,
} from "../store/attendance.ts";
import { displayName, getEmployee, listEmployees, type Employee } from "../store/employees.ts";
import { getLock, getSnapshot, listLocks, lockMonth } from "../store/locks.ts";
import {
  getDefaultScheduleId,
  getOrganization,
  getRules,
  listHolidays,
  listSchedules,
} from "../store/settings.ts";

interface Snapshot {
  overview: MonthOverview;
  employees: Record<string, EmployeeMonthReport>;
}

interface Context {
  today: string;
  rules: Rules;
  holidays: Holiday[];
  schedules: Schedule[];
  defaultScheduleId: number;
}

function loadContext(db: Db): Context {
  return {
    today: localToday(),
    rules: getRules(db),
    holidays: listHolidays(db),
    schedules: listSchedules(db),
    defaultScheduleId: getDefaultScheduleId(db),
  };
}

/** The employee's schedule, falling back to the default when none (or a deleted one) is set. */
function scheduleFor(employee: Employee, ctx: Context): Schedule {
  const byId = (id: number | null) => ctx.schedules.find((s) => s.id === id);
  return byId(employee.scheduleId) ?? byId(ctx.defaultScheduleId) ?? ctx.schedules[0] ?? { ...DEFAULT_SCHEDULES[0], id: 0 };
}

export function employeeView(employee: Employee, schedule: Schedule): EmployeeView {
  return {
    id: employee.id,
    name: displayName(employee),
    exportedName: employee.name,
    fullName: employee.fullName,
    employeeNo: employee.employeeNo,
    department: employee.department,
    scheduleChoice: employee.scheduleId,
    scheduleId: schedule.id,
    scheduleName: schedule.name,
    wage: employee.wage,
    rate: hourlyRate(employee.wage),
    active: employee.active,
  };
}

/** All employees with their schedule and hourly wage. */
export function listEmployeeViews(db: Db): EmployeeView[] {
  const ctx = loadContext(db);
  return listEmployees(db).map((e) => employeeView(e, scheduleFor(e, ctx)));
}

/** The schedule that applies to an employee. */
export function employeeSchedule(db: Db, employee: Employee): Schedule {
  return scheduleFor(employee, loadContext(db));
}

function compute(db: Db, employee: Employee, month: string, ctx: Context, locked: LockInfo | null): EmployeeMonthReport {
  const from = firstDayOfMonth(month);
  const to = lastDayOfMonth(month);
  const schedule = scheduleFor(employee, ctx);
  const view = employeeView(employee, schedule);
  const { days, summary } = buildEmployeeMonth({
    month,
    today: ctx.today,
    schedule,
    rules: ctx.rules,
    holidays: ctx.holidays.filter((h) => h.date >= from && h.date <= to),
    coverage: coverageFor(db, employee.id, from, to),
    punches: punchesFor(db, employee.id, from, to),
    invalid: issuesFor(db, employee.id, from, to),
    adjustments: adjustmentsFor(db, employee.id, from, to),
    rate: view.rate,
  });
  const annualLeaveYear = annualLeaveDays(db, employee.id, `${month.slice(0, 4)}-01-01`, to);
  return { month, locked, organization: getOrganization(db), employee: view, schedule, days, summary, annualLeaveYear };
}

/**
 * Working days on which at least 80% of three or more employees have no punch at all:
 * most likely a public holiday that has not been added, which would make everyone absent.
 */
function possibleHolidays(reports: EmployeeMonthReport[]): PossibleHoliday[] {
  const byDate = new Map<string, PossibleHoliday>();
  for (const { days } of reports) {
    for (const d of days) {
      if (!["OK", "SHORT", "ABSENT", "INCOMPLETE", "EXCUSED"].includes(d.status)) continue;
      const entry = byDate.get(d.date) ?? { date: d.date, weekday: d.weekday, absent: 0, total: 0 };
      entry.total++;
      if (d.status === "ABSENT") entry.absent++;
      byDate.set(d.date, entry);
    }
  }
  return [...byDate.values()].filter((e) => e.total >= 3 && e.absent / e.total >= 0.8).sort((a, b) => a.date.localeCompare(b.date));
}

function computeOverview(db: Db, month: string, ctx: Context): { overview: MonthOverview; reports: EmployeeMonthReport[] } {
  const ids = employeesWithData(db, firstDayOfMonth(month), lastDayOfMonth(month));
  const reports = ids
    .map((id) => getEmployee(db, id))
    .filter((e): e is Employee => e !== null && e.active)
    .map((e) => compute(db, e, month, ctx, null))
    .sort((a, b) => a.employee.name.localeCompare(b.employee.name));
  return {
    overview: {
      month,
      locked: null,
      organization: getOrganization(db),
      rows: reports.map((r) => ({ employee: r.employee, summary: r.summary })),
      possibleHolidays: possibleHolidays(reports),
      missingDays: [...new Set(reports.flatMap((rep) => rep.days.filter((d) => d.status === "NO_DATA").map((d) => d.date)))].sort(),
    },
    reports,
  };
}

export function monthOverview(db: Db, month: string): MonthOverview {
  const lock = getLock(db, month);
  if (lock) {
    const snapshot = getSnapshot<Snapshot>(db, month);
    // A locked month keeps its approved numbers, so there is nothing to suggest
    if (snapshot) return { ...snapshot.overview, locked: lock, possibleHolidays: [], missingDays: [] };
  }
  return computeOverview(db, month, loadContext(db)).overview;
}

/** The days HR should check in a month: missing punches and absences, oldest first. */
export function monthReview(db: Db, month: string): MonthReview {
  const lock = getLock(db, month);
  const frozen = lock ? getSnapshot<Snapshot>(db, month) : null;
  const reports = frozen ? Object.values(frozen.employees) : computeOverview(db, month, loadContext(db)).reports;
  const items = reports.flatMap(({ employee: e, days }) =>
    days
      .filter((d) => d.status === "INCOMPLETE" || d.status === "ABSENT")
      .map((day) => ({ employee: { id: e.id, name: e.name, department: e.department }, day })),
  );
  items.sort((a, b) => a.day.date.localeCompare(b.day.date) || a.employee.name.localeCompare(b.employee.name));
  return { month, locked: lock, items };
}

export function employeeMonthReport(db: Db, employeeId: string, month: string): EmployeeMonthReport {
  const lock = getLock(db, month);
  if (lock) {
    const frozen = getSnapshot<Snapshot>(db, month)?.employees[employeeId];
    if (frozen) return { ...frozen, locked: lock };
  }
  const employee = getEmployee(db, employeeId);
  if (!employee) throw notFound("employee_not_found");
  return compute(db, employee, month, loadContext(db), lock);
}

/** Every month that has data, newest first, with its totals. */
export function listMonths(db: Db): MonthListItem[] {
  const current = monthOf(localToday());
  const months = new Set<string>();
  for (const r of dataRanges(db)) for (const m of monthsBetween(r.from, r.to)) if (m <= current) months.add(m);
  for (const l of listLocks(db)) months.add(l.month);

  const ctx = loadContext(db);
  return [...months]
    .sort()
    .reverse()
    .map((month) => {
      const locked = getLock(db, month);
      const overview = locked
        ? (getSnapshot<Snapshot>(db, month)?.overview ?? computeOverview(db, month, ctx).overview)
        : computeOverview(db, month, ctx).overview;
      const summaries = overview.rows.map((r) => r.summary);
      return {
        month,
        locked,
        employees: summaries.length,
        needsReview: summaries.reduce((n, s) => n + s.needsReview, 0),
        missingWage: summaries.filter((s) => s.rate === null).length,
        deductibleMin: summaries.reduce((n, s) => n + s.deductibleMin, 0),
        deductionFils: summaries.reduce((n, s) => n + (s.deductionFils ?? 0), 0),
        partial: summaries.some((s) => s.partial),
      };
    });
}

/** Lock a month, storing its report exactly as it is now. */
export function freezeMonth(db: Db, month: string, userId: number): void {
  const { overview, reports } = computeOverview(db, month, loadContext(db));
  const snapshot: Snapshot = { overview, employees: Object.fromEntries(reports.map((r) => [r.employee.id, r])) };
  lockMonth(db, month, userId, snapshot);
}

/** The months an employee has data for, newest first. */
export function employeeMonths(db: Db, employeeId: string): string[] {
  const current = monthOf(localToday());
  const months = new Set<string>();
  for (const r of employeeDataRanges(db, employeeId)) for (const m of monthsBetween(r.from, r.to)) if (m <= current) months.add(m);
  return [...months].sort().reverse();
}

/** One employee from one month to another: the months with data, each worked out on its own. */
export function employeePeriod(db: Db, employeeId: string, from: string, to: string): EmployeePeriodReport {
  const employee = getEmployee(db, employeeId);
  if (!employee) throw notFound("employee_not_found");
  const reports = employeeMonths(db, employeeId)
    .filter((m) => m >= from && m <= to)
    .sort()
    .map((m) => employeeMonthReport(db, employeeId, m));
  return {
    from,
    to,
    organization: getOrganization(db),
    employee: reports.at(-1)?.employee ?? employeeView(employee, employeeSchedule(db, employee)),
    months: reports,
    totals: sumMonths(reports.map((r) => r.summary)),
  };
}

/** Everyone from one month to another: each employee's months added up. */
export function periodOverview(db: Db, from: string, to: string): PeriodOverview {
  const months = listMonths(db)
    .map((m) => m.month)
    .filter((m) => m >= from && m <= to)
    .sort();
  const staff = new Map<string, { employee: EmployeeView; summaries: EmployeeMonthReport["summary"][] }>();
  for (const month of months) {
    for (const row of monthOverview(db, month).rows) {
      const entry = staff.get(row.employee.id) ?? { employee: row.employee, summaries: [] };
      entry.employee = row.employee; // the latest month's details
      entry.summaries.push(row.summary);
      staff.set(row.employee.id, entry);
    }
  }
  return {
    from,
    to,
    organization: getOrganization(db),
    months,
    rows: [...staff.values()]
      .map((e) => ({ employee: e.employee, totals: sumMonths(e.summaries) }))
      .sort((a, b) => a.employee.name.localeCompare(b.employee.name)),
  };
}
