import type { Lang } from "./i18n/context.ts";

const DAY_NAMES = {
  ar: ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

const MONTH_NAMES = {
  ar: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

/** Minutes as hours:minutes, the way HR reads durations: 435 -> "7:15", 30 -> "0:30" */
export function duration(min: number | null | undefined): string {
  if (min === null || min === undefined) return "–";
  const abs = Math.abs(Math.round(min));
  return (min < 0 ? "−" : "") + Math.floor(abs / 60) + ":" + String(abs % 60).padStart(2, "0");
}

/** Worked minus required with a sign: +0:20 / −0:30 */
export function signedDuration(min: number | null | undefined): string {
  if (min === null || min === undefined) return "–";
  if (min === 0) return "0:00";
  return (min > 0 ? "+" : "") + duration(min);
}

/** Minutes as decimal hours: 135 -> "2.25" */
export function decimalHours(min: number): string {
  return (min / 60).toFixed(2);
}

/** Fils as BHD with three decimals: 3151 -> "3.151" */
export function bhd(fils: number | null | undefined): string {
  return fils === null || fils === undefined ? "–" : (fils / 1000).toFixed(3);
}

export function rate(value: number | null | undefined): string {
  return value === null || value === undefined ? "–" : value.toFixed(3);
}

/** "08:00:45" -> "08:00" */
export function clock(time: string | null | undefined): string {
  return time ? time.slice(0, 5) : "–";
}

/** "2026-09-13" -> "13/09/2026" */
export function date(value: string): string {
  const [y, m, d] = value.split("-");
  return `${d}/${m}/${y}`;
}

/** "2026-09-13" -> "13/09" */
export function shortDate(value: string): string {
  return value.slice(8, 10) + "/" + value.slice(5, 7);
}

export function dayName(weekday: number, lang: Lang): string {
  return DAY_NAMES[lang][weekday];
}

export function monthName(month: string, lang: Lang): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_NAMES[lang][m - 1]} ${y}`;
}

/** A UTC timestamp from the server ("2026-10-04 08:20:00") in local time: "04/10/2026 11:20" */
export function timestamp(value: string): string {
  const d = new Date(value.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The month before or after: shiftMonth("2026-01", -1) -> "2025-12" */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}
