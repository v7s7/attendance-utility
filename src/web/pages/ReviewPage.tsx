import { ArrowLeft, ArrowRight, Banknote, Check, CircleCheck, Pencil, Stethoscope, TreePalm } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { ReviewItem } from "../../core/api.ts";
import { parseTypedTime } from "../../core/time.ts";
import { EXCUSES, type Excuse } from "../../core/types.ts";
import { api } from "../api.ts";
import { DayDialog } from "../components/DayDialog.tsx";
import { dayNotes } from "../components/dayText.ts";
import { errorText } from "../errors.ts";
import { clock, date, dayName, monthName, timestamp } from "../format.ts";
import { useLang } from "../i18n/context.ts";
import { paths } from "../router.ts";
import { Alert } from "../ui/Alert.tsx";
import { Button } from "../ui/Button.tsx";
import { Card } from "../ui/Card.tsx";
import { cx } from "../ui/cx.ts";
import { Link } from "../ui/Link.tsx";
import { PageHeader } from "../ui/PageHeader.tsx";
import { Empty, Loading, LoadError } from "../ui/States.tsx";
import { TimeInput } from "../ui/TimeInput.tsx";
import { useApi } from "../useApi.ts";

type Tab = "INCOMPLETE" | "ABSENT";

const keyOf = (i: ReviewItem) => `${i.employee.id}|${i.day.date}`;

/**
 * Every day in the month that needs HR: missing punches and absences, for all employees on
 * one page, oldest day first so it follows the manual register. Enter saves a row and moves on.
 */
