import { Pencil, Stethoscope } from "lucide-react";
import type { ReactNode } from "react";
import type { DayResult, DayStatus } from "../../core/types.ts";
import { clock, dayName, duration, shortDate, signedDuration } from "../format.ts";
import { useLang } from "../i18n/context.ts";
import { Button } from "../ui/Button.tsx";
import { cx } from "../ui/cx.ts";
import { dayNotes } from "./dayText.ts";
import { StatusBadge } from "./StatusBadge.tsx";

const ROW_TINT: Partial<Record<DayStatus, string>> = {
  SHORT: "bg-amber-50/50",
  ABSENT: "bg-red-50/60",
  INCOMPLETE: "bg-violet-50/60",
  EXCUSED: "bg-teal-50/40",
  HOLIDAY: "bg-slate-50 text-slate-500",
  IN_PROGRESS: "bg-sky-50/50",
};

export interface DaysTableProps {
  days: DayResult[];
  hours: boolean;
  editable: boolean;
  /** Missing in months locked before it was counted. */
  requiredMin: number | undefined;
  onEdit: (d: DayResult) => void;
  onToggleSick: (d: DayResult) => void;
}

/** A month's days, one row each, with the month's total under them. */
export function DaysTable({ days, hours, editable, requiredMin, onEdit, onToggleSick }: DaysTableProps) {
  const { t, lang } = useLang();
  const columns = (hours ? 8 : 9) + (editable ? 1 : 0);
  const rows: ReactNode[] = [];

  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    // Fold a run of days without data into one line
    if (d.status === "NO_DATA") {
      let j = i;
      while (j + 1 < days.length && days[j + 1].status === "NO_DATA") j++;
      rows.push(
        <tr key={d.date} className="bg-slate-50/70">
          <td colSpan={columns} className="text-center text-xs text-slate-500">
            {t("emp.noDataRange", { from: shortDate(d.date), to: shortDate(days[j].date) })}
          </td>
        </tr>,
      );
      i = j;
      continue;
    }

    const counted = d.status === "OK" || d.status === "SHORT";
    const notes = dayNotes(d, t);
    const sickable = d.status === "ABSENT" || d.status === "INCOMPLETE" || d.excuse === "sick";
    rows.push(
      <tr key={d.date} className={ROW_TINT[d.status]}>
        <td>
          <div className="font-medium text-slate-900">{dayName(d.weekday, lang)}</div>
          <div className="text-xs text-slate-500" dir="ltr">
            {shortDate(d.date)}
          </div>
        </td>
        <td dir="ltr" className={cx("text-start", d.inManual && "font-semibold text-teal-800 underline decoration-dotted")} title={d.inManual ? t("note.manual") : undefined}>
          {clock(d.inTime)}
        </td>
        <td dir="ltr" className={cx("text-start", d.outManual && "font-semibold text-teal-800 underline decoration-dotted")} title={d.outManual ? t("note.manual") : undefined}>
          {clock(d.outTime)}
        </td>
        <td dir="ltr" className="text-start">
          {counted ? duration(d.workedMin) : "–"}
        </td>
        <td dir="ltr" className={cx("text-start font-medium", counted && (d.diffMin ?? 0) > 0 && "text-emerald-700", counted && (d.diffMin ?? 0) < 0 && "text-red-700")}>
          {counted ? signedDuration(d.diffMin) : "–"}
        </td>
        {hours ? (
          <td dir="ltr" className="text-start">
            {d.shortfallMin ? duration(d.shortfallMin) : "–"}
          </td>
        ) : (
          <>
            <td dir="ltr" className={cx("text-start", d.lateMin > 0 && "font-medium text-amber-800")}>
              {d.lateMin ? duration(d.lateMin) : "–"}
            </td>
            <td dir="ltr" className={cx("text-start", d.earlyMin > 0 && "font-medium text-amber-800")}>
              {d.earlyMin ? duration(d.earlyMin) : "–"}
            </td>
          </>
        )}
        <td>
          <StatusBadge day={d} />
        </td>
        <td className="max-w-72 text-xs whitespace-normal text-slate-500">{notes.join(" · ")}</td>
        {editable ? (
          <td>
            {d.status !== "HOLIDAY" ? (
              <div className="flex items-center justify-end gap-1">
                {sickable ? (
                  <Button size="sm" variant="ghost" icon={Stethoscope} onClick={() => onToggleSick(d)}>
                    {d.excuse === "sick" ? t("emp.unsick") : t("emp.sick")}
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" icon={Pencil} onClick={() => onEdit(d)} aria-label={t("common.edit")} />
              </div>
            ) : null}
          </td>
        ) : null}
      </tr>,
    );
  }

  return (
    <table className="table">
      <thead>
        <tr>
          <th>{t("col.date")}</th>
          <th>{t("col.in")}</th>
          <th>{t("col.out")}</th>
          <th>{t("col.worked")}</th>
          <th>{t("col.diff")}</th>
          {hours ? (
            <th>{t("col.shortfall")}</th>
          ) : (
            <>
              <th>{t("col.late")}</th>
              <th>{t("col.early")}</th>
            </>
          )}
          <th>{t("col.status")}</th>
          <th>{t("col.notes")}</th>
          {editable ? <th aria-hidden /> : null}
        </tr>
      </thead>
      <tbody>{rows}</tbody>
      <DaysTotal days={days} hours={hours} columns={columns} requiredMin={requiredMin} />
    </table>
  );
}

/** The month's totals under the days: hours worked against required, the difference, lateness. */
function DaysTotal({ days, hours, columns, requiredMin }: { days: DayResult[]; hours: boolean; columns: number; requiredMin: number | undefined }) {
  const { t } = useLang();
  const counted = days.filter((d) => d.status === "OK" || d.status === "SHORT");
  const sum = (pick: (d: DayResult) => number | null) => counted.reduce((n, d) => n + (pick(d) ?? 0), 0);
  const diff = sum((d) => d.diffMin);
  return (
    <tfoot>
      <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
        <td colSpan={3}>{t("common.total")}</td>
        <td dir="ltr" className="text-start">
          {duration(sum((d) => d.workedMin))}
        </td>
        <td dir="ltr" className={cx("text-start", diff > 0 && "text-emerald-700", diff < 0 && "text-red-700")}>
          {signedDuration(diff)}
        </td>
        {hours ? (
          <td dir="ltr" className="text-start">
            {duration(sum((d) => d.shortfallMin))}
          </td>
        ) : (
          <>
            <td dir="ltr" className="text-start">
              {duration(sum((d) => d.lateMin))}
            </td>
            <td dir="ltr" className="text-start">
              {duration(sum((d) => d.earlyMin))}
            </td>
          </>
        )}
        <td colSpan={columns - (hours ? 6 : 7)} className="text-xs font-normal text-slate-500">
          {requiredMin === undefined ? null : t("stat.ofRequired", { required: duration(requiredMin) })}
        </td>
      </tr>
    </tfoot>
  );
}
