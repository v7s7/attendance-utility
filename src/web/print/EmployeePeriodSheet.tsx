import type { EmployeePeriodReport } from "../../core/api.ts";
import { monthParts } from "../../core/period.ts";
import { bhd, duration, monthName } from "../format.ts";
import { useLang } from "../i18n/context.ts";
import { printTable } from "./helpers.ts";
import { PrintFooter, PrintHeader, PrintSheet, PrintSummary, Signatures } from "./PrintParts.tsx";

/** One employee over several months on A4: the totals, one row per month, and signatures. */
export function EmployeePeriodSheet({ report }: { report: EmployeePeriodReport }) {
  const { t, lang } = useLang();
  const { employee: e, totals: s } = report;
  const approved = report.months.every((m) => m.locked);

  return (
    <PrintSheet>
      <PrintHeader
        organization={report.organization}
        title={t("print.periodTitle")}
        lines={[`${monthName(report.from, lang)} – ${monthName(report.to, lang)}`, t("print.reference", { ref: `HR-${report.from}-${report.to}-${e.id}` })]}
      />

      <div className="mb-3 grid grid-cols-3 gap-x-6 gap-y-1">
        <div>
          {t("col.name")}: <b>{e.name}</b>
        </div>
        <div>
          {t("col.cpr")}: <b dir="ltr">{e.id}</b>
        </div>
        <div>
          {t("col.department")}: <b>{e.department || "–"}</b>
        </div>
      </div>

      <PrintSummary
        items={[
          { label: t("col.monthsCount"), value: s.months },
          { label: t("col.workedHours"), value: duration(s.workedMin), sub: t("stat.ofRequired", { required: duration(s.requiredMin) }) },
          { label: t("col.absent"), value: s.absentDays, sub: s.salaryAbsenceDays ? `${s.salaryAbsenceDays} ${t("print.fromSalary")}` : undefined },
          { label: t("col.leave"), value: s.excusedDays },
          { label: t("col.late"), value: duration(s.lateMin), sub: s.lateDays ? t("common.days", { n: s.lateDays }) : undefined },
          { label: t("col.deduction"), value: s.deductionFils === null ? "–" : bhd(s.deductionFils), sub: s.deductionFils === null ? undefined : t("common.bhd") },
        ]}
      />

      <table className={printTable}>
        <thead>
          <tr>
            <th>{t("col.month")}</th>
            <th>{t("col.workingDays")}</th>
            <th>{t("col.absent")}</th>
            <th>{t("col.leave")}</th>
            <th>{t("col.workedHours")}</th>
            <th>{t("col.late")}</th>
            <th>{t("col.early")}</th>
            <th>{t("col.lateDeduction")}</th>
            <th>{t("col.absenceDeduction")}</th>
            <th>{t("col.deduction")}</th>
          </tr>
        </thead>
        <tbody>
          {report.months.map(({ month, summary: m }) => (
            <tr key={month}>
              <td>{monthName(month, lang)}</td>
              <td>{m.workingDays}</td>
              <td>
                {m.absentDays}
                {m.salaryAbsenceDays ? ` (${m.salaryAbsenceDays} ${t("print.fromSalary")})` : ""}
              </td>
              <td>{m.excusedDays}</td>
              <td dir="ltr" className="text-start">
                {duration(m.workedMin)}
              </td>
              <td dir="ltr" className="text-start">
                {duration(m.lateMin)}
              </td>
              <td dir="ltr" className="text-start">
                {duration(m.earlyMin)}
              </td>
              <td dir="ltr" className="text-start">
                {bhd(monthParts(m).lateness)}
              </td>
              <td dir="ltr" className="text-start">
                {bhd(monthParts(m).absence)}
              </td>
              <td dir="ltr" className="text-start font-bold">
                {bhd(m.deductionFils)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold">
            <td>{t("common.total")}</td>
            <td>{s.workingDays}</td>
            <td>{s.absentDays}</td>
            <td>{s.excusedDays}</td>
            <td dir="ltr" className="text-start">
              {duration(s.workedMin)}
            </td>
            <td dir="ltr" className="text-start">
              {duration(s.lateMin)}
            </td>
            <td dir="ltr" className="text-start">
              {duration(s.earlyMin)}
            </td>
            <td dir="ltr" className="text-start">
              {bhd(s.latenessFils)}
            </td>
            <td dir="ltr" className="text-start">
              {bhd(s.absenceFils)}
            </td>
            <td dir="ltr" className="text-start">
              {s.deductionFils === null ? "–" : `${bhd(s.deductionFils)} ${t("common.bhd")}`}
            </td>
          </tr>
        </tfoot>
      </table>
      <p className="mt-2 text-[10px] text-slate-600">{t("period.allowanceNote")}</p>

      <Signatures labels={[t("print.employee"), t("print.manager"), t("print.hr")]} />
      <PrintFooter note={approved ? t("print.lockedNote") : t("print.draftNote")} />
    </PrintSheet>
  );
}
