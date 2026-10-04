// Defaults follow CSB Instruction 1/2023: 07:00-14:15 Sun-Wed, 07:00-14:00 Thu,
// with a flexible start until 08:00. Every value can be changed in the settings panel.
export const DEFAULT_SETTINGS = {
  earliestStart: "07:00", // time before this is not counted
  latestStart: "08:00", // end of the flexible start window; arriving after it is late
  requiredSunWed: "07:15",
  requiredThu: "07:00",
  weekendDays: [5, 6], // Fri, Sat
  deductEarlyLeave: true,
  allowanceHours: 0, // lateness forgiven each month before deducting
  absenceMode: "list", // "list" | "deduct"
  incompleteMode: "hold", // "hold" | "deduct"
  permissionLimitCount: 4,
  permissionLimitTime: "07:15", // one working day
  duplicateWindowMin: 15,
  holidays: [], // [{ date: "2026-12-16", name: "National Day" }]
};

// Keep settings saved by an older version usable after new options are added
export function mergeSettings(saved) {
  return { ...DEFAULT_SETTINGS, ...(saved && typeof saved === "object" ? saved : {}) };
}

// "07:15" or "07:15:30" -> 435 (seconds are dropped)
export function hmToMin(hm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hm || "").trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function minToHm(min) {
  return String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");
}

export function weekday(dateStr) {
  return new Date(dateStr + "T00:00:00").getDay();
}

export function isWeekend(dateStr, settings) {
  return settings.weekendDays.includes(weekday(dateStr));
}

export function holidayFor(dateStr, settings) {
  return settings.holidays.find((h) => h.date === dateStr) || null;
}

export function requiredMinutes(dateStr, settings) {
  return hmToMin(weekday(dateStr) === 4 ? settings.requiredThu : settings.requiredSunWed) || 0;
}

// Only time between `start` and `end` counts, where end = latest start + required hours
// (Sun-Wed 07:00 -> 15:15, Thu 07:00 -> 15:00 with the defaults)
export function dayWindow(dateStr, settings) {
  const start = hmToMin(settings.earliestStart) ?? 0;
  const latestStart = Math.max(start, hmToMin(settings.latestStart) ?? start);
  const required = requiredMinutes(dateStr, settings);
  return { start, latestStart, end: latestStart + required, required };
}

// Late = arrival after the flexible window; early leave = the rest of the shortage.
// Time outside the window is ignored, so a late morning cannot be made up after `end`.
export function computeWorked(inTime, outTime, win) {
  const inMin = hmToMin(inTime);
  const outMin = hmToMin(outTime);
  if (inMin === null || outMin === null) return null;

  const workedMin = Math.max(0, Math.min(outMin, win.end) - Math.max(inMin, win.start));
  const shortMin = Math.max(0, win.required - workedMin);
  const lateMin = Math.min(shortMin, Math.max(0, inMin - win.latestStart));

  return { workedMin, shortMin, lateMin, earlyMin: shortMin - lateMin };
}
