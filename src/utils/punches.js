function pad2(n) {
  return String(n).padStart(2, "0");
}

export function secToHms(sec) {
  return pad2(Math.floor(sec / 3600)) + ":" + pad2(Math.floor((sec % 3600) / 60)) + ":" + pad2(sec % 60);
}

// "7:05", "07:05:09", "2:15 PM" -> seconds since midnight, or null if it is not a time
function parseTime(text) {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/.exec(text);
  if (!m) return null;

  let h = Number(m[1]);
  const min = Number(m[2]);
  const sec = Number(m[3] || 0);
  const ampm = m[4] ? m[4].toUpperCase() : "";

  if (ampm) {
    if (h < 1 || h > 12) return null;
    if (ampm === "AM" && h === 12) h = 0;
    if (ampm === "PM" && h !== 12) h += 12;
  }
  if (h > 23 || min > 59 || sec > 59) return null;
  return h * 3600 + min * 60 + sec;
}

// "06:54:33;14:01:18" -> { times: [seconds...], invalid: number of unreadable entries }
export function parsePunchCell(cell) {
  const times = [];
  let invalid = 0;

  for (const part of String(cell ?? "").split(/[;,|\n]/)) {
    const s = part.trim();
    if (!s) continue;
    const sec = parseTime(s);
    if (sec === null) invalid++;
    else times.push(sec);
  }
  return { times, invalid };
}

// Choose IN and OUT from all of a day's punches. Every guess is reported in `notes`
// (as { code, ... } so the UI can translate it) so HR can check it.
//   duplicateWindowSec: taps this close to the first tap of a burst are one punch
//   middaySec: a lone punch before this is IN, after it is OUT
export function resolveInOut(times, { duplicateWindowSec, middaySec }) {
  const notes = [];
  const sorted = [...times].sort((a, b) => a - b);
  if (sorted.some((t, i) => t !== times[i])) notes.push({ code: "unsorted" });

  const bursts = [];
  for (const t of sorted) {
    const last = bursts[bursts.length - 1];
    if (last && t - last.first <= duplicateWindowSec) last.last = t;
    else bursts.push({ first: t, last: t });
  }

  const extra = sorted.length - bursts.length;
  if (extra > 0) notes.push({ code: "duplicates", n: extra });

  if (bursts.length === 0) return { inTime: null, outTime: null, notes };

  const midday = secToHms(middaySec).slice(0, 5);

  if (bursts.length === 1) {
    if (bursts[0].first < middaySec) {
      notes.push({ code: "singleIn", at: midday });
      return { inTime: secToHms(bursts[0].first), outTime: null, notes };
    }
    notes.push({ code: "singleOut", at: midday });
    return { inTime: null, outTime: secToHms(bursts[0].last), notes };
  }

  if (bursts.length > 2) notes.push({ code: "multi", n: bursts.length });

  const inSec = bursts[0].first;
  const outSec = bursts[bursts.length - 1].last;
  if (inSec >= middaySec) notes.push({ code: "inAfterMidday", at: midday });
  if (outSec < middaySec) notes.push({ code: "outBeforeMidday", at: midday });

  return { inTime: secToHms(inSec), outTime: secToHms(outSec), notes };
}
