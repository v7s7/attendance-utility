import { hmToMin, minToHm } from "../../core/time.ts";
import type { Schedule } from "../../core/types.ts";
import { dayName, duration } from "../format.ts";
import type { Lang, Translate } from "../i18n/context.ts";

/**
 * A schedule in words, one line per run of weekdays with the same hours, e.g.
 * "Sunday – Wednesday: arrive 07:00–08:00 · leave 14:15–15:15 · 7:15 required".
 */
export function scheduleLines(schedule: Schedule, t: Translate, lang: Lang): string[] {
  const start = hmToMin(schedule.start) ?? 0;
  const latest = Math.max(start, hmToMin(schedule.latestStart) ?? start);
  const range = (from: number, to: number) =>
    from === to ? minToHm(from) : t("schedule.range", { from: minToHm(from), to: minToHm(to) });

  const runs: { from: number; to: number; hours: string }[] = [];
  schedule.hours.forEach((h, day) => {
    if (h === null) return;
    const last = runs.at(-1);
    if (last && last.hours === h && last.to === day - 1) last.to = day;
    else runs.push({ from: day, to: day, hours: h });
  });

  return runs.map((r) => {
    const req = hmToMin(r.hours) ?? 0;
    const day = r.from === r.to ? dayName(r.from, lang) : `${dayName(r.from, lang)} – ${dayName(r.to, lang)}`;
    // Approved months saved before November 2026 may say "flexible", which counts as fixed
    return t(schedule.kind === "hours" ? "schedule.preview.hours" : "schedule.preview.fixed", {
      day,
      arrive: range(start, latest),
      leave: range(Math.min(start + req, 24 * 60 - 1), Math.min(latest + req, 24 * 60 - 1)),
      req: duration(req),
    });
  });
}
