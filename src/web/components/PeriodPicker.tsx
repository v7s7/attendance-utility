import { ChevronLeft, ChevronRight } from "lucide-react";
import { monthName } from "../format.ts";
import { useLang } from "../i18n/context.ts";
import { cx } from "../ui/cx.ts";

interface PeriodPickerProps {
  /** Months that have data, newest first. */
  months: string[];
  from: string;
  to: string;
  /** Several months, or one. */
  multi: boolean;
  onMonth: (month: string) => void;
  onPeriod: (from: string, to: string) => void;
}

const selectClass = "h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm font-medium text-slate-800 shadow-xs outline-none focus:border-teal-600";

/** One month with arrows, or a period from one month to another, with quick picks. */
export function PeriodPicker({ months, from, to, multi, onMonth, onPeriod }: PeriodPickerProps) {
  const { t, lang } = useLang();
  const [Prev, Next] = lang === "ar" ? [ChevronRight, ChevronLeft] : [ChevronLeft, ChevronRight];
  // The months on offer, newest first, always including the ones shown
  const options = [...new Set([...months, from, to])].sort().reverse();
  const index = options.indexOf(to);
  const older = options[index + 1];
  const newer = index > 0 ? options[index - 1] : undefined;
  const thisYear = options.filter((m) => m.startsWith(to.slice(0, 4))).at(-1) ?? to;

  const option = (m: string) => (
    <option key={m} value={m}>
      {monthName(m, lang)}
    </option>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-xs" role="tablist">
        {[false, true].map((several) => (
          <button
            key={String(several)}
            type="button"
            role="tab"
            aria-selected={multi === several}
            onClick={() => {
              if (several === multi) return;
              // One month becomes its last three; several become the last of them
              if (several) onPeriod(options[Math.min(index + 2, options.length - 1)], to);
              else onMonth(to);
            }}
            className={cx(
              "rounded-md px-2.5 py-1.5 text-sm font-medium transition",
              multi === several ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
            )}
          >
            {t(several ? "period.months" : "period.month")}
          </button>
        ))}
      </div>

      {multi ? (
        <>
          <span className="text-sm text-slate-500">{t("common.from")}</span>
          <select aria-label={t("common.from")} className={selectClass} value={from} onChange={(e) => onPeriod(e.target.value, e.target.value > to ? e.target.value : to)}>
            {options.map(option)}
          </select>
          <span className="text-sm text-slate-500">{t("common.to")}</span>
          <select aria-label={t("common.to")} className={selectClass} value={to} onChange={(e) => onPeriod(e.target.value < from ? e.target.value : from, e.target.value)}>
            {options.map(option)}
          </select>
          <button type="button" className="text-sm font-medium text-teal-700 hover:underline" onClick={() => onPeriod(thisYear, to)}>
            {t("period.thisYear")}
          </button>
          <button type="button" className="text-sm font-medium text-teal-700 hover:underline" onClick={() => onPeriod(options.at(-1) ?? from, options[0] ?? to)}>
            {t("period.all")}
          </button>
        </>
      ) : (
        <div className="flex items-center rounded-lg border border-slate-300 bg-white shadow-xs">
          <button
            type="button"
            title={t("emp.prevMonth")}
            disabled={!older}
            onClick={() => older && onMonth(older)}
            className="flex size-9 items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-30"
          >
            <Prev className="size-4" />
          </button>
          <select
            aria-label={t("col.month")}
            className="h-9 border-x border-slate-200 bg-white px-2 text-sm font-medium text-slate-800 outline-none"
            value={to}
            onChange={(e) => onMonth(e.target.value)}
          >
            {options.map(option)}
          </select>
          <button
            type="button"
            title={t("emp.nextMonth")}
            disabled={!newer}
            onClick={() => newer && onMonth(newer)}
            className="flex size-9 items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-30"
          >
            <Next className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
