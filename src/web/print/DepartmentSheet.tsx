import type { MonthOverview } from "../../core/api.ts";
import { bhd, duration, monthName, rate } from "../format.ts";
import { useLang } from "../i18n/context.ts";
import { printTable } from "./helpers.ts";
import { PrintFooter, PrintHeader, PrintSheet, Signatures } from "./PrintParts.tsx";

/** One table for payroll: every employee's deduction for the month, with a total. */
export function DepartmentSheet({ overview }: { overview: MonthOverview }) {
  const { t, lang } = useLang();
  const rows = overview.rows;
  const priced = rows.filter((r) => r.summary.deductionFils !== null);
  const totalFils = priced.reduce((n, r) => n + (r.summary.deductionFils ?? 0), 0);
  const totalMin = rows.reduce((n, r) => n + r.summary.deductibleMin, 0);

  return (
    <PrintSheet>
      <PrintHeader
        organization={overview.organization}
        title={t("print.departmentTitle")}
        lines={[monthName(overview.month, lang), t("print.reference", { ref: `HR-${overview.month}` })]}
      />
      <table className={printTable}>
        <thead>
          <tr>
            <th>#</th>
            <th>{t("col.name")}</th>
            <th>{t("col.cpr")}</th>
            <th>{t("col.absent")}</th>
            <th>{t("col.leave")}</th>
            <th>{t("col.workedHours")}</th>
            <th>{t("col.late")}</th>
            <th>{t("col.early")}</th>
            <th>{t("col.deductible")}</th>
            <th>{t("col.rate")}</th>
            <th>{t("col.deduction")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ employee: e, summary: s }, i) => (
            <tr key={e.id}>
              <td>{i + 1}</td>
              <td>{e.name}</td>
              <td dir="ltr" className="text-start">
                {e.id}
              </td>
              <td>
                {s.absentDays}
                {s.salaryAbsenceDays ? ` (${s.salaryAbsenceDays} ${t("print.fromSalary")})` : ""}
              </td>
              <td>{s.excusedDays}</td>
              <td dir="ltr" className="text-start">
                {duration(s.workedMin)}
              </td>
              <td dir="ltr" className="text-start">
                {duration(s.lateMin + s.shortfallMin)}
              </td>
              <td dir="ltr" className="text-start">
                {duration(s.earlyMin)}
              </td>
              <td dir="ltr" className="text-start">
                {duration(s.deductibleMin)}
              </td>
              <td dir="ltr" className="text-start">
                {rate(s.rate)}
              </td>
              <td dir="ltr" className="text-start font-bold">
                {bhd(s.deductionFils)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold">
            <td colSpan={5}>{t("print.total")}</td>
            <td dir="ltr" className="text-start">
              {duration(rows.reduce((n, r) => n + r.summary.workedMin, 0))}
            </td>
            <td colSpan={2} />
            <td dir="ltr" className="text-start">
              {duration(totalMin)}
            </td>
            <td />
            <td dir="ltr" className="text-start">
              {priced.length ? `${bhd(totalFils)} ${t("common.bhd")}` : "–"}
            </td>
          </tr>
        </tfoot>
      </table>
      <Signatures labels={[t("print.preparedBy"), t("print.hrManager"), t("print.finance")]} />
      <PrintFooter note={overview.locked ? t("print.lockedNote") : t("print.draftNote")} />
    </PrintSheet>
  );
}
