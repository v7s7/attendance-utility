import {
  ArrowLeft,
  ArrowRight,
  Lock,
  Plane,
  Printer,
  UserCog,
} from "lucide-react";
import { useState } from "react";
import { flushSync } from "react-dom";
import type { EmployeeMonthReport } from "../../core/api.ts";
import { localToday, monthOf } from "../../core/time.ts";
import type { DayResult } from "../../core/types.ts";
import { api } from "../api.ts";
import { Breakdown } from "../components/Breakdown.tsx";
import { DayDialog } from "../components/DayDialog.tsx";
import { DaysTable } from "../components/DaysTable.tsx";
import { EmployeeDialog } from "../components/EmployeeDialog.tsx";
import { PeriodPicker } from "../components/PeriodPicker.tsx";
import { LeaveDialog } from "../components/LeaveDialog.tsx";
import { scheduleLines } from "../components/scheduleText.ts";
import { errorText } from "../errors.ts";
import { bhd, clock, duration, monthName, rate, timestamp } from "../format.ts";
import { useLang } from "../i18n/context.ts";
import { EmployeeStatement, type StatementMode } from "../print/EmployeeStatement.tsx";
import { readFlash } from "../flash.ts";
import { navigate, paths } from "../router.ts";
import { Alert } from "../ui/Alert.tsx";
import { Badge } from "../ui/Badge.tsx";
import { Button } from "../ui/Button.tsx";
import { Card } from "../ui/Card.tsx";
import { Link } from "../ui/Link.tsx";
import { PageHeader } from "../ui/PageHeader.tsx";
import { Stat } from "../ui/Stat.tsx";
import { Loading, LoadError } from "../ui/States.tsx";
import { useApi } from "../useApi.ts";


