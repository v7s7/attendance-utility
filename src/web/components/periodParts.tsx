// Pieces shared by the reports over several months.
import { Lock } from "lucide-react";
import type { LockInfo } from "../../core/api.ts";
import { monthParts, type PeriodTotals } from "../../core/period.ts";
import type { MonthSummary } from "../../core/types.ts";
import { bhd, duration } from "../format.ts";
import type { Translate } from "../i18n/context.ts";
import { Badge } from "../ui/Badge.tsx";

export function monthState(locked: LockInfo | null, s: MonthSummary, t: Translate) {
  if (locked)
    return (
      <Badge tone="neutral">
        <Lock className="size-3" />
        {t("state.locked")}
      </Badge>
    );
  if (s.rate === null && s.deductibleMin) return <Badge tone="danger">{t("state.noWage")}</Badge>;
  if (s.needsReview) return <Badge tone="violet">{t("state.review", { n: s.needsReview })}</Badge>;
  return <Badge tone="success">{t("state.ready")}</Badge>;
}

/** The CSV columns shared by the period exports, from the totals of a month or a period. */
export function periodColumns(t: Translate): string[] {
  return [
    t("col.workingDays"), t("col.present"), t("col.absent"), t("col.salaryAbsence"), t("col.leave"),
    t("col.workedHours"), t("col.requiredHours"), t("col.late"), t("col.early"),
    `${t("col.lateDeduction")} (${t("common.bhd")})`, `${t("col.absenceDeduction")} (${t("common.bhd")})`, `${t("col.deduction")} (${t("common.bhd")})`,
  ];
}

export function periodValues(s: MonthSummary | PeriodTotals): (string | number)[] {
  const { lateness: lateFils, absence: absenceFils } = "months" in s ? { lateness: s.latenessFils, absence: s.absenceFils } : monthParts(s);
  return [
    s.workingDays, s.presentDays, s.absentDays, s.salaryAbsenceDays ?? 0, s.excusedDays,
    duration(s.workedMin), duration(s.requiredMin), duration(s.lateMin), duration(s.earlyMin),
    lateFils == null ? "" : bhd(lateFils), absenceFils == null ? "" : bhd(absenceFils), s.deductionFils == null ? "" : bhd(s.deductionFils),
  ];
}
