import { ArrowLeft, ArrowRight, Banknote, CalendarCheck, CalendarOff, Check, Download, ListChecks, Lock, LockOpen, Printer, Search, Upload, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { MonthOverview, PossibleHoliday } from "../../core/api.ts";
import { addDays } from "../../core/time.ts";
import type { MonthSummary } from "../../core/types.ts";
import { api } from "../api.ts";
import { useAuth } from "../auth/context.ts";
import { asText, downloadCsv } from "../csv.ts";
import { errorText } from "../errors.ts";
import { bhd, date, dayName, decimalHours, duration, monthName, rate, shortDate, timestamp } from "../format.ts";
import { useLang, type TKey, type Translate } from "../i18n/context.ts";
import { HolidayDialog } from "../components/HolidayDialog.tsx";
import { PeriodPicker } from "../components/PeriodPicker.tsx";
import { DepartmentSheet } from "../print/DepartmentSheet.tsx";
import { readFlash } from "../flash.ts";
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

function stateBadge(s: MonthSummary, t: Translate) {
  if (s.rate === null) return <Badge tone="danger">{t("state.noWage")}</Badge>;
  if (s.needsReview) return <Badge tone="violet">{t("state.review", { n: s.needsReview })}</Badge>;
  return <Badge tone="success">{t("state.ready")}</Badge>;
}

export function MonthPage({ month }: { month: string }) {
  const { t, lang } = useLang();
  const { isAdmin } = useAuth();
  const overview = useApi(`month:${month}`, () => api.month(month));
  const months = useApi("months", api.months);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [holiday, setHoliday] = useState<{ from: string; to: string } | null>(null);
  const [flash] = useState(() => readFlash(location.pathname));
  const Back = lang === "ar" ? ArrowRight : ArrowLeft;
  const label = monthName(month, lang);

  const toggleLock = async (data: MonthOverview) => {
    const question = data.locked ? t("month.unlockConfirm", { month: label }) : t("month.lockConfirm", { month: label });
    if (!window.confirm(question)) return;
    setBusy(true);
    setActionError("");
    try {
      if (data.locked) await api.unlockMonth(month);
      else await api.lockMonth(month);
      overview.reload();
    } catch (e) {
      setActionError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  // HR confirms the files covered the whole month: days without a punch become absences
  const coverMonth = async () => {
    if (!window.confirm(t("check.coverConfirm", { month: label }))) return;
    setBusy(true);
    setActionError("");
    try {
      await api.coverMonth(month);
      overview.reload();
    } catch (e) {
      setActionError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = (data: MonthOverview) => {
    const header = [
      t("col.month"), t("col.cpr"), t("col.employeeNo"), t("col.name"), t("col.department"), t("col.workingDays"),
      t("col.absent"), t("col.leave"), t("col.review"), t("col.workedHours"), t("col.requiredHours"), t("col.late"), t("col.early"), t("col.shortfall"),
      t("col.deductible"), t("col.deductibleHours"), t("col.rate"), t("col.salaryAbsence"),
      `${t("col.lateDeduction")} (${t("common.bhd")})`, `${t("col.absenceDeduction")} (${t("common.bhd")})`, `${t("col.deduction")} (${t("common.bhd")})`,
    ];
    const rows = data.rows.map(({ employee: e, summary: s }) => [
      month, asText(e.id), e.employeeNo, e.name, e.department, s.workingDays, s.absentDays, s.excusedDays, s.needsReview,
      duration(s.workedMin), duration(s.requiredMin), duration(s.lateMin), duration(s.earlyMin), duration(s.shortfallMin), duration(s.deductibleMin),
      decimalHours(s.deductibleMin), rate(s.rate), s.salaryAbsenceDays ?? 0,
      s.latenessFils == null ? "" : bhd(s.latenessFils), s.absenceFils == null ? "" : bhd(s.absenceFils),
      s.deductionFils === null ? "" : bhd(s.deductionFils),
    ]);
    downloadCsv(`deductions-${month}.csv`, [header, ...rows]);
  };

  const data = overview.data;
  const rows = data?.rows.filter(({ employee: e }) => {
    const q = query.trim().toLowerCase();
    return !q || e.name.toLowerCase().includes(q) || e.id.includes(q) || e.employeeNo.includes(q);
  });
  const totals = data
    ? {
        incomplete: data.rows.reduce((n, r) => n + r.summary.incompleteDays, 0),
        absent: data.rows.reduce((n, r) => n + r.summary.absentDays, 0),
        pendingAbsent: data.rows.reduce((n, r) => n + (r.summary.pendingAbsentDays ?? 0), 0),
        noWage: data.rows.filter((r) => r.summary.rate === null).length,
        get ready() {
          return !this.partial && !this.incomplete && !this.pendingAbsent && !this.noWage;
        },
        partial: data.rows.some((r) => r.summary.partial),
        minutes: data.rows.reduce((n, r) => n + r.summary.deductibleMin, 0),
        // null until at least one employee has an hourly wage
        fils: data.rows.some((r) => r.summary.deductionFils !== null)
          ? data.rows.reduce((n, r) => n + (r.summary.deductionFils ?? 0), 0)
          : null,
      }
    : null;

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
          title={label}
          badge={
            data ? (
              data.locked ? (
                <Badge tone="neutral">
                  <Lock className="size-3" />
                  {t("state.locked")}
                </Badge>
              ) : (
                <Badge tone="teal">{t("state.open")}</Badge>
              )
            ) : null
          }
          actions={
            data ? (
              <>
                <PeriodPicker
                  months={(months.data ?? []).map((m) => m.month)}
                  from={month}
                  to={month}
                  multi={false}
                  onMonth={(m) => navigate(paths.month(m))}
                  onPeriod={(a, b) => navigate(paths.period(a, b))}
                />
                <Button icon={Download} onClick={() => exportCsv(data)} disabled={!data.rows.length}>
                  {t("month.export")}
                </Button>
                <Button icon={Printer} onClick={() => window.print()} disabled={!data.rows.length}>
                  {t("month.print")}
                </Button>
                {isAdmin ? (
                  data.locked ? (
                    <Button icon={LockOpen} loading={busy} onClick={() => void toggleLock(data)}>
                      {t("month.unlock")}
                    </Button>
                  ) : (
                    <Button
                      variant={totals?.ready ? "primary" : "secondary"}
                      icon={Lock}
                      loading={busy}
                      disabled={!data.rows.length}
                      onClick={() => void toggleLock(data)}
                    >
                      {t("month.lock")}
                    </Button>
                  )
                ) : null}
              </>
            ) : null
          }
        />

        {overview.error ? (
          <LoadError error={overview.error} retry={overview.reload} />
        ) : !data || !totals || !rows ? (
          <Loading />
        ) : (
          <div className="flex flex-col gap-5">
            {flash ? <Alert tone="success">{flash}</Alert> : null}
            {actionError ? <Alert tone="danger">{actionError}</Alert> : null}
            {data.locked ? null : (
              <PossibleHolidays days={data.possibleHolidays} onAdd={(from, to) => setHoliday({ from, to })} />
            )}
            {data.locked ? (
              <Alert tone="locked">{t("month.lockedBy", { name: data.locked.lockedBy, date: timestamp(data.locked.lockedAt) })}</Alert>
            ) : null}

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label={t("month.stat.employees")} value={data.rows.length} />
              <Stat label={t("month.stat.review")} value={totals.incomplete} tone={totals.incomplete ? "warning" : undefined} />
              <Stat label={t("month.stat.deductible")} value={<span dir="ltr">{duration(totals.minutes)}</span>} sub={`${decimalHours(totals.minutes)} h`} />
              <Stat label={t("month.stat.deduction")} value={<span dir="ltr">{bhd(totals.fils)}</span>} sub={totals.fils === null ? undefined : t("common.bhd")} tone="teal" />
            </div>

            {data.locked || !data.rows.length ? null : (
              <Checklist month={month} totals={totals} missingDays={data.missingDays} busy={busy} onCoverMonth={() => void coverMonth()} />
            )}

            <Card
              flush
              title={t("nav.employees")}
              actions={
                <div className="relative">
                  <Search className="pointer-events-none absolute start-2.5 top-2.5 size-4 text-slate-400" />
                  <input className="input w-64 ps-8" placeholder={t("common.search")} value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
              }
            >
              {data.rows.length === 0 ? (
                <Empty icon={Users} title={t("month.empty")} />
              ) : rows.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-slate-500">{t("month.noMatch")}</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
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
                      <th>{t("col.state")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ employee: e, summary: s }) => (
                      <tr key={e.id} onClick={() => navigate(paths.employeeMonth(month, e.id))} className="cursor-pointer hover:bg-slate-50">
                        <td>
                          <Link href={paths.employeeMonth(month, e.id)} className="font-medium text-slate-900 hover:text-teal-700">
                            {e.name}
                          </Link>
                          {e.department ? <div className="text-xs text-slate-500">{e.department}</div> : null}
                        </td>
                        <td dir="ltr" className="text-start text-slate-600">
                          {e.id}
                        </td>
                        <td className={s.absentDays ? "font-medium text-red-700" : "text-slate-400"}>
                          {s.absentDays}
                          {s.salaryAbsenceDays ? (
                            <span className="ms-1 text-xs font-normal text-slate-500">
                              ({s.salaryAbsenceDays} {t("print.fromSalary")})
                            </span>
                          ) : null}
                        </td>
                        <td className={s.excusedDays ? "" : "text-slate-400"}>{s.excusedDays}</td>
                        <td dir="ltr" className="text-start" title={s.requiredMin === undefined ? undefined : t("stat.ofRequired", { required: duration(s.requiredMin) })}>
                          {duration(s.workedMin)}
                        </td>
                        <td dir="ltr" className="text-start">
                          {duration(s.lateMin + s.shortfallMin)}
                        </td>
                        <td dir="ltr" className="text-start">
                          {duration(s.earlyMin)}
                        </td>
                        <td dir="ltr" className="text-start font-medium">
                          {duration(s.deductibleMin)}
                        </td>
                        <td dir="ltr" className="text-start text-slate-600">
                          {rate(s.rate)}
                        </td>
                        <td className="font-semibold" dir="ltr">
                          {bhd(s.deductionFils)}
                        </td>
                        <td>{stateBadge(s, t)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {rows.length > 1 ? <MonthTotal rows={rows} /> : null}
                </table>
              )}
            </Card>
          </div>
        )}
      </div>

      {data && data.rows.length ? <DepartmentSheet overview={data} /> : null}
      <HolidayDialog from={holiday?.from ?? null} to={holiday?.to} onClose={() => setHoliday(null)} onSaved={overview.reload} />
    </>
  );
}

interface ChecklistProps {
  month: string;
  totals: { incomplete: number; absent: number; pendingAbsent: number; noWage: number; partial: boolean };
  missingDays: string[];
  busy: boolean;
  onCoverMonth: () => void;
}

/** Dates as short ranges, a weekend apart counting as one: "01/09 – 10/09، 16/09" */
function dateRanges(dates: string[], separator: string): string {
  const ranges: [string, string][] = [];
  for (const d of dates) {
    const last = ranges.at(-1);
    if (last && addDays(last[1], 3) >= d) last[1] = d;
    else ranges.push([d, d]);
  }
  return ranges.map(([a, b]) => (a === b ? shortDate(a) : `${shortDate(a)} – ${shortDate(b)}`)).join(separator);
}

/** What is left before the month can be approved, each step with the button that does it. */
function Checklist({ month, totals, missingDays, busy, onCoverMonth }: ChecklistProps) {
  const { t, lang } = useLang();
  const steps: { title: TKey; done: boolean; text: string[]; action: ReactNode }[] = [
    {
      title: "check.data",
      done: !totals.partial,
      text: totals.partial
        ? [t("check.dataMissing", { ranges: dateRanges(missingDays, lang === "ar" ? "، " : ", ") }), t("check.dataWholeHint")]
        : [t("check.dataOk")],
      action: totals.partial ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" icon={CalendarCheck} loading={busy} onClick={onCoverMonth}>
            {t("check.coverMonth")}
          </Button>
          <Link href={paths.import()}>
            <Button size="sm" icon={Upload}>
              {t("months.import")}
            </Button>
          </Link>
        </div>
      ) : null,
    },
    {
      title: "check.review",
      done: !totals.incomplete && !totals.pendingAbsent,
      text: [
        totals.incomplete ? t("check.reviewTodo", { n: totals.incomplete }) : t("check.reviewOk"),
        ...(totals.pendingAbsent ? [t("check.absentPending", { n: totals.pendingAbsent })] : totals.absent ? [t("check.absentDecided")] : []),
      ],
      action: totals.incomplete ? (
        <Link href={paths.review(month)}>
          <Button size="sm" variant="primary" icon={ListChecks}>
            {t("check.startReview")}
          </Button>
        </Link>
      ) : totals.pendingAbsent ? (
        <Link href={paths.review(month, "absent")}>
          <Button size="sm" variant="primary" icon={ListChecks}>
            {t("check.reviewAbsences")}
          </Button>
        </Link>
      ) : null,
    },
    {
      title: "check.wage",
      done: !totals.noWage,
      text: [totals.noWage ? t("check.wageTodo", { n: totals.noWage }) : t("check.wageOk")],
      action: totals.noWage ? (
        <Link href={paths.employees("noWage")}>
          <Button size="sm" icon={Banknote}>
            {t("check.setWages")}
          </Button>
        </Link>
      ) : null,
    },
  ];

  return (
    <Card title={t("check.title")}>
      <ol className="grid gap-3 md:grid-cols-3">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className={cx("flex flex-col gap-2 rounded-lg border p-4", step.done ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200")}
          >
            <div className="flex items-center gap-2">
              <span
                className={cx(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  step.done ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600",
                )}
              >
                {step.done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className="font-semibold text-slate-900">{t(step.title)}</span>
            </div>
            {step.text.map((line) => (
              <p key={line} className="text-sm leading-relaxed text-slate-600">
                {line}
              </p>
            ))}
            {step.action ? <div className="mt-auto pt-1">{step.action}</div> : null}
          </li>
        ))}
      </ol>
    </Card>
  );
}

/**
 * Days on which almost nobody punched: probably a public holiday that is not set yet. Days a
 * weekend apart (e.g. Eid from Thursday to Sunday) are offered as one holiday.
 */
function PossibleHolidays({ days, onAdd }: { days: PossibleHoliday[]; onAdd: (from: string, to: string) => void }) {
  const { t, lang } = useLang();
  const groups: PossibleHoliday[][] = [];
  for (const d of days) {
    const last = groups.at(-1);
    if (last && addDays(last[last.length - 1].date, 3) >= d.date) last.push(d);
    else groups.push([d]);
  }
  if (!groups.length) return null;

  return (
    <Alert tone="warning">
      <ul className="flex flex-col gap-2">
        {groups.map((g) => {
          const first = g[0];
          const last = g[g.length - 1];
          return (
            <li key={first.date} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {g.length === 1
                  ? t("month.possibleHoliday", { day: dayName(first.weekday, lang), date: date(first.date), absent: first.absent, total: first.total })
                  : t("month.possibleHolidayRange", {
                      from: `${dayName(first.weekday, lang)} ${date(first.date)}`,
                      to: `${dayName(last.weekday, lang)} ${date(last.date)}`,
                    })}
              </span>
              <Button size="sm" icon={CalendarOff} onClick={() => onAdd(first.date, last.date)}>
                {t("month.addHoliday")}
              </Button>
            </li>
          );
        })}
      </ul>
    </Alert>
  );
}

/** Totals of the employees shown, under the table. */
function MonthTotal({ rows }: { rows: MonthOverview["rows"] }) {
  const { t } = useLang();
  const sum = (pick: (s: MonthSummary) => number) => rows.reduce((n, r) => n + pick(r.summary), 0);
  const priced = rows.some((r) => r.summary.deductionFils !== null);
  return (
    <tfoot>
      <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
        <td colSpan={2}>{t("common.total")}</td>
        <td>{sum((s) => s.absentDays)}</td>
        <td>{sum((s) => s.excusedDays)}</td>
        <td dir="ltr" className="text-start">
          {duration(sum((s) => s.workedMin))}
        </td>
        <td dir="ltr" className="text-start">
          {duration(sum((s) => s.lateMin + s.shortfallMin))}
        </td>
        <td dir="ltr" className="text-start">
          {duration(sum((s) => s.earlyMin))}
        </td>
        <td dir="ltr" className="text-start">
          {duration(sum((s) => s.deductibleMin))}
        </td>
        <td />
        <td dir="ltr">{priced ? bhd(sum((s) => s.deductionFils ?? 0)) : "–"}</td>
        <td />
      </tr>
    </tfoot>
  );
}
