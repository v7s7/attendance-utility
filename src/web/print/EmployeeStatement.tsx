import type { EmployeeMonthReport } from "../../core/api.ts";
import { firstDayOfMonth, lastDayOfMonth } from "../../core/time.ts";
import type { DayResult, Excuse } from "../../core/types.ts";
import { findScale } from "../../core/wages.ts";
import { dayNotes, isException, statusText } from "../components/dayText.ts";
import { bhd, clock, date, dayName, decimalHours, duration, monthName, rate, shortDate, signedDuration } from "../format.ts";
import { useLang, type Translate } from "../i18n/context.ts";
import { groupRanges, printTable } from "./helpers.ts";
import { PrintFooter, PrintHeader, PrintSheet, PrintSummary, Signatures } from "./PrintParts.tsx";

export type StatementMode = "full" | "exceptions";

/** Rows for the table: single days, or ranges of leave / no-data folded into one row. */
type Row = { day: DayResult } | { range: { label: string; from: string; to: string; count: number } };

function tableRows(days: DayResult[], mode: StatementMode, t: Translate): Row[] {
  const foldKey = (d: DayResult) =>
    d.status === "NO_DATA" ? "NO_DATA" : d.status === "EXCUSED" && !d.inTime && !d.outTime && d.excuse ? `x:${d.excuse}` : null;
  const shown = mode === "full" ? days : days.filter((d) => isException(d) || d.status === "NO_DATA");

  const rows: Row[] = [];
  for (let i = 0; i < shown.length; i++) {
    const key = foldKey(shown[i]);
    if (!key) {
      rows.push({ day: shown[i] });
      continue;
    }
    let j = i;
    while (j + 1 < shown.length && foldKey(shown[j + 1]) === key) j++;
    if (j === i) rows.push({ day: shown[i] });
    else {
      const label = key === "NO_DATA" ? t("status.NO_DATA") : statusText(shown[i], t);
      rows.push({ range: { label, from: shown[i].date, to: shown[j].date, count: j - i + 1 } });
    }
    i = j;
  }
  return rows;
}

