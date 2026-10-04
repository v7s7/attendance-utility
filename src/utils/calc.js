import { computeWorked, dayWindow, hmToMin, holidayFor, isWeekend, weekday } from "./timeRules.js";
import { parsePunchCell, resolveInOut } from "./punches.js";
import { deductionFils, hourlyRate } from "./wages.js";

function safeStr(v) {
  return v === null || v === undefined ? "" : String(v).trim();
}

function ymdFromParts(y, m, d) {
  const yyyy = String(y);
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return yyyy + "-" + mm + "-" + dd;
}

export function todayStr() {
  const d = new Date();
  return ymdFromParts(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function normalizeDate(dateVal) {
  const s = safeStr(dateVal);

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Bahrain writes dates day first: 05/10/2026 is 5 October
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (dmy) return ymdFromParts(dmy[3], dmy[2], dmy[1]);

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

export function dateRangeInclusive(startDate, endDate) {
  const out = [];
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(ymdFromParts(d.getFullYear(), d.getMonth() + 1, d.getDate()));
  }
  return out;
}

function lastDayOfMonth(month) {
  const [y, m] = month.split("-").map(Number);
  return ymdFromParts(y, m, new Date(y, m, 0).getDate());
}

// Header names vary between exports; compare them without case, spaces or symbols
const FIELDS = {
  id: ["employeeid", "cpr", "cprno", "cprnumber", "empid", "employeeno", "id"],
  name: ["firstname", "name", "employeename", "fullname"],
  department: ["department", "dept"],
  date: ["date"],
  time: ["time", "punches"],
};

function readFields(row) {
  const norm = {};
  for (const [k, v] of Object.entries(row)) norm[k.toLowerCase().replace(/[^a-z0-9]/g, "")] = v;

  const out = {};
  for (const [field, aliases] of Object.entries(FIELDS)) {
    const key = aliases.find((a) => safeStr(norm[a]) !== "");
    out[field] = key ? safeStr(norm[key]) : "";
  }
  return out;
}

// CSV rows (from one or more Time Card exports) -> each employee's punches per date.
// No rules are applied here, so changing the settings never needs the files again.
export function collectPunches(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("NO_ROWS");

  const people = new Map();
  for (const row of rows) {
    const f = readFields(row);
    const date = normalizeDate(f.date);
    if (!date) continue;

    let person = people.get(f.id);
    if (!person) {
      person = { id: f.id, name: f.name, department: f.department, byDate: new Map() };
      people.set(f.id, person);
    }
    if (!person.name) person.name = f.name;
    if (!person.department) person.department = f.department;

    // A day can appear on several rows or in several files; merge all of its punches
    const rec = person.byDate.get(date) || { times: [], invalid: 0 };
    const cell = parsePunchCell(f.time);
    rec.times.push(...cell.times);
    rec.invalid += cell.invalid;
    person.byDate.set(date, rec);
  }

  if (people.size === 0) throw new Error("NO_DATES");

  let from = null;
  let to = null;
  for (const p of people.values()) {
    for (const d of p.byDate.keys()) {
      if (!from || d < from) from = d;
      if (!to || d > to) to = d;
    }
  }

  const employees = Array.from(people.values()).sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
  );
  return { employees, from, to };
}

// One working day: detected punches, HR's manual times/excuse, and the result
function buildDay(date, rec, edit, ctx) {
  const { settings, today } = ctx;
  const win = dayWindow(date, settings);
  const day = {
    date,
    month: date.slice(0, 7),
    weekday: weekday(date),
    requiredMin: win.required,
    inTime: null,
    outTime: null,
    inManual: false,
    outManual: false,
    workedMin: null,
    lateMin: 0,
    earlyMin: 0,
    shortMin: 0,
    excusedMin: 0,
    status: "",
    reason: "",
    notes: [],
    excuse: (edit && edit.excuse) || "",
    note: (edit && edit.note) || "",
    edited: Boolean(edit),
  };

  const holiday = holidayFor(date, settings);
  if (holiday) return { ...day, status: "HOLIDAY", reason: holiday.name || "" };

  if (rec) {
    const io = resolveInOut(rec.times, {
      duplicateWindowSec: Number(settings.duplicateWindowMin || 0) * 60,
      middaySec: ((win.start + win.end) / 2) * 60,
    });
    day.inTime = io.inTime;
    day.outTime = io.outTime;
    day.notes = rec.invalid ? [{ code: "invalid", n: rec.invalid }, ...io.notes] : io.notes;
  }
  day.deviceIn = day.inTime;
  day.deviceOut = day.outTime;

  // Times typed by HR from the manual register replace what the device recorded
  if (edit && edit.inTime) {
    day.inTime = edit.inTime;
    day.inManual = true;
  }
  if (edit && edit.outTime) {
    day.outTime = edit.outTime;
    day.outManual = true;
  }

  let status;
  const calc = day.inTime && day.outTime ? computeWorked(day.inTime, day.outTime, win) : null;
  if (calc) {
    Object.assign(day, calc);
    status = calc.shortMin > 0 ? "SHORT" : "OK";
  } else if (!day.inTime && !day.outTime) {
    status = rec && rec.invalid ? "INCOMPLETE" : "ABSENT";
    if (status === "INCOMPLETE") day.reason = "invalid";
  } else if (!day.outTime && date === today) {
    status = "IN_PROGRESS";
  } else {
    status = "INCOMPLETE";
    day.reason = day.inTime ? "missingOut" : "missingIn";
  }

  if (day.excuse) {
    // Nothing is deducted for an excused day; keep how much was forgiven for the permission limits
    const forgiven = status === "OK" || status === "SHORT" ? day.shortMin : status === "IN_PROGRESS" ? 0 : win.required;
    return { ...day, status: "EXCUSED", excusedMin: forgiven };
  }
  return { ...day, status };
}

// True when the period includes every working day of the month
function coversMonth(month, period, settings) {
  const working = dateRangeInclusive(month + "-01", lastDayOfMonth(month)).filter(
    (d) => !isWeekend(d, settings) && !holidayFor(d, settings)
  );
  if (working.length === 0) return true;
  return period.from <= working[0] && period.to >= working[working.length - 1];
}

function summarizeMonth(month, days, rate, ctx) {
  const { settings, period } = ctx;
  const s = {
    month,
    from: days.length ? days[0].date : null,
    to: days.length ? days[days.length - 1].date : null,
    workingDays: 0,
    okDays: 0,
    shortDays: 0,
    absentDays: 0,
    incompleteDays: 0,
    excusedDays: 0,
    holidayDays: 0,
    inProgressDays: 0,
    lateDays: 0,
    lateMin: 0,
    earlyMin: 0,
    workedMin: 0,
    absenceMin: 0,
    incompleteMin: 0,
    permissionCount: 0,
    permissionMin: 0,
  };

  for (const d of days) {
    if (d.status === "HOLIDAY") {
      s.holidayDays++;
      continue;
    }
    s.workingDays++;

    if (d.status === "OK" || d.status === "SHORT") {
      if (d.status === "OK") s.okDays++;
      else s.shortDays++;
      s.workedMin += d.workedMin;
      s.lateMin += d.lateMin;
      s.earlyMin += d.earlyMin;
      if (d.lateMin > 0) s.lateDays++;
    } else if (d.status === "ABSENT") {
      s.absentDays++;
      s.absenceMin += d.requiredMin;
    } else if (d.status === "INCOMPLETE") {
      s.incompleteDays++;
      s.incompleteMin += d.requiredMin;
    } else if (d.status === "IN_PROGRESS") {
      s.inProgressDays++;
    } else if (d.status === "EXCUSED") {
      s.excusedDays++;
      if (d.excuse === "permission") {
        s.permissionCount++;
        s.permissionMin += d.excusedMin;
      }
    }
  }

  s.latenessMin = s.lateMin + (settings.deductEarlyLeave ? s.earlyMin : 0);
  s.allowanceMin = Math.min(s.latenessMin, Math.round(Number(settings.allowanceHours || 0) * 60));
  s.deductAbsenceMin = settings.absenceMode === "deduct" ? s.absenceMin : 0;
  s.deductIncompleteMin = settings.incompleteMode === "deduct" ? s.incompleteMin : 0;
  s.deductibleMin = s.latenessMin - s.allowanceMin + s.deductAbsenceMin + s.deductIncompleteMin;
  s.rate = rate;
  s.deductionFils = deductionFils(s.deductibleMin, rate);

  s.needsReview = settings.incompleteMode === "hold" ? s.incompleteDays : 0;
  s.permissionOver =
    s.permissionCount > Number(settings.permissionLimitCount) ||
    s.permissionMin > (hmToMin(settings.permissionLimitTime) ?? Infinity);
  s.partial = !coversMonth(month, period, settings);
  return s;
}

// Apply the rules, HR edits and wages to every employee for the chosen period
export function buildReport(data, { settings, profiles, edits, period, today }) {
  const to = period.to > today ? today : period.to;
  const from = period.from;
  const dates = from <= to ? dateRangeInclusive(from, to).filter((d) => !isWeekend(d, settings)) : [];
  const months = Array.from(new Set(dates.map((d) => d.slice(0, 7))));
  const ctx = { settings, today, period: { from, to } };

  const employees = data.employees.map((emp) => {
    const profile = profiles[emp.id] || {};
    const empEdits = edits[emp.id] || {};
    const rate = hourlyRate(profile);
    const days = dates.map((d) => buildDay(d, emp.byDate.get(d), empEdits[d], ctx));

    const byMonth = {};
    for (const m of months) {
      byMonth[m] = summarizeMonth(m, days.filter((d) => d.month === m), rate, ctx);
    }

    return {
      id: emp.id,
      name: profile.fullName || emp.name,
      fileName: emp.name,
      department: emp.department,
      profile,
      rate,
      days,
      months: byMonth,
    };
  });

  return { from, to, months, employees };
}
