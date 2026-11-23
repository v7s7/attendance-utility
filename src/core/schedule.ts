import { hmToMin, weekdayOf } from "./time.ts";
import type { Rules, Schedule, ScheduleKind } from "./types.ts";

// Defaults follow CSB Instruction 1/2023: 07:00-14:15 Sunday to Wednesday,
// 07:00-14:00 Thursday, with up to an hour of flexible start.
//                   Sun      Mon      Tue      Wed      Thu      Fri   Sat
const CSB_HOURS = ["07:15", "07:15", "07:15", "07:15", "07:00", null, null];

// «دوام ثابت», the default: arrive 07:00-08:00, leave once the day's hours are done.
// «دوام مرن»: all the time from the first punch to the last counts, overtime too.
export const DEFAULT_SCHEDULES: Omit<Schedule, "id">[] = [
  { name: "دوام ثابت", kind: "fixed", start: "07:00", latestStart: "08:00", hours: CSB_HOURS },
  { name: "دوام مرن", kind: "hours", start: "07:00", latestStart: "07:00", hours: CSB_HOURS },
];

export const DEFAULT_RULES: Rules = {
  deductEarlyLeave: true,
  // The first 7:15 of lateness and early leave each month is not deducted, only the time above it
  allowanceHours: 7.25,
  absenceMode: "list",
  incompleteMode: "hold",
  permissionLimitCount: 4,
  permissionLimitTime: "07:15",
  duplicateWindowMin: 15,
};

/** How one working day is measured under a schedule. All values in minutes. */
export interface DayRule {
  kind: ScheduleKind;
  required: number;
  /** Counting starts here (fixed). */
  start: number;
  /** Arriving after this is late (fixed). */
  latestStart: number;
  /** The latest end of the day: someone who starts at latestStart (fixed). */
  end: number;
  /** A lone punch before this is read as IN. */
  midday: number;
}

/** The rule for a date, or null when the schedule has the day off. */
export function dayRule(schedule: Schedule, date: string): DayRule | null {
  const required = hmToMin(schedule.hours[weekdayOf(date)]);
  if (required === null) return null;

  const start = hmToMin(schedule.start) ?? 0;
  if (schedule.kind === "hours") {
    return { kind: "hours", required, start, latestStart: start, end: 24 * 60, midday: start + required / 2 };
  }

  const latestStart = Math.max(start, hmToMin(schedule.latestStart) ?? start);
  const end = latestStart + required;
  return { kind: "fixed", required, start, latestStart, end, midday: (start + end) / 2 };
}

export interface Measured {
  workedMin: number;
  diffMin: number;
  lateMin: number;
  earlyMin: number;
  shortfallMin: number;
}

/**
 * Measure a day with both punches.
 * - fixed: each person's day ends the required hours after they started, where the
 *   start counts from `start` at the earliest and `latestStart` at the latest: on a
 *   07:00-08:00 schedule with 7:15 required, 07:13 leaves at 14:28, 06:50 at 14:15
 *   and 08:30 still at 15:15. Nothing before `start` or after that end counts, so
 *   there is no extra time. Arriving after latestStart is late and the rest of the
 *   shortage is early leave, so a late morning cannot be made up by staying later.
 * - hours: the actual time from IN to OUT counts, overtime too, with no lateness rules.
 */
export function measureDay(inTime: string, outTime: string, rule: DayRule): Measured | null {
  const inMin = hmToMin(inTime);
  const outMin = hmToMin(outTime);
  if (inMin === null || outMin === null) return null;

  if (rule.kind === "hours") {
    const workedMin = Math.max(0, outMin - inMin);
    const shortfallMin = Math.max(0, rule.required - workedMin);
    return { workedMin, diffMin: workedMin - rule.required, lateMin: 0, earlyMin: 0, shortfallMin };
  }

  const end = Math.min(Math.max(inMin, rule.start), rule.latestStart) + rule.required;
  const workedMin = Math.max(0, Math.min(outMin, end) - Math.max(inMin, rule.start));
  const shortMin = Math.max(0, rule.required - workedMin);
  const lateMin = Math.min(shortMin, Math.max(0, inMin - rule.latestStart));
  return {
    workedMin,
    diffMin: workedMin - rule.required,
    lateMin,
    earlyMin: shortMin - lateMin,
    shortfallMin: 0,
  };
}
