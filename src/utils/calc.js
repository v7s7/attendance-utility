import { clampAndCompute, dayName, isWeekend, requiredMinutes } from "./timeRules";

function safeStr(v) {
  return v === null || v === undefined ? "" : String(v).trim();
}

// Accept punches separated by ; or ,
function parsePunches(timeCell) {
  const s = safeStr(timeCell);
  if (!s) return [];

  return s
    .split(/[;,]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => (/^\d{2}:\d{2}$/.test(x) ? x + ":00" : x));
}

function pickInOut(punches) {
  if (punches.length === 0) return { inTime: null, outTime: null };
  if (punches.length === 1) return { inTime: punches[0], outTime: null };
  return { inTime: punches[0], outTime: punches[punches.length - 1] };
}

function ymdFromParts(y, m, d) {
  const yyyy = String(y);
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return yyyy + "-" + mm + "-" + dd;
}

function normalizeDate(dateVal) {
  const s = safeStr(dateVal);

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    const d = new Date(Math.round((n - 25569) * 86400 * 1000));
    return ymdFromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return ymdFromParts(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  return "";
}

function dateRangeInclusive(startDate, endDate) {
  const out = [];
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(ymdFromParts(d.getFullYear(), d.getMonth() + 1, d.getDate()));
  }
  return out;
}

export function buildReport(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("No rows found in file.");
  }

  // Per-date record; if duplicates exist, keep the one with more punches
  const byDate = new Map();

  for (const r of rows) {
    const date = normalizeDate(r.Date ?? r.date ?? r.DATE);
    if (!date) continue;

    const punches = parsePunches(r.Time ?? r.time ?? r.TIME);
    const io = pickInOut(punches);

    const existing = byDate.get(date);
    if (!existing || punches.length > existing.punchesCount) {
      byDate.set(date, {
        date,
        inTime: io.inTime,
        outTime: io.outTime,
        punchesCount: punches.length,
      });
    }
  }

  const presentDates = Array.from(byDate.keys()).sort();
  if (presentDates.length === 0) throw new Error("No valid Date entries found.");

  const minDate = presentDates[0];
  const maxDate = presentDates[presentDates.length - 1];

  const allDays = dateRangeInclusive(minDate, maxDate);

  const daily = [];
  const shortDays = [];
  const incompleteDays = [];
  const absentDays = [];

  for (const date of allDays) {
    if (isWeekend(date)) continue;

    const reqMin = requiredMinutes(date);
    const rec = byDate.get(date);

    if (!rec) {
      daily.push({
        date,
        dayName: dayName(date),
        inTime: null,
        outTime: null,
        workedMin: null,
        requiredMin: reqMin,
        deltaMin: null,
        status: "ABSENT",
      });
      absentDays.push({ date, dayName: dayName(date) });
      continue;
    }

    const inTime = rec.inTime;
    const outTime = rec.outTime;

    if (!inTime || !outTime) {
      daily.push({
        date,
        dayName: dayName(date),
        inTime: inTime || null,
        outTime: outTime || null,
        workedMin: null,
        requiredMin: reqMin,
        deltaMin: null,
        status: "INCOMPLETE",
      });
      incompleteDays.push({
        date,
        reason: !inTime ? "Missing IN" : "Missing OUT",
      });
      continue;
    }

    const calc = clampAndCompute(inTime, outTime);
    if (!calc) {
      daily.push({
        date,
        dayName: dayName(date),
        inTime,
        outTime,
        workedMin: null,
        requiredMin: reqMin,
        deltaMin: null,
        status: "INCOMPLETE",
      });
      incompleteDays.push({ date, reason: "Invalid time format" });
      continue;
    }

    const workedMin = calc.workedMin;
    const deltaMin = workedMin - reqMin;
    const status = workedMin >= reqMin ? "OK" : "SHORT";

    daily.push({
      date,
      dayName: dayName(date),
      inTime,
      outTime,
      workedMin,
      requiredMin: reqMin,
      deltaMin,
      status,
    });

    if (status === "SHORT") {
      shortDays.push({ date, shortByMin: reqMin - workedMin });
    }
  }

  return {
    range: { minDate, maxDate },
    daily,
    shortDays,
    incompleteDays,
    absentDays,
  };
}
