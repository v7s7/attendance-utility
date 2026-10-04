import { ArrowLeft, ArrowRight, Download, Printer, Search, Users } from "lucide-react";
import { useState } from "react";
import type { PeriodOverview } from "../../core/api.ts";
import { api } from "../api.ts";
import { periodColumns, periodValues } from "../components/periodParts.tsx";
import { PeriodPicker } from "../components/PeriodPicker.tsx";
import { asText, downloadCsv } from "../csv.ts";
import { readFlash } from "../flash.ts";
import { bhd, duration, monthName } from "../format.ts";
import { useLang } from "../i18n/context.ts";
import { DepartmentPeriodSheet } from "../print/DepartmentPeriodSheet.tsx";
import { navigate, paths } from "../router.ts";
import { Alert } from "../ui/Alert.tsx";
import { Button } from "../ui/Button.tsx";
import { Card } from "../ui/Card.tsx";
import { Link } from "../ui/Link.tsx";
import { PageHeader } from "../ui/PageHeader.tsx";
import { Stat } from "../ui/Stat.tsx";
import { Empty, Loading, LoadError } from "../ui/States.tsx";
import { useApi } from "../useApi.ts";

/** Everyone over several months: one row per employee with their months added up. */
export function PeriodPage({ from, to }: { from: string; to: string }) {
  const { t, lang } = useLang();
  const period = useApi(`period:${from}:${to}`, () => api.period(from, to));
  const months = useApi("months", api.months);
  const [query, setQuery] = useState("");
  const [flash] = useState(() => readFlash(location.pathname));
  const Back = lang === "ar" ? ArrowRight : ArrowLeft;

  if (period.error) return <LoadError error={period.error} retry={period.reload} />;
  if (!period.data) return <Loading />;

  const data: PeriodOverview = period.data;
  const q = query.trim().toLowerCase();
  const rows = data.rows.filter(({ employee: e }) => !q || e.name.toLowerCase().includes(q) || e.id.includes(q) || e.employeeNo.includes(q));
  const sum = (pick: (r: PeriodOverview["rows"][number]) => number) => data.rows.reduce((n, r) => n + pick(r), 0);
  const priced = data.rows.some((r) => r.totals.deductionFils !== null);
  const fils = (pick: (r: PeriodOverview["rows"][number]) => number | null) => (priced ? sum((r) => pick(r) ?? 0) : null);
  const missingRate = data.rows.some((r) => r.totals.missingRate);
  const review = sum((r) => r.totals.needsReview);

  const exportCsv = () => {
    const header = [t("col.cpr"), t("col.employeeNo"), t("col.name"), t("col.department"), t("col.monthsCount"), ...periodColumns(t)];
    const lines = data.rows.map(({ employee: e, totals: s }) => [asText(e.id), e.employeeNo, e.name, e.department, s.months, ...periodValues(s)]);
    downloadCsv(`deductions-${from}-${to}.csv`, [header, ...lines]);
  };

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          eyebrow={
            <Link href={paths.months()} className="inline-flex items-center gap-1 hover:text-teal-700">
              <Back className="size-3.5" />
              {t("nav.months")}
            </Link>
          }
          title={t("period.reportTitle", { from: monthName(from, lang), to: monthName(to, lang) })}
          description={t("period.subtitle")}
          actions={
            <>
              <PeriodPicker
                months={(months.data ?? []).map((m) => m.month)}
                from={from}
                to={to}
                multi
                onMonth={(m) => navigate(paths.month(m))}
                onPeriod={(a, b) => navigate(paths.period(a, b))}
              />
              <Button icon={Download} onClick={exportCsv} disabled={!data.rows.length}>
                {t("month.export")}
              </Button>
              <Button variant="primary" icon={Printer} onClick={() => window.print()} disabled={!data.rows.length}>
                {t("month.print")}
              </Button>
            </>
          }
        />

        <div className="flex flex-col gap-5">
          {flash ? <Alert tone="success">{flash}</Alert> : null}
          {missingRate ? <Alert tone="danger">{t("period.missingRate")}</Alert> : null}
          {review ? <Alert tone="warning">{t("period.review", { n: review })}</Alert> : null}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={t("month.stat.employees")} value={data.rows.length} />
            <Stat label={t("col.monthsCount")} value={data.months.length} sub={data.months.map((m) => monthName(m, lang)).join("، ")} />
            <Stat label={t("col.absent")} value={sum((r) => r.totals.absentDays)} sub={t("common.days", { n: sum((r) => r.totals.absentDays) })} />
            <Stat label={t("calc.totalAmount")} value={<span dir="ltr">{bhd(fils((r) => r.totals.deductionFils))}</span>} sub={t("common.bhd")} tone="teal" />
          </div>

          <Card
            flush
            title={t("nav.employees")}
            description={t("period.allowanceNote")}
            actions={
              <div className="relative">
                <Search className="pointer-events-none absolute start-2.5 top-2.5 size-4 text-slate-400" />
                <input className="input w-64 ps-8" placeholder={t("common.search")} value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
            }
          >
            {data.rows.length === 0 ? (
              <Empty icon={Users} title={t("period.empty")} />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("col.name")}</th>
                    <th>{t("col.monthsCount")}</th>
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
                  {rows.map(({ employee: e, totals: s }) => (
                    <tr key={e.id} onClick={() => navigate(paths.employeePeriod(e.id, from, to))} className="cursor-pointer hover:bg-slate-50">
                      <td>
                        <Link href={paths.employeePeriod(e.id, from, to)} className="font-medium text-slate-900 hover:text-teal-700">
                          {e.name}
                        </Link>
                        <div className="text-xs text-slate-500">
                          <span dir="ltr">{e.id}</span>
                          {e.department ? ` · ${e.department}` : ""}
                        </div>
                      </td>
                      <td>{s.months}</td>
                      <td className={s.absentDays ? "font-medium text-red-700" : "text-slate-400"}>
                        {s.absentDays}
                        {s.salaryAbsenceDays ? <span className="ms-1 text-xs font-normal text-slate-500">({s.salaryAbsenceDays} {t("print.fromSalary")})</span> : null}
                      </td>
                      <td className={s.excusedDays ? "" : "text-slate-400"}>{s.excusedDays}</td>
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
                      <td dir="ltr" className="text-start font-semibold">
                        {bhd(s.deductionFils)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {data.rows.length > 1 ? (
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
                      <td colSpan={2}>{t("common.total")}</td>
                      <td>{sum((r) => r.totals.absentDays)}</td>
                      <td>{sum((r) => r.totals.excusedDays)}</td>
                      <td dir="ltr" className="text-start">
                        {duration(sum((r) => r.totals.workedMin))}
                      </td>
                      <td dir="ltr" className="text-start">
                        {duration(sum((r) => r.totals.lateMin))}
                      </td>
                      <td dir="ltr" className="text-start">
                        {duration(sum((r) => r.totals.earlyMin))}
                      </td>
                      <td dir="ltr" className="text-start">
                        {bhd(fils((r) => r.totals.latenessFils))}
                      </td>
                      <td dir="ltr" className="text-start">
                        {bhd(fils((r) => r.totals.absenceFils))}
                      </td>
                      <td dir="ltr" className="text-start">
                        {bhd(fils((r) => r.totals.deductionFils))}
                      </td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            )}
          </Card>
        </div>
      </div>

      {data.rows.length ? <DepartmentPeriodSheet overview={data} /> : null}
    </>
  );
}
