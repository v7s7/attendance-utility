import type { Note } from "./types.ts";

const pad2 = (n: number) => String(n).padStart(2, "0");

export function secToHms(sec: number): string {
  return pad2(Math.floor(sec / 3600)) + ":" + pad2(Math.floor((sec % 3600) / 60)) + ":" + pad2(sec % 60);
}

/** "7:05", "07:05:09", "2:15 PM" -> seconds since midnight, or null if it is not a time. */
export function parseTime(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/.exec(text.trim());
  if (!m) return null;

  let h = Number(m[1]);
  const min = Number(m[2]);
  const sec = Number(m[3] ?? 0);
  const ampm = m[4]?.toUpperCase();

  if (ampm) {
    if (h < 1 || h > 12) return null;
    if (ampm === "AM" && h === 12) h = 0;
    if (ampm === "PM" && h !== 12) h += 12;
  }
  if (h > 23 || min > 59 || sec > 59) return null;
  return h * 3600 + min * 60 + sec;
}

/** A Time cell like "06:54:33;14:01:18" -> normalised "HH:MM:SS" times, plus anything unreadable. */
export function parsePunchCell(cell: string | null | undefined): { times: string[]; invalid: string[] } {
  const times: string[] = [];
  const invalid: string[] = [];

  for (const part of String(cell ?? "").split(/[;,|\n]/)) {
    const s = part.trim();
    if (!s) continue;
    const sec = parseTime(s);
    if (sec === null) invalid.push(s);
    else times.push(secToHms(sec));
  }
  return { times, invalid };
}

export interface ResolveOptions {
  /** Taps this close to the first tap of a burst are the same punch. */
  duplicateWindowSec: number;
  /** A lone punch before this is IN, after it OUT. */
  middaySec: number;
}

/**
 * Choose IN and OUT from all of a day's punches. Every guess is reported in
 * `notes` so HR can check it.
 */
export function resolveInOut(
  times: string[],
  { duplicateWindowSec, middaySec }: ResolveOptions,
): { inTime: string | null; outTime: string | null; notes: Note[] } {
  const notes: Note[] = [];
  const secs = times.map((t) => parseTime(t)).filter((s): s is number => s !== null);
  const sorted = [...secs].sort((a, b) => a - b);
  if (sorted.some((s, i) => s !== secs[i])) notes.push({ code: "unsorted" });

  const bursts: { first: number; last: number }[] = [];
  for (const s of sorted) {
    const last = bursts.at(-1);
    if (last && s - last.first <= duplicateWindowSec) last.last = s;
    else bursts.push({ first: s, last: s });
  }

  const extra = sorted.length - bursts.length;
  if (extra > 0) notes.push({ code: "duplicates", n: extra });
  if (bursts.length === 0) return { inTime: null, outTime: null, notes };

  const at = secToHms(middaySec).slice(0, 5);

  if (bursts.length === 1) {
    const only = bursts[0];
    if (only.first < middaySec) {
      notes.push({ code: "singleIn", at });
      return { inTime: secToHms(only.first), outTime: null, notes };
    }
    notes.push({ code: "singleOut", at });
    return { inTime: null, outTime: secToHms(only.last), notes };
  }

  if (bursts.length > 2) notes.push({ code: "multi", n: bursts.length });

  const inSec = bursts[0].first;
  const outSec = bursts[bursts.length - 1].last;
  if (inSec >= middaySec) notes.push({ code: "inAfterMidday", at });
  if (outSec < middaySec) notes.push({ code: "outBeforeMidday", at });

  return { inTime: secToHms(inSec), outTime: secToHms(outSec), notes };
}
