import type { PeriodOverview } from "../../core/api.ts";
import { bhd, duration, monthName } from "../format.ts";
import { useLang } from "../i18n/context.ts";
import { printTable } from "./helpers.ts";
import { PrintFooter, PrintHeader, PrintSheet, Signatures } from "./PrintParts.tsx";

/** Everyone over several months on A4: each employee's totals and the department total. */
export function DepartmentPeriodSheet({ overview }: { overview: PeriodOverview }) {
  const { t, lang } = useLang();
  const { rows } = overview;
  const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((n, r) => n + pick(r), 0);
  const priced = rows.some((r) => r.totals.deductionFils !== null);

  return (
    <PrintSheet>
      <PrintHeader
        organization={overview.organization}
        title={t("print.deptPeriodTitle")}
        lines={[`${monthName(overview.from, lang)} – ${monthName(overview.to, lang)}`, overview.months.map((m) => monthName(m, lang)).join("، ")]}
      />
      <table className={printTable}>
        <thead>
          <tr>
            <th>#</th>
            <th>{t("col.name")}</th>
            <th>{t("col.cpr")}</th>
            <th>{t("col.monthsCount")}</th>
            <th>{t("col.absent")}</th>
            <th>{t("col.leave")}</th>
            <th>{t("col.workedHours")}</th>
            <th>{t("col.late")}</th>
            <th>{t("col.lateDeduction")}</th>
            <th>{t("col.absenceDeduction")}</th>
            <th>{t("col.deduction")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ employee: e, totals: s }, i) => (
            <tr key={e.id}>
              <td>{i + 1}</td>
              <td>{e.name}</td>
              <td dir="ltr" className="text-start">
                {e.id}
              </td>
              <td>{s.months}</td>
              <td>
                {s.absentDays}
                {s.salaryAbsenceDays ? ` (${s.salaryAbsenceDays} ${t("print.fromSalary")})` : ""}
              </td>
              <td>{s.excusedDays}</td>
              <td dir="ltr" className="text-start">
                {duration(s.workedMin)}
              </td>
              <td dir="ltr" className="text-start">
                {duration(s.lateMin)}
              </td>
              <td dir="ltr" className="text-start">
                {bhd(s.latenessFils)}
              </td>
              <td dir="ltr" className="text-start">
                {bhd(s.absenceFils)}
              </td>
              <td dir="ltr" className="text-start font-bold">
                {bhd(s.deductionFils)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold">
            <td colSpan={4}>{t("print.total")}</td>
            <td>{sum((r) => r.totals.absentDays)}</td>
            <td>{sum((r) => r.totals.excusedDays)}</td>
            <td dir="ltr" className="text-start">
              {duration(sum((r) => r.totals.workedMin))}
            </td>
            <td dir="ltr" className="text-start">
              {duration(sum((r) => r.totals.lateMin))}
            </td>
            <td dir="ltr" className="text-start">
              {priced ? bhd(sum((r) => r.totals.latenessFils ?? 0)) : "–"}
            </td>
            <td dir="ltr" className="text-start">
              {priced ? bhd(sum((r) => r.totals.absenceFils ?? 0)) : "–"}
            </td>
            <td dir="ltr" className="text-start">
              {priced ? `${bhd(sum((r) => r.totals.deductionFils ?? 0))} ${t("common.bhd")}` : "–"}
            </td>
          </tr>
        </tfoot>
      </table>
      <p className="mt-2 text-[10px] text-slate-600">{t("period.allowanceNote")}</p>
      <Signatures labels={[t("print.preparedBy"), t("print.hrManager"), t("print.finance")]} />
      <PrintFooter note={t("period.count", { n: overview.months.length })} />
    </PrintSheet>
  );
}
