import { DAY_NAMES, MONTH_NAMES, translate } from "../i18n.js";

// 135 -> "2h 15m" (or "2س 15د")
export function formatDuration(min, lang) {
  if (min === null || min === undefined) return "-";
  const sign = min < 0 ? "-" : "";
  const abs = Math.abs(min);
  const mm = String(abs % 60).padStart(2, "0");
  return sign + Math.floor(abs / 60) + translate(lang, "unit.h") + " " + mm + translate(lang, "unit.m");
}

// 135 -> "2.25"
export function formatHours(min) {
  return (min / 60).toFixed(2);
}

export function formatBhd(fils, lang) {
  if (fils === null || fils === undefined) return "-";
  return (fils / 1000).toFixed(3) + " " + translate(lang, "unit.bhd");
}

export function formatRate(rate) {
  return rate === null || rate === undefined ? "-" : rate.toFixed(3);
}

export function monthLabel(month, lang) {
  const [y, m] = month.split("-").map(Number);
  return (MONTH_NAMES[lang] || MONTH_NAMES.en)[m - 1] + " " + y;
}

export function dayLabel(weekdayIndex, lang) {
  return (DAY_NAMES[lang] || DAY_NAMES.en)[weekdayIndex];
}

// "08:00:45" -> "08:00"
export function shortTime(t) {
  return t ? t.slice(0, 5) : "-";
}
