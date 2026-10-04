import { CalendarDays, Check, CircleCheck, FileClock, FileSpreadsheet, Upload } from "lucide-react";
import Papa from "papaparse";
import { useRef, useState, type DragEvent, type ReactNode } from "react";
import type { ImportResult } from "../../core/api.ts";
import { firstDayOfMonth, lastDayOfMonth, localToday, monthOf, monthsBetween } from "../../core/time.ts";
import { readTimecard, summarizeTimecard, type TimecardRow } from "../../core/timecard.ts";
import { api } from "../api.ts";
import { errorText } from "../errors.ts";
import { date, monthName, timestamp } from "../format.ts";
import { useLang, type TKey } from "../i18n/context.ts";
import { setFlash } from "../flash.ts";
import { navigate, paths } from "../router.ts";
import { Alert } from "../ui/Alert.tsx";
import { Button } from "../ui/Button.tsx";
import { Card } from "../ui/Card.tsx";
import { cx } from "../ui/cx.ts";
import { Field } from "../ui/Field.tsx";
import { Link } from "../ui/Link.tsx";
import { PageHeader } from "../ui/PageHeader.tsx";
import { Empty, Loading, LoadError } from "../ui/States.tsx";
import { useApi } from "../useApi.ts";

interface Parsed {
  fileNames: string[];
  rows: TimecardRow[];
  /** First and last day that has a punch in the files */
  from: string;
  to: string;
}

type PeriodChoice = "file" | "month" | "custom";

const STEPS: TKey[] = ["import.step.choose", "import.step.period", "import.step.import", "import.step.review"];

function parseCsv(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => resolve(res.data),
      error: reject,
    });
  });
}

/** The whole months the files fall in, up to today: days still to come are not absences. */
function wholeMonths(p: Parsed): { from: string; to: string } {
  const end = lastDayOfMonth(monthOf(p.to));
  const today = localToday();
  return { from: firstDayOfMonth(monthOf(p.from)), to: end < today || today < p.to ? end : today };
}