export function ReviewPage({ month }: { month: string }) {
  const { t, lang } = useLang();
  const review = useApi(`review:${month}`, () => api.monthReview(month));
  const [tab, setTab] = useState<Tab | null>(() => (new URLSearchParams(location.search).get("tab") === "absent" ? "ABSENT" : null));
  // Rows saved on this visit, with a short summary of what was recorded; they stay in place
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [details, setDetails] = useState<ReviewItem | null>(null);
  const fields = useRef(new Map<string, HTMLElement>());
  const Back = lang === "ar" ? ArrowRight : ArrowLeft;
  const label = monthName(month, lang);

  if (review.error) return <LoadError error={review.error} retry={review.reload} />;
  if (!review.data) return <Loading />;

  const { items, locked } = review.data;
  const counts: Record<Tab, number> = {
    INCOMPLETE: items.filter((i) => i.day.status === "INCOMPLETE").length,
    // Absences still waiting for HR's decision
    ABSENT: items.filter((i) => i.day.status === "ABSENT" && !i.day.absence).length,
  };
  const active: Tab = tab ?? (counts.INCOMPLETE || !counts.ABSENT ? "INCOMPLETE" : "ABSENT");
  const list = items.filter((i) => i.day.status === active);
  const done = list.filter((i) => saved[keyOf(i)] || i.day.absence).length;

  const markSaved = (item: ReviewItem, text: string) => {
    const next = { ...saved, [keyOf(item)]: text };
    setSaved(next);
    // Carry on with the next row that is still open
    const index = list.indexOf(item);
    const following = [...list.slice(index + 1), ...list.slice(0, index)].find((i) => !next[keyOf(i)] && !i.day.absence);
    if (following) fields.current.get(keyOf(following))?.focus();
  };

  const reopen = (item: ReviewItem) => {
    setSaved((s) => {
      const rest = { ...s };
      delete rest[keyOf(item)];
      return rest;
    });
  };

  const rows: ReactNode[] = [];
  let lastDate = "";
  for (const item of list) {
    if (item.day.date !== lastDate) {
      lastDate = item.day.date;
      rows.push(
        <tr key={`date-${lastDate}`} className="bg-slate-50">
          <td colSpan={5} className="py-2 text-xs font-semibold text-slate-700">
            {dayName(item.day.weekday, lang)} <span dir="ltr">{date(item.day.date)}</span>
          </td>
        </tr>,
      );
    }
    const key = keyOf(item);
    rows.push(
      <ReviewRow
        key={key}
        month={month}
        item={item}
        locked={Boolean(locked)}
        savedText={saved[key]}
        register={(el) => {
          if (el) fields.current.set(key, el);
          else fields.current.delete(key);
        }}
        onSaved={(text) => markSaved(item, text)}
        onReopen={() => reopen(item)}
        onDetails={() => setDetails(item)}
      />,
    );
  }

  const backToMonth = (
    <Link href={paths.month(month)}>
      <Button icon={Back}>{t("review.backToMonth", { month: label })}</Button>
    </Link>
  );

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={paths.month(month)} className="inline-flex items-center gap-1 hover:text-teal-700">
            <Back className="size-3.5" />
            {label}
          </Link>
        }
        title={`${t("review.title")} · ${label}`}
        description={locked ? undefined : t("review.subtitle")}
      />

      <div className="flex flex-col gap-4">
        {locked ? <Alert tone="locked">{t("month.lockedBy", { name: locked.lockedBy, date: timestamp(locked.lockedAt) })}</Alert> : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-xs" role="tablist">
            {(["INCOMPLETE", "ABSENT"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={active === k}
                onClick={() => setTab(k)}
                className={cx(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition",
                  active === k ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-100",
                )}
              >
                {t(k === "INCOMPLETE" ? "review.tab.incomplete" : "review.tab.absent")}
                <span className={cx("rounded px-1.5 text-xs", active === k ? "bg-white/20" : "bg-slate-100 text-slate-600")}>{counts[k]}</span>
              </button>
            ))}
          </div>
          {list.length && !locked ? (
            <div className="flex min-w-56 items-center gap-3 text-sm text-slate-600">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${(done / list.length) * 100}%` }} />
              </div>
              <span className={cx("whitespace-nowrap", done === list.length && "font-semibold text-emerald-700")}>
                {done === list.length ? <Check className="me-1 inline size-4" /> : null}
                {t("review.progress", { done, total: list.length })}
              </span>
            </div>
          ) : null}
        </div>

        {active === "ABSENT" && list.length && !locked ? <Alert tone="info">{t("review.absentHint")}</Alert> : null}

        <Card flush>
          {list.length === 0 ? (
            <Empty
              icon={CircleCheck}
              title={t(active === "INCOMPLETE" ? "review.noIncomplete" : "review.noAbsences")}
              action={backToMonth}
            />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>{t("col.name")}</th>
                  <th className="w-32">{t("col.in")}</th>
                  <th className="w-32">{t("col.out")}</th>
                  <th className="w-48">{t("day.excuse")}</th>
                  <th aria-hidden />
                </tr>
              </thead>
              <tbody>{rows}</tbody>
            </table>
          )}
        </Card>

        {list.length ? <div>{backToMonth}</div> : null}
      </div>

      <DayDialog
        employeeId={details?.employee.id ?? ""}
        day={details?.day ?? null}
        onClose={() => setDetails(null)}
        onSaved={() => details && markSaved(details, t("review.saved"))}
      />
    </>
  );
}

interface ReviewRowProps {
  month: string;
  item: ReviewItem;
  locked: boolean;
  savedText: string | undefined;
  register: (el: HTMLElement | null) => void;
  onSaved: (text: string) => void;
  onReopen: () => void;
  onDetails: () => void;
}

function ReviewRow({ month, item, locked, savedText, register, onSaved, onReopen, onDetails }: ReviewRowProps) {
  const { t } = useLang();
  const { day, employee } = item;
  const needIn = !day.inTime;
  const needOut = !day.outTime;
  const [inTime, setInTime] = useState("");
  const [outTime, setOutTime] = useState("");
  const [excuse, setExcuse] = useState<Excuse | "">("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Changing an absence decided on an earlier visit
  const [changing, setChanging] = useState(false);
  const notes = dayNotes(day, t);

  const save = async (withExcuse?: Excuse) => {
    const chosen = withExcuse ?? excuse;
    const typedIn = needIn ? parseTypedTime(inTime) : "";
    const typedOut = needOut ? parseTypedTime(outTime, typedIn || day.inTime) : "";
    if (typedIn === null || typedOut === null) return setError(t("review.badTime"));
    const complete = (!needIn || typedIn) && (!needOut || typedOut);
    if (!chosen && !complete) return setError(t("review.needInput"));

    setBusy(true);
    setError("");
    try {
      await api.saveDay(employee.id, day.date, {
        inTime: needIn ? typedIn || null : day.inManual ? clock(day.inTime) : null,
        outTime: needOut ? typedOut || null : day.outManual ? clock(day.outTime) : null,
        excuse: chosen || null,
        note: day.note,
      });
      onSaved(chosen ? t(`excuse.${chosen}`) : `${typedIn || clock(day.inTime)} – ${typedOut || clock(day.outTime)}`);
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  const onEnter = (e: KeyboardEvent) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    void save();
  };

  const timeCell = (need: boolean, value: string, setValue: (v: string) => void, current: string | null, first: boolean, after?: string | null) =>
    need && !locked ? (
      <TimeInput value={value} onChange={setValue} after={after} onKeyDown={onEnter} ref={first ? register : undefined} className="w-24" />
    ) : (
      <span dir="ltr" className={cx("tabular-nums", current ? "text-slate-700" : "text-slate-400")}>
        {clock(current)}
      </span>
    );

  const firstIsExcuse = (!needIn && !needOut) || locked;

  const nameCell = (
    <td>
      <Link href={paths.employeeMonth(month, employee.id)} className="font-medium text-slate-900 hover:text-teal-700">
        {employee.name}
      </Link>
      <div className="text-xs text-slate-500">
        <span dir="ltr">{employee.id}</span>
        {notes.length ? <span> · {notes.join(" · ")}</span> : null}
      </div>
      {error ? <div className="mt-1 text-xs font-medium text-red-700">{error}</div> : null}
    </td>
  );

  // An absence: HR decides sick leave, annual leave, or a deduction from the salary
  const decide = async (decision: "sick" | "annual" | "salary") => {
    setBusy(true);
    setError("");
    try {
      await api.saveDay(employee.id, day.date, {
        inTime: null,
        outTime: null,
        excuse: decision === "salary" ? null : decision,
        absence: decision === "salary" ? "salary" : null,
        note: day.note,
      });
      onSaved(t(decision === "sick" ? "absence.decideSick" : decision === "annual" ? "absence.decideAnnual" : "absence.decideSalary"));
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  if (day.status === "ABSENT") {
    const decided = savedText ?? (day.absence === "salary" && !changing ? t("absence.decideSalary") : undefined);
    return (
      <tr className={cx(decided && "bg-emerald-50/60")}>
        {nameCell}
        <td colSpan={3}>
          {decided ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-800">
              <CircleCheck className="size-4" />
              {decided}
            </span>
          ) : locked ? (
            <span className="text-slate-500">{t("absence.pending")}</span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" icon={Stethoscope} disabled={busy} ref={register} onClick={() => void decide("sick")}>
                {t("absence.decideSick")}
              </Button>
              <Button size="sm" icon={TreePalm} disabled={busy} onClick={() => void decide("annual")}>
                {t("absence.decideAnnual")}
              </Button>
              <Button size="sm" icon={Banknote} disabled={busy} onClick={() => void decide("salary")}>
                {t("absence.decideSalary")}
              </Button>
            </div>
          )}
        </td>
        <td>
          {locked ? null : (
            <div className="flex justify-end">
              {decided ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Pencil}
                  onClick={() => {
                    setChanging(true);
                    onReopen();
                  }}
                >
                  {t("review.undo")}
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={onDetails}>
                  {t("review.more")}
                </Button>
              )}
            </div>
          )}
        </td>
      </tr>
    );
  }

  return (
    <tr className={cx(savedText && "bg-emerald-50/60")}>
      {nameCell}

      {savedText ? (
        <td colSpan={3}>
          <span className="inline-flex items-center gap-1.5 font-medium text-emerald-800">
            <CircleCheck className="size-4" />
            {t("review.saved")}: <span dir="auto">{savedText}</span>
          </span>
        </td>
      ) : (
        <>
          <td>{timeCell(needIn, inTime, setInTime, day.inTime, needIn)}</td>
          <td>{timeCell(needOut, outTime, setOutTime, day.outTime, !needIn && needOut, parseTypedTime(inTime) || day.inTime)}</td>
          <td>
            {locked ? null : (
              <select
                className="input"
                value={excuse}
                onChange={(e) => setExcuse(e.target.value as Excuse | "")}
                onKeyDown={onEnter}
                ref={firstIsExcuse ? register : undefined}
              >
                <option value="">{t("day.noExcuse")}</option>
                {EXCUSES.map((x) => (
                  <option key={x} value={x}>
                    {t(`excuse.${x}`)}
                  </option>
                ))}
              </select>
            )}
          </td>
        </>
      )}

      <td>
        {locked ? null : savedText ? (
          <div className="flex justify-end">
            <Button size="sm" variant="ghost" icon={Pencil} onClick={onReopen}>
              {t("review.undo")}
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-1">
            <Button size="sm" variant="primary" icon={Check} loading={busy} onClick={() => void save()}>
              {t("common.save")}
            </Button>
            <Button size="sm" variant="ghost" icon={Stethoscope} disabled={busy} onClick={() => void save("sick")}>
              {t("emp.sick")}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDetails}>
              {t("review.more")}
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}
