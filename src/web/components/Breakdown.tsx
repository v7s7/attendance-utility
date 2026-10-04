import type { ReactNode } from "react";
import type { MonthSummary } from "../../core/types.ts";
import { bhd, decimalHours, duration, rate } from "../format.ts";
import { useLang } from "../i18n/context.ts";
import { cx } from "../ui/cx.ts";

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div
      className={cx(
        "flex items-center justify-between gap-4",
        strong && "mt-1 border-t border-dashed border-slate-200 pt-2 font-semibold text-slate-900",
        muted && "text-slate-400",
      )}
    >
      <span>{label}</span>
      <span dir="ltr" className="tabular-nums">
        {value}
      </span>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 p-3.5">
      <h3 className="mb-2.5 font-semibold text-slate-900">{title}</h3>
      <div className="flex flex-col gap-1.5 text-slate-700">{children}</div>
    </section>
  );
}

/**
 * How the month's deduction is reached, in plain words: the lateness against the monthly
 * allowance, then absences deducted from the salary, each with its sum, then the total.
 * Built only from the summary, so it also explains approved months.
 */
export function Breakdown({ s }: { s: MonthSummary }) {
  const { t } = useLang();
  const earlyDeducted = s.latenessMin === s.lateMin + s.earlyMin + s.shortfallMin;
  const limit = s.allowanceLimitMin ?? s.allowanceMin;
  const over = s.latenessMin - s.allowanceMin;
  const pending = s.pendingAbsentDays ?? 0;
  const absenceDays = s.deductAbsenceMin ? s.absentDays - pending : 0;
  const lateDeductMin = s.deductibleMin - s.deductAbsenceMin;
  // Months worked out before the two parts were priced apart have only the total
  const latenessFils = s.latenessFils ?? (s.deductAbsenceMin ? null : s.deductionFils);

  /** "1.33 × 3.510 =" then the amount in bold */
  const amount = (minutes: number, fils: number | null | undefined) => {
    if (s.rate === null || fils === null || fils === undefined) return <span className="text-slate-400">–</span>;
    return (
      <span dir="ltr" className="tabular-nums">
        {minutes ? <span className="text-slate-500">{`${decimalHours(minutes)} × ${rate(s.rate)} = `}</span> : null}
        <b className="text-slate-900">{bhd(fils)}</b> {t("common.bhd")}
      </span>
    );
  };

  const verdict = (() => {
    if (!s.latenessMin) return { tone: "plain", text: t("calc.noLate") };
    if (!limit) return { tone: "over", text: t("calc.fromFirst") };
    if (over <= 0) return { tone: "ok", text: t("calc.within", { limit: duration(limit) }) };
    return { tone: "over", text: t("calc.over", { limit: duration(limit), over: duration(over) }) };
  })();

  const info = [
    s.annualDays ? t("calc.infoAnnual", { n: s.annualDays }) : null,
    s.sickDays ? t("calc.infoSick", { n: s.sickDays }) : null,
    s.excusedDays - s.sickDays - s.annualDays > 0 ? t("calc.infoOther", { n: s.excusedDays - s.sickDays - s.annualDays }) : null,
    s.extraMin ? t("calc.infoExtra", { time: duration(s.extraMin) }) : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-3 text-sm">
      <Block title={t("calc.lateBlock")}>
        {s.lateMin ? <Row label={t("calc.lateRow", { n: s.lateDays })} value={duration(s.lateMin)} /> : null}
        {s.earlyMin ? <Row label={t(earlyDeducted ? "calc.earlyRow" : "calc.earlyRowOff")} value={duration(s.earlyMin)} muted={!earlyDeducted} /> : null}
        {s.shortfallMin ? <Row label={t("calc.shortfallRow")} value={duration(s.shortfallMin)} /> : null}
        {s.latenessMin ? <Row label={t("calc.sumRow")} value={duration(s.latenessMin)} strong /> : null}
        <p
          className={cx(
            "rounded-md px-2.5 py-1.5",
            verdict.tone === "ok" && "bg-emerald-50 text-emerald-800",
            verdict.tone === "over" && "bg-amber-50 text-amber-900",
            verdict.tone === "plain" && "bg-slate-50 text-slate-600",
          )}
        >
          {verdict.text}
        </p>
        {s.deductIncompleteMin ? <Row label={t("calc.incompleteRow", { n: s.incompleteDays })} value={duration(s.deductIncompleteMin)} /> : null}
        {lateDeductMin ? (
          <div className="mt-1 flex items-center justify-between gap-4">
            <span>{t("calc.amountRow")}</span>
            {amount(lateDeductMin, latenessFils)}
          </div>
        ) : null}
      </Block>

      {absenceDays ? (
        <Block title={t("calc.absenceBlock")}>
          <Row label={t("calc.absenceRow", { n: absenceDays })} value={duration(s.deductAbsenceMin)} />
          <div className="mt-1 flex items-center justify-between gap-4">
            <span>{t("calc.amountRow")}</span>
            {amount(s.deductAbsenceMin, s.absenceFils ?? s.deductionFils)}
          </div>
        </Block>
      ) : null}

      {pending ? <p className="rounded-md bg-violet-50 px-3 py-2 text-violet-800">{t("calc.pendingAbsent", { n: pending })}</p> : null}
      {s.incompleteDays && !s.deductIncompleteMin ? (
        <p className="rounded-md bg-violet-50 px-3 py-2 text-violet-800">{t("calc.heldIncomplete", { n: s.incompleteDays })}</p>
      ) : null}

      <div className="flex items-center justify-between gap-4 rounded-lg bg-teal-50 px-3.5 py-3 text-base font-semibold text-teal-900">
        <span>{t("calc.totalAmount")}</span>
        <span dir="ltr">{s.deductionFils === null ? "–" : `${bhd(s.deductionFils)} ${t("common.bhd")}`}</span>
      </div>
      {s.rate === null ? <p className="text-xs text-slate-500">{t("calc.noRate")}</p> : null}
      {info.length ? (
        <p className="text-xs leading-relaxed text-slate-500">
          {t("calc.info")}: {info.join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
