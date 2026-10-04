import { resolveInOut } from "./punches.ts";
import { dayRule, measureDay, type DayRule } from "./schedule.ts";
import { datesBetween, firstDayOfMonth, hmToMin, inRanges, lastDayOfMonth, weekdayOf } from "./time.ts";
import type {
  Adjustment,
  DateRange,
  DayResult,
  DayStatus,
  Holiday,
  MonthSummary,
  Rules,
  Schedule,
} from "./types.ts";
import { deductionFils } from "./wages.ts";

/** Everything needed to work out one employee's month. Records are keyed by date. */
export interface EmployeeMonthInput {
  month: string;
  today: string;
  schedule: Schedule;
  rules: Rules;
  holidays: Holiday[];
  /** Date ranges covered by imported attendance files; other days show as "no data". */
  coverage: DateRange[];
  punches: Record<string, string[]>;
  /** Unreadable time entries per date. */
  invalid: Record<string, number>;
  adjustments: Record<string, Adjustment>;
  rate: number | null;
}

export interface EmployeeMonth {
  days: DayResult[];
  summary: MonthSummary;
}

export function buildEmployeeMonth(input: EmployeeMonthInput): EmployeeMonth {
  const first = firstDayOfMonth(input.month);
  const monthEnd = lastDayOfMonth(input.month);
  const last = input.today < monthEnd ? input.today : monthEnd;

  const days: DayResult[] = [];
  for (const date of first <= last ? datesBetween(first, last) : []) {
    const rule = dayRule(input.schedule, date);
    if (rule) days.push(buildDay(date, rule, input));
  }
  return { days, summary: summarize(input.month, days, input) };
}

function blankDay(date: string, rule: DayRule): DayResult {
  return {
    date,
    weekday: weekdayOf(date),
    requiredMin: rule.required,
    status: "OK",
    reason: null,
    inTime: null,
    outTime: null,
    inManual: false,
    outManual: false,
    deviceIn: null,
    deviceOut: null,
    workedMin: null,
    diffMin: null,
    lateMin: 0,
    earlyMin: 0,
    shortfallMin: 0,
    excuse: null,
    absence: null,
    excusedMin: 0,
    note: "",
    holidayName: "",
    notes: [],
  };
}

function buildDay(date: string, rule: DayRule, input: EmployeeMonthInput): DayResult {
  const day = blankDay(date, rule);

  const holiday = input.holidays.find((h) => h.date === date);
  if (holiday) return { ...day, status: "HOLIDAY", holidayName: holiday.name };

  const times = input.punches[date] ?? [];
  const invalid = input.invalid[date] ?? 0;
  const adjustment = input.adjustments[date];
  if (!inRanges(date, input.coverage) && !times.length && !invalid && !adjustment) {
    return { ...day, status: "NO_DATA" };
  }

  if (times.length || invalid) {
    const io = resolveInOut(times, {
      duplicateWindowSec: input.rules.duplicateWindowMin * 60,
      middaySec: Math.round(rule.midday * 60),
    });
    day.inTime = io.inTime;
    day.outTime = io.outTime;
    day.notes = invalid ? [{ code: "invalid", n: invalid }, ...io.notes] : io.notes;
  }
  day.deviceIn = day.inTime;
  day.deviceOut = day.outTime;

  // Times typed by HR from the manual register replace what the device recorded
  if (adjustment?.inTime) {
    day.inTime = adjustment.inTime;
    day.inManual = true;
  }
  if (adjustment?.outTime) {
    day.outTime = adjustment.outTime;
    day.outManual = true;
  }
  day.excuse = adjustment?.excuse ?? null;
  day.note = adjustment?.note ?? "";

  let status: DayStatus;
  const measured = day.inTime && day.outTime ? measureDay(day.inTime, day.outTime, rule) : null;
  if (measured) {
    Object.assign(day, measured);
    status = measured.lateMin + measured.earlyMin + measured.shortfallMin > 0 ? "SHORT" : "OK";
  } else if (!day.inTime && !day.outTime) {
    status = invalid ? "INCOMPLETE" : "ABSENT";
    if (invalid) day.reason = "invalid";
  } else if (!day.outTime && date === input.today) {
    status = "IN_PROGRESS";
  } else {
    status = "INCOMPLETE";
    day.reason = day.inTime ? "missingOut" : "missingIn";
  }

  if (day.excuse) {
    // Nothing is deducted for an excused day; keep what was forgiven for the permission limits
    const forgiven = measured
      ? measured.lateMin + measured.earlyMin + measured.shortfallMin
      : status === "IN_PROGRESS"
        ? 0
        : rule.required;
    return { ...day, status: "EXCUSED", excusedMin: forgiven };
  }
  if (status === "ABSENT" && adjustment?.absence) day.absence = adjustment.absence;
  return { ...day, status };
}

