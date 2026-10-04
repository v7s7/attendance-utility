import { ArrowLeft, ArrowRight, CalendarDays, Download, ListOrdered, Lock, Printer } from "lucide-react";
import { useState } from "react";
import { flushSync } from "react-dom";
import type { EmployeeMonthReport, EmployeePeriodReport } from "../../core/api.ts";
import type { DayResult } from "../../core/types.ts";
import { monthParts } from "../../core/period.ts";
import { api } from "../api.ts";
import { DayDialog } from "../components/DayDialog.tsx";
import { DaysTable } from "../components/DaysTable.tsx";
import { monthState, periodColumns, periodValues } from "../components/periodParts.tsx";
import { PeriodPicker } from "../components/PeriodPicker.tsx";
import { downloadCsv } from "../csv.ts";
import { readFlash } from "../flash.ts";
import { errorText } from "../errors.ts";
import { bhd, clock, duration, monthName } from "../format.ts";
import { useLang, type Translate } from "../i18n/context.ts";
import { EmployeePeriodSheet } from "../print/EmployeePeriodSheet.tsx";
import { EmployeeStatement } from "../print/EmployeeStatement.tsx";
import { navigate, paths } from "../router.ts";
import { Alert } from "../ui/Alert.tsx";
import { Badge } from "../ui/Badge.tsx";
import { Button } from "../ui/Button.tsx";
import { Card } from "../ui/Card.tsx";
import { cx } from "../ui/cx.ts";
import { Link } from "../ui/Link.tsx";
import { PageHeader } from "../ui/PageHeader.tsx";
import { Stat } from "../ui/Stat.tsx";
import { Empty, Loading, LoadError } from "../ui/States.tsx";
import { useApi } from "../useApi.ts";

