import type { DayResult, DayStatus } from "../../core/types.ts";
import type { Translate } from "../i18n/context.ts";
import type { Tone } from "../ui/Badge.tsx";

export const STATUS_TONE: Record<DayStatus, Tone> = {
  OK: "success",
  SHORT: "warning",
  ABSENT: "danger",
  INCOMPLETE: "violet",
  IN_PROGRESS: "info",
  EXCUSED: "teal",
  HOLIDAY: "neutral",
  NO_DATA: "neutral",
};

/** The status in words; for excused days the excuse itself (e.g. "Sick leave"). */
export function statusText(d: DayResult, t: Translate): string {
  if (d.status === "EXCUSED" && d.excuse) return t(`excuse.${d.excuse}`);
  if (d.status === "ABSENT" && d.absence === "salary") return t("absence.salary");
  return t(`status.${d.status}`);
}

/** Everything worth telling HR about a day, in reading order. */
export function dayNotes(d: DayResult, t: Translate): string[] {
  const parts: string[] = [];
  if (d.status === "INCOMPLETE" && d.reason) parts.push(t(`reason.${d.reason}`));
  if (d.status === "HOLIDAY" && d.holidayName) parts.push(d.holidayName);
  for (const n of d.notes) parts.push(t(`note.${n.code}`, { n: n.n ?? "", at: n.at ?? "" }));
  if (d.inManual || d.outManual) parts.push(t("note.manual"));
  if (d.note) parts.push(`«${d.note}»`);
  return parts;
}

/** Days that need a second look: everything except complete, holiday and no-data days. */
export function isException(d: DayResult): boolean {
  return !["OK", "HOLIDAY", "NO_DATA", "IN_PROGRESS"].includes(d.status) || d.inManual || d.outManual;
}