function summarize(month: string, days: DayResult[], input: EmployeeMonthInput): MonthSummary {
  const { rules } = input;
  const s: MonthSummary = {
    month,
    workingDays: 0,
    presentDays: 0,
    okDays: 0,
    shortDays: 0,
    absentDays: 0,
    incompleteDays: 0,
    inProgressDays: 0,
    excusedDays: 0,
    sickDays: 0,
    annualDays: 0,
    holidayDays: 0,
    noDataDays: 0,
    lateDays: 0,
    lateMin: 0,
    earlyMin: 0,
    shortfallMin: 0,
    extraDays: 0,
    extraMin: 0,
    workedMin: 0,
    requiredMin: 0,
    absenceMin: 0,
    salaryAbsenceDays: 0,
    pendingAbsentDays: 0,
    incompleteMin: 0,
    permissionCount: 0,
    permissionMin: 0,
    permissionOver: false,
    latenessMin: 0,
    allowanceMin: 0,
    allowanceLimitMin: Math.round(input.rules.allowanceHours * 60),
    deductAbsenceMin: 0,
    deductIncompleteMin: 0,
    deductibleMin: 0,
    rate: input.rate,
    deductionFils: null,
    latenessFils: null,
    absenceFils: null,
    needsReview: 0,
    partial: false,
  };

  for (const d of days) {
    if (d.status === "HOLIDAY") {
      s.holidayDays++;
      continue;
    }
    s.workingDays++;

    switch (d.status) {
      case "OK":
      case "SHORT":
        s.presentDays++;
        if (d.status === "OK") s.okDays++;
        else s.shortDays++;
        s.workedMin += d.workedMin ?? 0;
        s.requiredMin += d.requiredMin;
        s.lateMin += d.lateMin;
        s.earlyMin += d.earlyMin;
        s.shortfallMin += d.shortfallMin;
        if (d.lateMin > 0) s.lateDays++;
        if ((d.diffMin ?? 0) > 0) {
          s.extraDays++;
          s.extraMin += d.diffMin ?? 0;
        }
        break;
      case "ABSENT":
        s.absentDays++;
        s.absenceMin += d.requiredMin;
        s.requiredMin += d.requiredMin;
        if (d.absence === "salary") {
          s.salaryAbsenceDays++;
          s.deductAbsenceMin += d.requiredMin;
        } else if (rules.absenceMode === "deduct") {
          s.deductAbsenceMin += d.requiredMin;
        } else {
          s.pendingAbsentDays++;
        }
        break;
      case "INCOMPLETE":
        s.presentDays++;
        s.incompleteDays++;
        s.incompleteMin += d.requiredMin;
        s.requiredMin += d.requiredMin;
        break;
      case "IN_PROGRESS":
        s.presentDays++;
        s.inProgressDays++;
        break;
      case "EXCUSED":
        s.excusedDays++;
        if (d.excuse === "sick") s.sickDays++;
        if (d.excuse === "annual") s.annualDays++;
        if (d.excuse === "permission") {
          s.permissionCount++;
          s.permissionMin += d.excusedMin;
        }
        break;
      case "NO_DATA":
        s.noDataDays++;
        break;
    }
  }

  s.latenessMin = s.lateMin + (rules.deductEarlyLeave ? s.earlyMin : 0) + s.shortfallMin;
  s.allowanceMin = Math.min(s.latenessMin, Math.round(rules.allowanceHours * 60));
  s.deductIncompleteMin = rules.incompleteMode === "deduct" ? s.incompleteMin : 0;
  s.deductibleMin = s.latenessMin - s.allowanceMin + s.deductAbsenceMin + s.deductIncompleteMin;
  // Absences from the salary are priced on their own, at the same hourly wage, so the
  // allowance never covers them and each part can be checked by hand
  s.latenessFils = deductionFils(s.deductibleMin - s.deductAbsenceMin, input.rate);
  s.absenceFils = deductionFils(s.deductAbsenceMin, input.rate);
  s.deductionFils = s.latenessFils === null || s.absenceFils === null ? null : s.latenessFils + s.absenceFils;

  s.needsReview = (rules.incompleteMode === "hold" ? s.incompleteDays : 0) + s.pendingAbsentDays;
  s.permissionOver =
    s.permissionCount > rules.permissionLimitCount ||
    s.permissionMin > (hmToMin(rules.permissionLimitTime) ?? Number.POSITIVE_INFINITY);
  s.partial = s.noDataDays > 0;
  return s;
}
