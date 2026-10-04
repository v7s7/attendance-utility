import { CalendarOff, CalendarPlus, Plus, Trash } from "lucide-react";
import { useState } from "react";
import { addDays, localToday, weekdayOf } from "../../core/time.ts";
import type { Holiday } from "../../core/types.ts";
import { api } from "../api.ts";
import { HolidayDialog } from "../components/HolidayDialog.tsx";
import { errorText } from "../errors.ts";
import { date, dayName } from "../format.ts";
import { useLang, type Translate } from "../i18n/context.ts";
import { Alert } from "../ui/Alert.tsx";
import { Button } from "../ui/Button.tsx";
import { Card } from "../ui/Card.tsx";
import { cx } from "../ui/cx.ts";
import { PageHeader } from "../ui/PageHeader.tsx";
import { Empty, Loading, LoadError } from "../ui/States.tsx";
import { useApi } from "../useApi.ts";

interface HolidayRange {
  name: string;
  from: string;
  to: string;
  days: number;
}

/** Consecutive days with the same name are one holiday, e.g. the three days of Eid. */
function groupHolidays(holidays: Holiday[]): HolidayRange[] {
  const ranges: HolidayRange[] = [];
  for (const h of holidays) {
    const last = ranges.at(-1);
    if (last && last.name === h.name && addDays(last.to, 1) === h.date) {
      last.to = h.date;
      last.days++;
    } else {
      ranges.push({ name: h.name, from: h.date, to: h.date, days: 1 });
    }
  }
  return ranges;
}

/** Bahrain's public holidays on fixed dates; the Islamic ones move and are added when announced. */
function fixedHolidays(year: number, t: Translate): Omit<HolidayRange, "days">[] {
  return [
    { name: t("holidays.newYear"), from: `${year}-01-01`, to: `${year}-01-01` },
    { name: t("holidays.labourDay"), from: `${year}-05-01`, to: `${year}-05-01` },
    { name: t("holidays.nationalDay"), from: `${year}-12-16`, to: `${year}-12-17` },
  ];
}

export function HolidaysPage() {
  const { t, lang } = useLang();
  const holidays = useApi("holidays", api.holidays);
  const thisYear = Number(localToday().slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [adding, setAdding] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setMessage(null);
    try {
      setMessage({ tone: "success", text: await action() });
    } catch (e) {
      setMessage({ tone: "danger", text: errorText(t, e) });
    } finally {
      setBusy(false);
      holidays.reload();
    }
  };

  const rangeText = (r: Omit<HolidayRange, "days">) =>
    r.from === r.to
      ? `${dayName(weekdayOf(r.from), lang)} ${date(r.from)}`
      : `${dayName(weekdayOf(r.from), lang)} ${date(r.from)} – ${dayName(weekdayOf(r.to), lang)} ${date(r.to)}`;

  if (holidays.error) return <LoadError error={holidays.error} retry={holidays.reload} />;
  if (!holidays.data) return <Loading />;

  const all = holidays.data;
  const years = [...new Set([thisYear, thisYear + 1, ...all.map((h) => Number(h.date.slice(0, 4)))])].sort();
  const ranges = groupHolidays(all.filter((h) => h.date.startsWith(`${year}-`)));
  const set = new Set(all.map((h) => h.date));
  const missingFixed = fixedHolidays(year, t).filter((f) => !set.has(f.from) || !set.has(f.to));

  const addFixed = () =>
    run(async () => {
      let days = 0;
      for (const f of missingFixed) days += (await api.addHoliday(f)).days;
      return t("holidays.added", { n: days });
    });

  const remove = (r: HolidayRange) => {
    if (!window.confirm(t("holidays.deleteConfirm", { name: r.name, range: rangeText(r) }))) return;
    void run(async () => {
      await api.deleteHolidays(r.from, r.to);
      return t("common.saved");
    });
  };

  return (
    <>
      <PageHeader
        title={t("holidays.title")}
        description={t("holidays.subtitle")}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setAdding("")}>
            {t("holidays.add")}
          </Button>
        }
      />

      <div className="flex flex-col gap-5">
        {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}

        <div className="inline-flex self-start rounded-lg border border-slate-200 bg-white p-1 shadow-xs">
          {years.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setYear(y)}
              className={cx(
                "rounded-md px-3 py-1.5 text-sm font-medium transition",
                y === year ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {y}
            </button>
          ))}
        </div>

        <Card flush>
          {ranges.length === 0 ? (
            <Empty icon={CalendarOff} title={t("holidays.empty", { year })} />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>{t("holidays.name")}</th>
                  <th>{t("col.date")}</th>
                  <th>{t("emp.days")}</th>
                  <th aria-hidden />
                </tr>
              </thead>
              <tbody>
                {ranges.map((r) => (
                  <tr key={r.from}>
                    <td className="font-medium text-slate-900">{r.name}</td>
                    <td className="text-slate-700">{rangeText(r)}</td>
                    <td>{t("common.days", { n: r.days })}</td>
                    <td>
                      <div className="flex justify-end">
                        <Button size="sm" variant="ghost" icon={Trash} disabled={busy} onClick={() => remove(r)}>
                          {t("common.delete")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-sm leading-relaxed text-slate-600">{t("holidays.fixedHint")}</p>
            {missingFixed.length ? (
              <Button icon={CalendarPlus} loading={busy} onClick={() => void addFixed()}>
                {t("holidays.fixed", { year })}
              </Button>
            ) : (
              <span className="text-sm font-medium text-emerald-700">{t("holidays.fixedDone", { year })}</span>
            )}
          </div>
        </Card>
      </div>

      <HolidayDialog
        from={adding}
        onClose={() => setAdding(null)}
        onSaved={(n) => {
          setMessage({ tone: "success", text: t("holidays.added", { n }) });
          holidays.reload();
        }}
      />
    </>
  );
}
