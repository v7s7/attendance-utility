import { WAGE_SCALES } from "../data/wageTables.js";

export function findScale(id) {
  return WAGE_SCALES.find((s) => s.id === id) || null;
}

// Hourly wage in BHD for an employee profile, or null when it is not set yet.
// profile: { mode: "table", scale, grade, step } or { mode: "custom", rate }
export function hourlyRate(profile) {
  if (!profile) return null;

  if (profile.mode === "custom") {
    const rate = Number(profile.rate);
    return rate > 0 ? rate : null;
  }

  const scale = findScale(profile.scale);
  const row = scale ? scale.grades.find((g) => g.grade === Number(profile.grade)) : null;
  if (!row || profile.step === "" || profile.step === undefined) return null;
  return row.steps[Number(profile.step)] ?? null;
}

// Deduction in fils (1 BHD = 1000 fils) for `minutes` at `rate` BHD per hour, rounded to the nearest fils
export function deductionFils(minutes, rate) {
  if (rate === null || rate === undefined) return null;
  return Math.round((minutes * Math.round(rate * 1000)) / 60);
}