export function EmployeeStatement({ report, mode, breakAfter }: { report: EmployeeMonthReport; mode: StatementMode; breakAfter?: boolean }) {
  const { t, lang } = useLang();
  const { employee: e, summary: s, days } = report;
  const hours = report.schedule.kind === "hours";
  const counted = (d: DayResult) => d.status === "OK" || d.status === "SHORT";
  const sum = (pick: (d: DayResult) => number | null) => days.filter(counted).reduce((n, d) => n + (pick(d) ?? 0), 0);

  const wage = (() => {
    if (s.rate === null) return t("print.noRate");
    const scale = findScale(e.wage.scale);
    const step = e.wage.step === 0 ? t("wage.minimum") : e.wage.step;
    const source = e.wage.mode === "table" && scale ? `${lang === "ar" ? scale.ar : scale.en} ${e.wage.grade}/${step} · ` : "";
    return `${source}${rate(s.rate)} ${t("common.bhd")}`;
  })();

  // The calculation in sentences: lateness against the monthly allowance, absences from the salary, the total
  const equation = (minutes: number, fils: number | null | undefined) =>
    s.rate === null || fils === null || fils === undefined
      ? t("print.noRate")
      : t("print.equation", { hours: decimalHours(minutes), rate: rate(s.rate), amount: bhd(fils) });
  const lateDeductMin = s.deductibleMin - s.deductAbsenceMin;
  const limit = s.allowanceLimitMin ?? s.allowanceMin;
  const latenessFils = s.latenessFils ?? (s.deductAbsenceMin ? null : s.deductionFils);
  const lateLine =
    !s.latenessMin && !s.deductIncompleteMin
      ? t("print.lateNone")
      : !lateDeductMin
        ? t("print.lateWithin", { time: duration(s.latenessMin), limit: duration(limit) })
        : limit && s.latenessMin > s.allowanceMin
          ? t("print.lateOver", {
              time: duration(s.latenessMin),
              limit: duration(limit),
              over: duration(s.latenessMin - s.allowanceMin),
              equation: equation(lateDeductMin, latenessFils),
            })
          : t("print.lateAll", { time: duration(s.latenessMin), equation: equation(lateDeductMin, latenessFils) });
  const absenceDays = s.deductAbsenceMin ? s.absentDays - (s.pendingAbsentDays ?? 0) : 0;

  const leaves = groupRanges(days, (d) => (d.status === "EXCUSED" && d.excuse ? d.excuse : null));
  const absences = days.filter((d) => d.status === "ABSENT");
  const review = days.filter((d) => d.status === "INCOMPLETE");
  const manual = days.filter((d) => d.inManual || d.outManual);
  const rangeText = (from: string, to: string) => (from === to ? shortDate(from) : `${shortDate(from)} – ${shortDate(to)}`);
  const rows = tableRows(days, mode, t);
  const columns = hours ? 8 : 9;

  return (
    <PrintSheet breakAfter={breakAfter}>
      <PrintHeader
        organization={report.organization}
        title={mode === "full" ? t("print.title") : t("print.exceptionsTitle")}
        lines={[
          `${monthName(report.month, lang)} · ${date(firstDayOfMonth(report.month))} – ${date(lastDayOfMonth(report.month))}`,
          t("print.reference", { ref: `HR-${report.month}-${e.id}` }),
        ]}
      />

      <div className="mb-3 grid grid-cols-3 gap-x-6 gap-y-1">
        <div>
          {t("col.name")}: <b>{e.name}</b>
        </div>
        <div>
          {t("col.cpr")}: <b dir="ltr">{e.id}</b>
        </div>
        <div>
          {t("col.employeeNo")}: <b dir="ltr">{e.employeeNo || "–"}</b>
        </div>
        <div>
          {t("col.department")}: <b>{e.department || "–"}</b>
        </div>
        <div>
          {t("col.schedule")}: <b>{e.scheduleName}</b>
        </div>
        <div>
          {t("col.rate")}: <b>{wage}</b>
        </div>
      </div>

      <PrintSummary
        items={[
          { label: t("col.workingDays"), value: s.workingDays },
          { label: t("col.present"), value: s.presentDays },
          {
            label: t("col.workedHours"),
            value: duration(s.workedMin),
            sub: s.requiredMin === undefined ? undefined : t("stat.ofRequired", { required: duration(s.requiredMin) }),
          },
          {
            label: t("col.absent"),
            value: s.absentDays,
            sub: s.salaryAbsenceDays ? `${s.salaryAbsenceDays} ${t("print.fromSalary")}` : undefined,
          },
          { label: t("col.leave"), value: s.excusedDays },
          hours
            ? { label: t("col.shortfall"), value: duration(s.shortfallMin) }
            : { label: t("col.late"), value: duration(s.lateMin), sub: s.lateDays ? t("common.days", { n: s.lateDays }) : undefined },
          {
            label: t("col.deduction"),
            value: s.deductionFils === null ? "–" : bhd(s.deductionFils),
            sub: s.deductionFils === null ? undefined : t("common.bhd"),
          },
        ]}
      />

      {rows.length ? (
        <table className={printTable}>
          <thead>
            <tr>
              <th>{t("col.date")}</th>
              <th>{t("col.day")}</th>
              <th>{t("col.in")}</th>
              <th>{t("col.out")}</th>
              <th>{t("col.worked")}</th>
              <th>{t("col.diff")}</th>
              {hours ? <th>{t("col.shortfall")}</th> : (
                <>
                  <th>{t("col.late")}</th>
                  <th>{t("col.early")}</th>
                </>
              )}
              <th>{t("col.status")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) =>
              "range" in r ? (
                <tr key={r.range.from}>
                  <td dir="ltr" className="text-start">
                    {rangeText(r.range.from, r.range.to)}
                  </td>
                  <td colSpan={columns - 2} className="text-slate-600">
                    {t("common.days", { n: r.range.count })}
                  </td>
                  <td>{r.range.label}</td>
                </tr>
              ) : (
                <tr key={r.day.date} className={r.day.status === "ABSENT" ? "font-bold" : undefined}>
                    <td dir="ltr" className="text-start">
                      {date(r.day.date)}
                    </td>
                    <td>{dayName(r.day.weekday, lang)}</td>
                    <td dir="ltr" className="text-start">
                      {clock(r.day.inTime)}
                      {r.day.inManual ? "*" : ""}
                    </td>
                    <td dir="ltr" className="text-start">
                      {clock(r.day.outTime)}
                      {r.day.outManual ? "*" : ""}
                    </td>
                    <td dir="ltr" className="text-start">
                      {counted(r.day) ? duration(r.day.workedMin) : "–"}
                    </td>
                    <td dir="ltr" className="text-start">
                      {counted(r.day) ? signedDuration(r.day.diffMin) : "–"}
                    </td>
                    {hours ? (
                      <td dir="ltr" className="text-start">
                        {r.day.shortfallMin ? duration(r.day.shortfallMin) : "–"}
                      </td>
                    ) : (
                      <>
                        <td dir="ltr" className="text-start">
                          {r.day.lateMin ? duration(r.day.lateMin) : "–"}
                        </td>
                        <td dir="ltr" className="text-start">
                          {r.day.earlyMin ? duration(r.day.earlyMin) : "–"}
                        </td>
                      </>
                    )}
                    <td className="whitespace-normal">
                      {statusText(r.day, t)}
                      {mode === "exceptions" && dayNotes(r.day, t).length ? (
                        <span className="text-slate-600"> · {dayNotes(r.day, t).join(" · ")}</span>
                      ) : null}
                    </td>
                </tr>
              ),
            )}
          </tbody>
          <tfoot>
            {/* The whole month's totals, also when only the notes are printed */}
            <tr className="font-bold">
              <td colSpan={4}>{t("common.total")}</td>
              <td dir="ltr" className="text-start">
                {duration(sum((d) => d.workedMin))}
              </td>
              <td dir="ltr" className="text-start">
                {signedDuration(sum((d) => d.diffMin))}
              </td>
              {hours ? (
                <td dir="ltr" className="text-start">
                  {duration(sum((d) => d.shortfallMin))}
                </td>
              ) : (
                <>
                  <td dir="ltr" className="text-start">
                    {duration(sum((d) => d.lateMin))}
                  </td>
                  <td dir="ltr" className="text-start">
                    {duration(sum((d) => d.earlyMin))}
                  </td>
                </>
              )}
              <td className="font-normal">{s.requiredMin === undefined ? null : t("stat.ofRequired", { required: duration(s.requiredMin) })}</td>
            </tr>
          </tfoot>
        </table>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1">
        <div>
          <b>{t("print.absences")}:</b>{" "}
          {absences.length
            ? absences
                .map((d) => `${shortDate(d.date)} (${d.absence || !s.pendingAbsentDays ? t("print.fromSalary") : t("print.pending")})`)
                .join("، ")
            : t("common.none")}
        </div>
        <div>
          <b>{t("print.leaves")}:</b>{" "}
          {leaves.length
            ? leaves.map((l) => `${t(`excuse.${l.key as Excuse}`)} ${rangeText(l.from, l.to)} (${l.count})`).join("، ")
            : t("common.none")}
        </div>
        {review.length ? (
          <div>
            <b>{t("print.review")}:</b> <span dir="ltr">{review.map((d) => shortDate(d.date)).join("، ")}</span>
          </div>
        ) : null}
        {manual.length ? (
          <div>
            <b>{t("print.manual")}:</b> <span dir="ltr">{manual.map((d) => shortDate(d.date)).join("، ")}</span> (*)
          </div>
        ) : null}
      </div>

      <div className="mt-3 border border-slate-500 px-2.5 py-2">
        <div className="mb-1 font-bold">{t("print.calc")}</div>
        <div>{lateLine}</div>
        {absenceDays ? (
          <div>
            {t("print.absenceLine", {
              n: absenceDays,
              time: duration(s.deductAbsenceMin),
              equation: equation(s.deductAbsenceMin, s.absenceFils ?? s.deductionFils),
            })}
          </div>
        ) : null}
        {s.deductionFils === null ? null : <div className="mt-1 font-bold">{t("print.totalLine", { amount: bhd(s.deductionFils) })}</div>}
      </div>

      <Signatures labels={[t("print.employee"), t("print.manager"), t("print.hr")]} />
      <PrintFooter note={report.locked ? t("print.lockedNote") : t("print.draftNote")} />
    </PrintSheet>
  );
}
