// Date and time helpers. Dates are "YYYY-MM-DD" strings and are handled in UTC
// so the result never depends on the computer's time zone.

/** "07:15" or "07:15:30" -> 435 (seconds are dropped); null if it is not a time. */
export function hmToMin(hm: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hm ?? "").trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 435 -> "07:15" */
export function minToHm(min: number): string {
  const h = Math.floor(min / 60);
  return String(h).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");
}

/**
 * A time as HR types it: "715", "0715", "7:15", "7.15", "7" or with Arabic digits, all
 * become "07:15" (or "07:00"). Returns "" for an empty box and null when it is not a time.
 * With `after` (e.g. the IN time when typing the OUT time), a morning time before it is
 * read as the afternoon: "230" after "06:54" is "14:30".
 */
export function parseTypedTime(text: string, after?: string | null): string | null {
  const s = text
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  if (!s) return "";

  let h: number;
  let m: number;
  const parts = /^(\d{1,2})\s*[:.,٫؛;\- ]\s*(\d{1,2})$/.exec(s);
  if (parts) {
    h = Number(parts[1]);
    m = Number(parts[2]);
  } else if (/^\d{1,4}$/.test(s)) {
    h = s.length <= 2 ? Number(s) : Number(s.slice(0, -2));
    m = s.length <= 2 ? 0 : Number(s.slice(-2));
  } else {
    return null;
  }
  if (h > 23 || m > 59) return null;

  const start = hmToMin(after);
  if (start !== null && h < 12 && h * 60 + m < start && (h + 12) * 60 + m > start) h += 12;
  return minToHm(h * 60 + m);
}

function toUtc(date: string): Date {
  return new Date(date + "T00:00:00Z");
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** A real calendar date: 2026-02-31 is rejected rather than rolled over into March. */
export function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = toUtc(value);
  return !Number.isNaN(d.getTime()) && fromUtc(d) === value;
}

/** 0 = Sunday … 6 = Saturday */
export function weekdayOf(date: string): number {
  return toUtc(date).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function firstDayOfMonth(month: string): string {
  return month + "-01";
}

export function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return fromUtc(new Date(Date.UTC(y, m, 0)));
}

/** Months touched by a date range, oldest first. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = monthOf(from); m <= monthOf(to); m = monthOf(addDays(lastDayOfMonth(m), 1))) out.push(m);
  return out;
}

/** Today's date on this computer's clock. */
export function localToday(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
}

export function inRanges(date: string, ranges: { from: string; to: string }[]): boolean {
  return ranges.some((r) => date >= r.from && date <= r.to);
}
