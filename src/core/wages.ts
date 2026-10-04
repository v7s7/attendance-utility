import type { WageProfile } from "./types.ts";
import { WAGE_SCALES, type WageScale } from "./wageTables.ts";

export function findScale(id: string | undefined): WageScale | null {
  return WAGE_SCALES.find((s) => s.id === id) ?? null;
}

/** Hourly wage in BHD for a profile, or null when it is not set. */
export function hourlyRate(profile: WageProfile | null | undefined): number | null {
  if (!profile) return null;

  if (profile.mode === "custom") {
    const rate = Number(profile.rate);
    return rate > 0 ? rate : null;
  }
  if (profile.mode !== "table" || profile.step === undefined) return null;

  const grade = findScale(profile.scale)?.grades.find((g) => g.grade === Number(profile.grade));
  return grade?.steps[Number(profile.step)] ?? null;
}

/** Deduction in fils (1 BHD = 1000 fils) for `minutes` at `rate` BHD per hour, rounded to the nearest fils. */
export function deductionFils(minutes: number, rate: number | null): number | null {
  if (rate === null) return null;
  return Math.round((minutes * Math.round(rate * 1000)) / 60);
}
