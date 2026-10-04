import type { DayResult } from "../../core/types.ts";

export interface DayRange {
  key: string;
  from: string;
  to: string;
  count: number;
}

/**
 * Group consecutive days that share a key (e.g. "annual leave") into ranges.
 * Days for which `keyOf` returns null break a range. Weekends are not in the
 * list, so Thursday and the next Sunday still count as consecutive.
 */
export function groupRanges(days: DayResult[], keyOf: (d: DayResult) => string | null): DayRange[] {
  const out: DayRange[] = [];
  let previousKey: string | null = null;
  for (const d of days) {
    const key = keyOf(d);
    const last = out.at(-1);
    if (key !== null && key === previousKey && last) {
      last.to = d.date;
      last.count++;
    } else if (key !== null) {
      out.push({ key, from: d.date, to: d.date, count: 1 });
    }
    previousKey = key;
  }
  return out;
}

/** Table styles for print: thin black lines, no colour. */
export const printTable = "w-full border-collapse text-[10.5px] [&_td]:border [&_td]:border-slate-400 [&_td]:px-1.5 [&_td]:py-[3px] [&_th]:border [&_th]:border-slate-500 [&_th]:bg-slate-100 [&_th]:px-1.5 [&_th]:py-1 [&_th]:text-start [&_th]:font-semibold";
