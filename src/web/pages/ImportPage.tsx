import { CalendarDays, Check, CircleCheck, FileClock, FileSpreadsheet, Trash, Upload } from "lucide-react";
import { useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import type { ImportRecord, ImportResult } from "../../core/api.ts";
import { addDays, firstDayOfMonth, lastDayOfMonth, localToday, monthOf, monthsBetween } from "../../core/time.ts";
import {
  cellText,
  detectLayout,
  missingFields,
  readTimecard,
  setColumn,
  summarizeTimecard,
  TIMECARD_FIELDS,
  type Cell,
  type TimecardField,
  type TimecardLayout,
} from "../../core/timecard.ts";
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

/** An uploaded file and what each of its columns holds. */
interface Source {
  name: string;
  rows: Cell[][];
  layout: TimecardLayout;
}

type PeriodChoice = "file" | "month" | "custom";

const STEPS: TKey[] = ["import.step.choose", "import.step.period", "import.step.import", "import.step.review"];

const FIELD_LABEL: Record<TimecardField, TKey> = {
  employeeId: "import.col.employeeId",
  name: "import.col.name",
  department: "import.col.department",
  date: "import.col.date",
  time: "import.col.time",
};

/** The files HR can import: CSV and Excel .xlsx (not the old .xls). */
const isSpreadsheet = (file: File) => /\.(csv|xlsx)$/i.test(file.name);

/** The sheet of a file that has attendance in it, and its columns. */
async function readSource(file: File): Promise<Source> {
  const { readSpreadsheet } = await import("../sheetFile.ts");
  const sheets = (await readSpreadsheet(file)).filter((rows) => rows.length).map((rows) => ({ rows, layout: detectLayout(rows) }));
  const sheet = sheets.find((s) => readTimecard(s.rows, s.layout).length) ?? sheets[0];
  return { name: file.name, rows: sheet?.rows ?? [], layout: sheet?.layout ?? { headerRow: -1, columns: [] } };
}

/** Files with the same title row share their columns, so HR corrects them once. */
const layoutKey = ({ rows, layout }: Source) =>
  layout.headerRow < 0 ? `#${layout.columns.length}` : rows[layout.headerRow].map(cellText).join("|");

/**
 * The whole months the files fall in, up to yesterday: today and the days still to come are
 * not absences. A file exported this morning has no punches for today yet.
 */
function wholeMonths(p: { from: string; to: string }): { from: string; to: string } {
  const end = lastDayOfMonth(monthOf(p.to));
  const yesterday = addDays(localToday(), -1);
  return { from: firstDayOfMonth(monthOf(p.from)), to: end <= yesterday ? end : p.to > yesterday ? p.to : yesterday };
}

export function ImportPage() {
  const { t, lang } = useLang();
  const history = useApi("imports", api.imports);
  const inputRef = useRef<HTMLInputElement>(null);
  const [sources, setSources] = useState<Source[] | null>(null);
  const [choice, setChoice] = useState<PeriodChoice>("file");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ result: ImportResult; months: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [historyNote, setHistoryNote] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  // The rows as the columns read them now; they follow HR's corrections
  const parsed = useMemo(() => {
    if (!sources) return null;
    const rows = sources.flatMap((s) => readTimecard(s.rows, s.layout));
    const dates = rows.map((r) => r.date).sort();
    return { fileNames: sources.map((s) => s.name), rows, from: dates[0] ?? "", to: dates.at(-1) ?? "" };
  }, [sources]);

  const readFiles = async (list: FileList | null) => {
    const files = Array.from(list ?? []);
    setError("");
    setResult(null);
    if (!files.length) return;
    if (!files.every(isSpreadsheet)) return setError(t("import.fileType"));

    try {
      const read = await Promise.all(files.map(readSource));
      if (read.every((s) => !s.rows.length)) return setError(t("import.empty"));
      const dates = read
        .flatMap((s) => readTimecard(s.rows, s.layout))
        .map((r) => r.date)
        .sort();
      setSources(read);
      // HR exports whole months, so days without a punch are absences unless they say otherwise
      setChoice("month");
      setCustomFrom(dates[0] ?? "");
      setCustomTo(dates.at(-1) ?? "");
    } catch {
      setError(t("import.unreadableFile"));
    }
  };

  const changeColumn = (key: string, index: number, field: TimecardField | null) =>
    setSources(
      (list) =>
        list?.map((s) =>
          layoutKey(s) === key ? { ...s, layout: { ...s.layout, columns: setColumn(s.layout.columns, index, field) } } : s,
        ) ?? null,
    );

  const missing = sources ? [...new Set(sources.flatMap((s) => missingFields(s.rows, s.layout)))] : [];
  const ready = Boolean(parsed?.rows.length) && missing.length === 0;

  const period =
    !parsed || !ready
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
      setSources(null);
      history.reload();
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  const removeImport = async (i: ImportRecord) => {
    if (!window.confirm(t("import.deleteConfirm", { file: i.fileName }))) return;
    setHistoryNote(null);
    setDeleting(i.id);
    try {
      const res = await api.deleteImport(i.id);
      setHistoryNote({ tone: "success", text: t("import.deleted", { punches: res.punchesRemoved, employees: res.employeesRemoved }) });
      history.reload();
    } catch (e) {
      setHistoryNote({ tone: "danger", text: errorText(t, e) });
    } finally {
      setDeleting(null);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void readFiles(e.dataTransfer.files);
  };

  // One column table for each kind of file
  const layouts = sources ? [...new Map(sources.map((s) => [layoutKey(s), s])).entries()] : [];
  const employees = parsed && ready ? summarizeTimecard(parsed.rows) : [];
  const unreadable = parsed && ready ? parsed.rows.reduce((n, r) => n + r.invalid.length, 0) : 0;
  const months = parsed && ready ? wholeMonths(parsed) : null;
  const sameAsFile = Boolean(parsed && months && months.from === parsed.from && months.to === parsed.to);
  const step = result ? 3 : sources ? 1 : 0;
  const list = (items: string[]) => items.join(lang === "ar" ? "، " : ", ");

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

        {!sources && !result ? (
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
              accept=".csv,.xlsx"
              multiple
              className="hidden"
              onChange={(e) => {
                void readFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        ) : null}

        {sources && parsed ? (
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
                <h3 className="text-sm font-semibold text-slate-900">{t("import.columns")}</h3>
                <p className="mt-1 mb-3 text-xs leading-relaxed text-slate-500">{t("import.columnsHint")}</p>
                <div className="flex flex-col gap-4">
                  {layouts.map(([key, source]) => (
                    <ColumnsTable
                      key={key}
                      source={source}
                      files={layouts.length > 1 ? sources.filter((s) => layoutKey(s) === key).map((s) => s.name) : []}
                      onChange={(index, field) => changeColumn(key, index, field)}
                    />
                  ))}
                </div>
                {missing.length ? (
                  <Alert tone="danger" className="mt-3">
                    {t("import.missing", { fields: list(missing.map((f) => t(FIELD_LABEL[f]))) })}
                  </Alert>
                ) : !parsed.rows.length ? (
                  <Alert tone="danger" className="mt-3">
                    {t("import.noRows")}
                  </Alert>
                ) : null}
              </section>

              {period && months ? (
                <>
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
                </>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
                <div className="text-sm text-slate-600">
                  {period ? (
                    <>
                      {t("import.period")}:{" "}
                      <span dir="ltr" className="font-semibold text-slate-900">
                        {period.from ? date(period.from) : "–"} – {period.to ? date(period.to) : "–"}
                      </span>
                    </>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => setSources(null)}>{t("common.cancel")}</Button>
                  <Button variant="primary" icon={CircleCheck} loading={busy} disabled={!period} onClick={() => void submit()} className="px-6">
                    {t("import.submit")}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ) : null}

        {historyNote ? <Alert tone={historyNote.tone}>{historyNote.text}</Alert> : null}

        <Card flush title={t("import.history")} description={t("import.historyHint")}>
          {history.error ? (
            <div className="p-5">
              <LoadError error={history.error} retry={history.reload} />
            </div>
          ) : !history.data ? (
            <Loading />
          ) : history.data.length === 0 ? (
            <Empty icon={FileClock} title={t("import.historyEmpty")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("import.file")}</th>
                    <th>{t("import.period")}</th>
                    <th>{t("col.employees")}</th>
                    <th>{t("import.added")}</th>
                    <th />

                  </tr>
                </thead>
                <tbody>
                  {history.data.map((i) => (
                    <tr key={i.id}>
                      <td className="max-w-72">
                        <div className="truncate font-medium" title={i.fileName}>
                          {i.fileName}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          <span dir="ltr">{timestamp(i.createdAt)}</span> · {i.userName}
                        </div>
                      </td>
                      <td dir="ltr" className="text-start">
                        {date(i.dateFrom)} – {date(i.dateTo)}
                      </td>
                      <td>{i.employeeCount}</td>
                      <td>{i.punchesAdded}</td>
                      <td className="text-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={Trash}
                          aria-label={t("common.delete")}
                          title={t("common.delete")}
                          loading={deleting === i.id}
                          disabled={deleting !== null}
                          onClick={() => void removeImport(i)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

interface ColumnsTableProps {
  source: Source;
  /** The files that use these columns, when the files differ. */
  files: string[];
  onChange: (index: number, field: TimecardField | null) => void;
}

/** The first rows of a file, with a choice above each column of what it holds. */
function ColumnsTable({ source, files, onChange }: ColumnsTableProps) {
  const { t } = useLang();
  const { rows, layout } = source;
  const titles = layout.headerRow >= 0 ? rows[layout.headerRow] : null;
  const sample = rows
    .slice(layout.headerRow + 1)
    .filter((r) => r.some((c) => cellText(c)))
    .slice(0, 3);

  return (
    <div>
      {files.length ? <p className="mb-1.5 truncate text-xs font-medium text-slate-600">{files.join(" · ")}</p> : null}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="table">
          <thead>
            <tr>
              {layout.columns.map((field, i) => (
                <th key={i} className={cx("min-w-36 align-top", field ? "bg-teal-50" : "")}>
                  <select
                    className={cx("input h-8 text-sm", field ? "border-teal-600 font-medium" : "text-slate-500")}
                    value={field ?? ""}
                    aria-label={t("import.columnLabel", { n: i + 1 })}
                    onChange={(e) => onChange(i, (e.target.value || null) as TimecardField | null)}
                  >
                    <option value="">{t("import.col.none")}</option>
                    {TIMECARD_FIELDS.map((f) => (
                      <option key={f} value={f}>
                        {t(FIELD_LABEL[f])}
                      </option>
                    ))}
                  </select>
                  {titles ? <div className="mt-1.5 max-w-48 truncate font-normal">{cellText(titles[i]) || "–"}</div> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sample.map((row, r) => (
              <tr key={r}>
                {layout.columns.map((field, i) => (
                  <td key={i} dir="auto" className={cx("max-w-48 truncate text-xs", field ? "bg-teal-50/40 text-slate-900" : "text-slate-400")}>
                    {cellText(row[i])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
