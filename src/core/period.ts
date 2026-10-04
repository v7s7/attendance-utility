// Several months together. Each month is worked out on its own (the monthly allowance belongs
// to its month), and a period is the sum of its months.
import type { MonthSummary } from "./types.ts";

export interface PeriodTotals {
  months: number;
  workingDays: number;
  presentDays: number;
  absentDays: number;
  salaryAbsenceDays: number;
  pendingAbsentDays: number;
  excusedDays: number;
  sickDays: number;
  annualDays: number;
  incompleteDays: number;
  lateDays: number;
  lateMin: number;
  earlyMin: number;
  shortfallMin: number;
  latenessMin: number;
  allowanceMin: number;
  workedMin: number;
  requiredMin: number;
  deductibleMin: number;
  deductAbsenceMin: number;
  /** Sums of the months that have an hourly wage; null when none has. */
  latenessFils: number | null;
  absenceFils: number | null;
  deductionFils: number | null;
  needsReview: number;
  /** Some month has time to deduct but no hourly wage, so the amounts leave it out. */
  missingRate: boolean;
}

const COUNTS = [
  "workingDays",
  "presentDays",
  "absentDays",
  "salaryAbsenceDays",
  "pendingAbsentDays",
  "excusedDays",
  "sickDays",
  "annualDays",
  "incompleteDays",
  "lateDays",
  "lateMin",
  "earlyMin",
  "shortfallMin",
  "latenessMin",
  "allowanceMin",
  "workedMin",
  "requiredMin",
  "deductibleMin",
  "deductAbsenceMin",
  "needsReview",
] as const;

/**
 * A month's deduction in its two parts. Months approved before the parts were priced apart
 * have only the total; it is all lateness unless absences were deducted.
 */
export function monthParts(s: MonthSummary): { lateness: number | null; absence: number | null } {
  if (s.latenessFils !== undefined) return { lateness: s.latenessFils, absence: s.absenceFils };
  return s.deductAbsenceMin ? { lateness: null, absence: s.deductionFils } : { lateness: s.deductionFils, absence: s.deductionFils === null ? null : 0 };
}

function addFils(total: number | null, fils: number | null | undefined): number | null {
  if (fils === null || fils === undefined) return total;
  return (total ?? 0) + fils;
}

export function sumMonths(summaries: MonthSummary[]): PeriodTotals {
  const totals = { months: summaries.length, latenessFils: null, absenceFils: null, deductionFils: null, missingRate: false } as PeriodTotals;
  for (const key of COUNTS) totals[key] = 0;

  for (const s of summaries) {
    // Months approved before a figure existed simply add nothing for it
    for (const key of COUNTS) totals[key] += s[key] ?? 0;
    const parts = monthParts(s);
    totals.latenessFils = addFils(totals.latenessFils, parts.lateness);
    totals.absenceFils = addFils(totals.absenceFils, parts.absence);
    totals.deductionFils = addFils(totals.deductionFils, s.deductionFils);
    if (s.rate === null && s.deductibleMin > 0) totals.missingRate = true;
  }
  return totals;
}