/** One employee over several months: the totals, every day month by month, or one row per month. */
export function EmployeePeriodPage({ employeeId, from, to }: { employeeId: string; from: string; to: string }) {
  const { t, lang } = useLang();
  const report = useApi(`employee-period:${employeeId}:${from}:${to}`, () => api.employeePeriod(employeeId, from, to));
  const months = useApi(`employee-months:${employeeId}`, () => api.employeeMonths(employeeId));
  const [flash] = useState(() => readFlash(location.pathname));
  const [tab, setTab] = useState<"days" | "months">("days");
  const [printMode, setPrintMode] = useState<"summary" | "days">("summary");
  const [editing, setEditing] = useState<{ day: DayResult; month: EmployeeMonthReport } | null>(null);
  const [actionError, setActionError] = useState("");
  const Back = lang === "ar" ? ArrowRight : ArrowLeft;

  const print = (mode: "summary" | "days") => {
    flushSync(() => setPrintMode(mode));
    window.print();
  };

  const toggleSick = async (d: DayResult) => {
    setActionError("");
    try {
      await api.saveDay(employeeId, d.date, {
        inTime: d.inManual ? clock(d.inTime) : null,
        outTime: d.outManual ? clock(d.outTime) : null,
        excuse: d.excuse === "sick" ? null : "sick",
        note: d.note,
      });
      report.reload();
    } catch (err) {
      setActionError(errorText(t, err));
    }
  };

  if (report.error) return <LoadError error={report.error} retry={report.reload} />;
  if (!report.data) return <Loading />;

  const r: EmployeePeriodReport = report.data;
  const { employee: e, totals: s } = r;
  const range = `${monthName(from, lang)} – ${monthName(to, lang)}`;

  const exportCsv = () => {
    const header = [t("col.month"), ...periodColumns(t)];
    const rows = r.months.map((m) => [monthName(m.month, lang), ...periodValues(m.summary)]);
    downloadCsv(`attendance-${e.id}-${from}-${to}.csv`, [header, ...rows, [t("common.total"), ...periodValues(s)]]);
  };

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          eyebrow={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Link href={paths.employees()} className="inline-flex items-center gap-1 hover:text-teal-700">
                <Back className="size-3.5" />
                {t("nav.employees")}
              </Link>
              <span className="text-slate-300">·</span>
              <Link href={paths.period(from, to)} className="hover:text-teal-700">
                {t("period.allStaff")}
              </Link>
            </span>
          }
          title={e.name}
          badge={<Badge tone="teal">{range}</Badge>}
          description={
            <span className="flex flex-wrap gap-x-4 gap-y-1">
              <span>
                {t("col.cpr")} <b className="font-medium text-slate-700" dir="ltr">{e.id}</b>
              </span>
              {e.department ? <span>{e.department}</span> : null}
              <span>
                {t("col.schedule")}: <b className="font-medium text-slate-700">{e.scheduleName}</b>
              </span>
            </span>
          }
          actions={
            <>
              <PeriodPicker
                months={months.data ?? []}
                from={from}
                to={to}
                multi
                onMonth={(m) => navigate(paths.employee(employeeId, m))}
                onPeriod={(a, b) => navigate(paths.employeePeriod(employeeId, a, b))}
              />
              <Button icon={Download} onClick={exportCsv} disabled={!r.months.length}>
                {t("month.export")}
              </Button>
              <Button icon={Printer} onClick={() => print("days")} disabled={!r.months.length}>
                {t("period.printDays")}
              </Button>
              <Button variant="primary" icon={Printer} onClick={() => print("summary")} disabled={!r.months.length}>
                {t("period.printSummary")}
              </Button>
            </>
          }
        />

        <div className="flex flex-col gap-5">
          {flash ? <Alert tone="success">{flash}</Alert> : null}
          {actionError ? <Alert tone="danger">{actionError}</Alert> : null}
          {s.missingRate ? <Alert tone="danger">{t("period.missingRate")}</Alert> : null}
          {s.needsReview ? <Alert tone="warning">{t("period.review", { n: s.needsReview })}</Alert> : null}

          {r.months.length === 0 ? (
            <Card>
              <Empty icon={Lock} title={t("period.empty")} />
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <Stat label={t("col.monthsCount")} value={s.months} sub={t("common.days", { n: s.workingDays })} />
                <Stat
                  label={t("col.workedHours")}
                  value={<span dir="ltr">{duration(s.workedMin)}</span>}
                  sub={t("stat.ofRequired", { required: duration(s.requiredMin) })}
                  hint={t("stat.requiredHint")}
                />
                <Stat
                  label={t("col.absent")}
                  value={s.absentDays}
                  sub={s.salaryAbsenceDays ? `${s.salaryAbsenceDays} ${t("print.fromSalary")}` : undefined}
                  tone={s.absentDays ? "danger" : undefined}
                />
                <Stat
                  label={t("col.leave")}
                  value={s.excusedDays}
                  sub={[s.sickDays ? `${t("col.sick")} ${s.sickDays}` : null, s.annualDays ? `${t("excuse.annual")} ${s.annualDays}` : null].filter(Boolean).join(" · ")}
                />
                <Stat
                  label={t("col.late")}
                  value={<span dir="ltr">{duration(s.lateMin)}</span>}
                  sub={s.lateDays ? t("common.days", { n: s.lateDays }) : undefined}
                  tone={s.lateMin ? "warning" : undefined}
                />
                <Stat label={t("calc.totalAmount")} value={<span dir="ltr">{bhd(s.deductionFils)}</span>} sub={t("common.bhd")} tone="teal" />
              </div>

              <div className="inline-flex self-start rounded-lg border border-slate-200 bg-white p-1 shadow-xs" role="tablist">
                {(["days", "months"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={tab === k}
                    onClick={() => setTab(k)}
                    className={cx(
                      "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition",
                      tab === k ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-100",
                    )}
                  >
                    {k === "days" ? <ListOrdered className="size-4" /> : <CalendarDays className="size-4" />}
                    {t(k === "days" ? "period.tabDays" : "period.tabMonths")}
                  </button>
                ))}
              </div>

              {tab === "months" ? (
                <Card flush title={t("col.monthsCount")} description={t("period.allowanceNote")}>
                  <table className="table">
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
                        <th>{t("col.state")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.months.map(({ month, locked, summary: m }) => (
                        <tr key={month} onClick={() => navigate(paths.employee(employeeId, month))} className="cursor-pointer hover:bg-slate-50">
                          <td>
                            <Link href={paths.employee(employeeId, month)} className="font-medium text-slate-900 hover:text-teal-700">
                              {monthName(month, lang)}
                            </Link>
                          </td>
                          <td>{m.workingDays}</td>
                          <td className={m.absentDays ? "font-medium text-red-700" : "text-slate-400"}>
                            {m.absentDays}
                            {m.salaryAbsenceDays ? <span className="ms-1 text-xs font-normal text-slate-500">({m.salaryAbsenceDays} {t("print.fromSalary")})</span> : null}
                          </td>
                          <td className={m.excusedDays ? "" : "text-slate-400"}>{m.excusedDays}</td>
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
                          <td dir="ltr" className="text-start font-semibold">
                            {bhd(m.deductionFils)}
                          </td>
                          <td>{monthState(locked, m, t)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
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
                          {bhd(s.deductionFils)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </Card>
                ) : (
                <>
                  {r.months.map((m) => (
                    <Card
                      key={m.month}
                      flush
                      title={
                        <span className="flex flex-wrap items-center gap-2">
                          <Link href={paths.employee(employeeId, m.month)} className="hover:text-teal-700">
                            {monthName(m.month, lang)}
                          </Link>
                          {monthState(m.locked, m.summary, t)}
                        </span>
                      }
                      description={monthLine(m, t)}
                    >
                      <DaysTable
                        days={m.days}
                        hours={m.schedule.kind === "hours"}
                        editable={!m.locked}
                        requiredMin={m.summary.requiredMin}
                        onEdit={(day) => setEditing({ day, month: m })}
                        onToggleSick={(d) => void toggleSick(d)}
                      />
                    </Card>
                  ))}
                  <p className="text-sm text-slate-500">{t("period.allowanceNote")}</p>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {r.months.length && printMode === "summary" ? <EmployeePeriodSheet report={r} /> : null}
      {printMode === "days" ? r.months.map((m, i) => <EmployeeStatement key={m.month} report={m} mode="full" breakAfter={i < r.months.length - 1} />) : null}

      <DayDialog
        employeeId={employeeId}
        day={editing?.day ?? null}
        next={
          editing
            ? (editing.month.days.find((d) => d.date > editing.day.date && (d.status === "INCOMPLETE" || d.status === "ABSENT")) ?? null)
            : null
        }
        onNext={(day) => editing && setEditing({ day, month: editing.month })}
        onClose={() => setEditing(null)}
        onSaved={report.reload}
      />
    </>
  );
}

/** One line under a month's name: its lateness, absences and deduction, worked out on its own. */
function monthLine(m: EmployeeMonthReport, t: Translate): string {
  const s = m.summary;
  const parts = [`${t("col.late")} ${duration(s.lateMin)}`, `${t("col.early")} ${duration(s.earlyMin)}`];
  if (s.absentDays) parts.push(`${t("col.absent")} ${s.absentDays}${s.salaryAbsenceDays ? ` (${s.salaryAbsenceDays} ${t("print.fromSalary")})` : ""}`);
  if (s.excusedDays) parts.push(`${t("col.leave")} ${s.excusedDays}`);
  parts.push(`${t("col.deduction")} ${s.deductionFils === null ? "–" : `${bhd(s.deductionFils)} ${t("common.bhd")}`}`);
  return parts.join(" · ");
}