export function EmployeeMonthPage({ month: chosen, employeeId }: { month: string | null; employeeId: string }) {
  const { t, lang } = useLang();
  const months = useApi(`employee-months:${employeeId}`, () => api.employeeMonths(employeeId));
  // Without a month in the address, the latest month with data (or this month)
  const month = chosen ?? (months.data ? (months.data[0] ?? monthOf(localToday())) : null);
  const report = useApi(month ? `employee:${month}:${employeeId}` : null, () => api.employeeMonth(month ?? "", employeeId));
  const [flash] = useState(() => readFlash(location.pathname));
  const settings = useApi("settings", api.settings);
  const [editing, setEditing] = useState<DayResult | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [printMode, setPrintMode] = useState<StatementMode>("full");
  const [actionError, setActionError] = useState("");

  const Back = lang === "ar" ? ArrowRight : ArrowLeft;

  const print = (mode: StatementMode) => {
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
    } catch (e) {
      setActionError(errorText(t, e));
    }
  };

  if (months.error) return <LoadError error={months.error} retry={months.reload} />;
  if (report.error) return <LoadError error={report.error} retry={report.reload} />;
  if (!month || !report.data) return <Loading />;


  const r: EmployeeMonthReport = report.data;
  const { employee: e, summary: s } = r;
  const editable = !r.locked;
  const hours = r.schedule.kind === "hours";
  const final = !r.locked && s.rate !== null && !s.needsReview && month < monthOf(localToday());
  const rules = settings.data?.rules;
  // "Save and next" in the day window goes to the next day with a missing punch or an absence
  const nextDay = editing ? (r.days.find((d) => d.date > editing.date && (d.status === "INCOMPLETE" || d.status === "ABSENT")) ?? null) : null;

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
              <Link href={paths.month(month)} className="hover:text-teal-700">
                {t("emp.allStaff", { month: monthName(month, lang) })}
              </Link>
            </span>
          }
          title={e.name}
          badge={
            r.locked ? (
              <Badge tone="neutral">
                <Lock className="size-3" />
                {t("state.locked")}
              </Badge>
            ) : final ? (
              <Badge tone="success">{t("emp.final")}</Badge>
            ) : (
              <Badge tone="warning">{t("emp.notFinal")}</Badge>
            )
          }
          description={
            <span className="flex flex-wrap gap-x-4 gap-y-1">
              <span>
                {t("col.cpr")} <b className="font-medium text-slate-700" dir="ltr">{e.id}</b>
              </span>
              {e.employeeNo ? (
                <span>
                  {t("col.employeeNo")} <b className="font-medium text-slate-700" dir="ltr">{e.employeeNo}</b>
                </span>
              ) : null}
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
                from={month}
                to={month}
                multi={false}
                onMonth={(m) => navigate(paths.employee(employeeId, m))}
                onPeriod={(a, b) => navigate(paths.employeePeriod(employeeId, a, b))}
              />
              {editable ? (
                <Button icon={Plane} onClick={() => setLeaveOpen(true)}>
                  {t("emp.addLeave")}
                </Button>
              ) : null}
              <Button icon={UserCog} onClick={() => setDetailsOpen(true)} disabled={!settings.data}>
                {t("emp.details")}
              </Button>
              <Button icon={Printer} onClick={() => print("exceptions")}>
                {t("emp.printExceptions")}
              </Button>
              <Button variant="primary" icon={Printer} onClick={() => print("full")}>
                {t("emp.printFull")}
              </Button>
            </>
          }
        />

        <div className="flex flex-col gap-5">
          {flash ? <Alert tone="success">{flash}</Alert> : null}
          {actionError ? <Alert tone="danger">{actionError}</Alert> : null}
          {r.locked ? <Alert tone="locked">{t("month.lockedBy", { name: r.locked.lockedBy, date: timestamp(r.locked.lockedAt) })}</Alert> : null}
          {s.rate === null ? <Alert tone="danger">{t("emp.noWage")}</Alert> : null}
          {editable && s.pendingAbsentDays ? (
            <Alert
              tone="warning"
              action={
                <Link href={paths.review(month, "absent")}>
                  <Button size="sm">{t("absence.decide")}</Button>
                </Link>
              }
            >
              {t("absence.alert", { n: s.pendingAbsentDays })}
            </Alert>
          ) : null}
          {s.partial ? <Alert tone="info">{t("month.alert.partial")}</Alert> : null}
          {s.permissionOver && rules ? (
            <Alert tone="warning">
              {t("warn.permission", {
                count: s.permissionCount,
                time: duration(s.permissionMin),
                maxCount: rules.permissionLimitCount,
                maxTime: rules.permissionLimitTime,
              })}
            </Alert>
          ) : null}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <Stat label={t("col.workingDays")} value={s.workingDays} />
            <Stat
              label={t("col.workedHours")}
              value={<span dir="ltr">{duration(s.workedMin)}</span>}
              sub={s.requiredMin === undefined ? undefined : t("stat.ofRequired", { required: duration(s.requiredMin) })}
              hint={t("stat.requiredHint")}
            />
            <Stat label={t("col.present")} value={s.presentDays} />
            <Stat label={t("col.absent")} value={s.absentDays} tone={s.absentDays ? "danger" : undefined} />
            <Stat
              label={t("col.leave")}
              value={s.excusedDays}
              sub={[s.sickDays ? `${t("col.sick")} ${s.sickDays}` : null, r.annualLeaveYear === undefined ? null : t("emp.annualYear", { n: r.annualLeaveYear })]
                .filter(Boolean)
                .join(" · ")}
            />
            <Stat
              label={hours ? t("col.shortfall") : t("col.late")}
              value={<span dir="ltr">{duration(hours ? s.shortfallMin : s.lateMin)}</span>}
              sub={hours || !s.lateDays ? undefined : t("common.days", { n: s.lateDays })}
              tone={s.lateMin + s.shortfallMin ? "warning" : undefined}
            />
            <Stat label={t("col.deduction")} value={<span dir="ltr">{bhd(s.deductionFils)}</span>} sub={t("common.bhd")} tone="teal" />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title={t("calc.title")}>
              <Breakdown s={s} />
            </Card>
            <Card title={t("col.schedule")} description={e.scheduleName}>
              <ul className="flex flex-col gap-2 text-sm text-slate-700">
                {scheduleLines(r.schedule, t, lang).map((line) => (
                  <li key={line} className="flex gap-2">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal-600" />
                    {line}
                  </li>
                ))}
              </ul>
              <div className="mt-4 border-t border-slate-100 pt-4 text-sm">
                <span className="text-slate-500">{t("wage.title")}: </span>
                <b className="font-semibold">{s.rate === null ? t("wage.none") : `${rate(s.rate)} ${t("common.bhd")}`}</b>
              </div>
              {s.inProgressDays ? <p className="mt-3 text-xs text-slate-500">{t("warn.inProgress")}</p> : null}
            </Card>
          </div>

          <Card flush title={t("emp.days")}>
            <DaysTable days={r.days} hours={hours} editable={editable} requiredMin={s.requiredMin} onEdit={setEditing} onToggleSick={(d) => void toggleSick(d)} />
          </Card>
        </div>
      </div>

      <EmployeeStatement report={r} mode={printMode} />

      <DayDialog employeeId={employeeId} day={editing} next={nextDay} onNext={setEditing} onClose={() => setEditing(null)} onSaved={report.reload} />
      <LeaveDialog open={leaveOpen} employeeId={employeeId} month={month} onClose={() => setLeaveOpen(false)} onSaved={report.reload} />
      {settings.data ? (
        <EmployeeDialog
          employee={detailsOpen ? e : null}
          schedules={settings.data.schedules}
          defaultScheduleId={settings.data.defaultScheduleId}
          onClose={() => setDetailsOpen(false)}
          onSaved={report.reload}
        />
      ) : null}
    </>
  );
}