export function ImportPage() {
  const { t, lang } = useLang();
  const history = useApi("imports", api.imports);
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [choice, setChoice] = useState<PeriodChoice>("file");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ result: ImportResult; months: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const readFiles = async (list: FileList | null) => {
    const files = Array.from(list ?? []);
    setError("");
    setResult(null);
    if (!files.length) return;
    if (files.some((f) => !f.name.toLowerCase().endsWith(".csv"))) return setError(t("import.onlyCsv"));

    try {
      const rows = (await Promise.all(files.map(parseCsv))).flatMap((data) => readTimecard(data));
      if (!rows.length) {
        setParsed(null);
        return setError(t("import.noRows"));
      }
      const dates = rows.map((r) => r.date).sort();
      const next = { fileNames: files.map((f) => f.name), rows, from: dates[0], to: dates[dates.length - 1] };
      setParsed(next);
      // HR exports whole months, so days without a punch are absences unless they say otherwise
      setChoice("month");
      setCustomFrom(next.from);
      setCustomTo(next.to);
    } catch {
      setError(t("import.noRows"));
    }
  };

  const period = !parsed
    ? null
    : choice === "file"
      ? { from: parsed.from, to: parsed.to }
      : choice === "month"
        ? wholeMonths(parsed)
        : { from: customFrom, to: customTo };

  const submit = async () => {
    if (!parsed || !period) return;
    setError("");
    if (!period.from || !period.to || period.from > period.to) return setError(t("error.invalid_period"));
    setBusy(true);
    try {
      const fileName = parsed.fileNames.join(", ").slice(0, 300);
      const res = await api.importTimecard({ fileName, from: period.from, to: period.to, rows: parsed.rows });
      const months = monthsBetween(period.from, period.to).filter((m) => m <= monthOf(localToday()));
      const staff = summarizeTimecard(parsed.rows);
      const latest = months.at(-1);
      if (latest) {
        // One person: their days; several: everyone. A file over several months opens that period.
        const first = months[0];
        const target = staff.length === 1 ? paths.employeePeriod(staff[0].employeeId, first, latest) : paths.period(first, latest);
        setFlash(
          target,
          `${t("import.done")} · ${t("import.result", {
            employees: res.employees,
            newEmployees: res.newEmployees,
            added: res.punchesAdded,
            existing: res.punchesExisting,
          })}`,
        );
        navigate(target);
        return;
      }
      setResult({ result: res, months });
      setParsed(null);
      history.reload();
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void readFiles(e.dataTransfer.files);
  };

  const employees = parsed ? summarizeTimecard(parsed.rows) : [];
  const unreadable = parsed ? parsed.rows.reduce((n, r) => n + r.invalid.length, 0) : 0;
  const months = parsed ? wholeMonths(parsed) : null;
  const sameAsFile = Boolean(parsed && months && months.from === parsed.from && months.to === parsed.to);
  const step = result ? 3 : parsed ? 1 : 0;

  return (
    <>
      <PageHeader title={t("import.title")} description={t("import.subtitle")} />

      <div className="flex flex-col gap-5">
        <Steps current={step} />

        {error ? <Alert tone="danger">{error}</Alert> : null}

        {result ? (
          <Card>
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CircleCheck className="size-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{t("import.done")}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {t("import.result", {
                    employees: result.result.employees,
                    newEmployees: result.result.newEmployees,
                    added: result.result.punchesAdded,
                    existing: result.result.punchesExisting,
                  })}
                </p>
              </div>
              <p className="text-sm font-medium text-slate-800">{t("import.next")}</p>
              <div className="mt-1 flex flex-wrap justify-center gap-2">
                {result.months.map((m) => (
                  <Link key={m} href={paths.month(m)}>
                    <Button variant="primary" icon={CalendarDays}>
                      {t("import.openMonth", { month: monthName(m, lang) })}
                    </Button>
                  </Link>
                ))}
                <Button icon={Upload} onClick={() => setResult(null)}>
                  {t("import.another")}
                </Button>
              </div>
            </div>
          </Card>
        ) : null}

        {!parsed && !result ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={cx(
              "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition",
              dragging ? "border-teal-500 bg-teal-50" : "border-slate-300 bg-white hover:border-teal-400 hover:bg-slate-50",
            )}
          >
            <div className="flex size-12 items-center justify-center rounded-full bg-teal-50 text-teal-700">
              <Upload className="size-6" />
            </div>
            <div className="mt-4 text-base font-semibold text-slate-900">{t("import.drop")}</div>
            <div className="mt-1 text-sm text-slate-500">{t("import.dropHint")}</div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              multiple
              className="hidden"
              onChange={(e) => {
                void readFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        ) : null}

        {parsed && period && months ? (
          <Card
            title={
              <span className="flex flex-wrap items-center gap-2">
                <FileSpreadsheet className="size-4 text-slate-400" />
                {parsed.fileNames.join(" · ")}
              </span>
            }
            description={t("import.files", { n: parsed.fileNames.length, rows: parsed.rows.length, employees: employees.length })}
          >
            <div className="flex flex-col gap-6">
              <section>
                <h3 className="mb-3 text-sm font-semibold text-slate-900">{t("import.periodQuestion")}</h3>
                <div className="grid gap-2 sm:grid-cols-3">
                  <PeriodOption
                    checked={choice === "month" || (sameAsFile && choice === "file")}
                    onSelect={() => setChoice("month")}
                    label={t(monthOf(parsed.from) === monthOf(parsed.to) ? "import.period.month" : "import.period.months")}
                    badge={t("import.recommended")}
                  >
                    {date(months.from)} – {date(months.to)}
                  </PeriodOption>
                  {sameAsFile ? null : (
                    <PeriodOption checked={choice === "file"} onSelect={() => setChoice("file")} label={t("import.period.file")}>
                      {date(parsed.from)} – {date(parsed.to)}
                    </PeriodOption>
                  )}
                  <PeriodOption checked={choice === "custom"} onSelect={() => setChoice("custom")} label={t("import.period.custom")}>
                    {choice === "custom" ? null : "…"}
                  </PeriodOption>
                </div>
                {choice === "custom" ? (
                  <div className="mt-3 grid gap-4 sm:grid-cols-[repeat(2,minmax(0,12rem))]">
                    <Field label={t("common.from")}>
                      <input type="date" className="input" value={customFrom} max={parsed.from} onChange={(e) => setCustomFrom(e.target.value)} />
                    </Field>
                    <Field label={t("common.to")}>
                      <input type="date" className="input" value={customTo} min={parsed.to} onChange={(e) => setCustomTo(e.target.value)} />
                    </Field>
                  </div>
                ) : null}
                <p className="mt-3 text-xs leading-relaxed text-slate-500">{t("import.periodHint")}</p>
              </section>

              {unreadable ? <Alert tone="warning">{t("import.unreadable", { n: unreadable })}</Alert> : null}

              <section>
                <h3 className="mb-3 text-sm font-semibold text-slate-900">{t("import.inFile")}</h3>
                <div className="max-h-80 overflow-auto rounded-lg border border-slate-200">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t("col.name")}</th>
                        <th>{t("col.cpr")}</th>
                        <th>{t("col.department")}</th>
                        <th>{t("common.from")}</th>
                        <th>{t("common.to")}</th>
                        <th>{t("col.present")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map((e) => (
                        <tr key={e.employeeId}>
                          <td className="font-medium">{e.name}</td>
                          <td dir="ltr" className="text-start text-slate-600">
                            {e.employeeId}
                          </td>
                          <td className="text-slate-600">{e.department}</td>
                          <td dir="ltr" className="text-start">
                            {date(e.from)}
                          </td>
                          <td dir="ltr" className="text-start">
                            {date(e.to)}
                          </td>
                          <td>{t("common.days", { n: e.days })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
                <div className="text-sm text-slate-600">
                  {t("import.period")}:{" "}
                  <span dir="ltr" className="font-semibold text-slate-900">
                    {period.from ? date(period.from) : "–"} – {period.to ? date(period.to) : "–"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => setParsed(null)}>{t("common.cancel")}</Button>
                  <Button variant="primary" icon={CircleCheck} loading={busy} onClick={() => void submit()} className="px-6">
                    {t("import.submit")}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ) : null}

        <Card flush title={t("import.history")}>
          {history.error ? (
            <div className="p-5">
              <LoadError error={history.error} retry={history.reload} />
            </div>
          ) : !history.data ? (
            <Loading />
          ) : history.data.length === 0 ? (
            <Empty icon={FileClock} title={t("import.historyEmpty")} />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>{t("import.when")}</th>
                  <th>{t("import.file")}</th>
                  <th>{t("import.period")}</th>
                  <th>{t("col.employees")}</th>
                  <th>{t("import.added")}</th>
                  <th>{t("import.by")}</th>
                </tr>
              </thead>
              <tbody>
                {history.data.map((i) => (
                  <tr key={i.id}>
                    <td dir="ltr" className="text-start text-slate-600">
                      {timestamp(i.createdAt)}
                    </td>
                    <td className="max-w-72 truncate" title={i.fileName}>
                      {i.fileName}
                    </td>
                    <td dir="ltr" className="text-start">
                      {date(i.dateFrom)} – {date(i.dateTo)}
                    </td>
                    <td>{i.employeeCount}</td>
                    <td>{i.punchesAdded}</td>
                    <td className="text-slate-600">{i.userName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}

/** The import steps in a row; finished ones are ticked. */
function Steps({ current }: { current: number }) {
  const { t } = useLang();
  return (
    <ol className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
      {STEPS.map((key, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={key} className={cx("flex items-center gap-2", active ? "font-semibold text-slate-900" : done ? "text-slate-600" : "text-slate-400")}>
            <span
              className={cx(
                "flex size-6 items-center justify-center rounded-full text-xs",
                done ? "bg-teal-700 text-white" : active ? "bg-teal-50 text-teal-800 ring-2 ring-teal-600" : "bg-slate-100 text-slate-500",
              )}
            >
              {done ? <Check className="size-3.5" /> : i + 1}
            </span>
            {t(key)}
          </li>
        );
      })}
    </ol>
  );
}

interface PeriodOptionProps {
  checked: boolean;
  onSelect: () => void;
  label: string;
  badge?: string;
  children: ReactNode;
}

function PeriodOption({ checked, onSelect, label, badge, children }: PeriodOptionProps) {
  return (
    <label
      className={cx(
        "flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition",
        checked ? "border-teal-600 bg-teal-50/60 ring-1 ring-teal-600" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
      )}
    >
      <input type="radio" name="period" checked={checked} onChange={onSelect} className="mt-1 accent-teal-700" />
      <span className="flex flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
          {label}
          {badge ? <span className="rounded bg-teal-100 px-1.5 py-0.5 text-[11px] font-medium text-teal-800">{badge}</span> : null}
        </span>
        <span dir="ltr" className="text-start text-xs text-slate-500">
          {children}
        </span>
      </span>
    </label>
  );
}
