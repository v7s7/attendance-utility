const WORK_START_MIN = 7 * 60; // 07:00
const WORK_END_MIN = 15 * 60 + 15; // 15:15

function toMinutes(hms) {
  if (!hms) return null;
  const parts = String(hms).trim().split(":");
  const h = Number(parts[0] || 0);
  const m = Number(parts[1] || 0);
  return h * 60 + m;
}

function fromMinutes(min) {
  const h = String(Math.floor(min / 60)).padStart(2, "0");
  const m = String(min % 60).padStart(2, "0");
  return h + ":" + m + ":00";
}

export function isWeekend(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  return day === 5 || day === 6; // Fri/Sat
}

export function dayName(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

export function requiredMinutes(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  return day === 4 ? 420 : 435; // Thu=7h, others=7h15m
}

// Counted work is ONLY inside 07:00..15:15
// worked = min(out, 15:15) - max(in, 07:00), min 0
export function clampAndCompute(inTime, outTime) {
  if (!inTime || !outTime) return null;

  const rawIn = toMinutes(inTime);
  const rawOut = toMinutes(outTime);

  if (rawIn === null || rawOut === null) return null;

  const countedInMin = Math.max(rawIn, WORK_START_MIN);
  const countedOutMin = Math.min(rawOut, WORK_END_MIN);

  const workedMin = Math.max(0, countedOutMin - countedInMin);

  return {
    countedIn: fromMinutes(countedInMin),
    countedOut: fromMinutes(countedOutMin),
    workedMin,
  };
}
