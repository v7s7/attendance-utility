import { describe, expect, it } from "vitest";
import { sumMonths } from "./period.ts";
import { buildEmployeeMonth, type EmployeeMonthInput } from "./report.ts";
import { DEFAULT_RULES, DEFAULT_SCHEDULES } from "./schedule.ts";

const schedule = { ...DEFAULT_SCHEDULES[0], id: 1 };

function month(m: string, punches: Record<string, string[]>, rate: number | null = 3.51): EmployeeMonthInput {
  return {
    month: m,
    today: "2026-10-04",
    schedule,
    rules: DEFAULT_RULES,
    holidays: [],
    coverage: [{ from: Object.keys(punches)[0], to: Object.keys(punches).at(-1)! }],
    punches,
    invalid: {},
    adjustments: {},
    rate,
  };
}

describe("sumMonths", () => {
  it("adds up the months, each with its own monthly allowance", () => {
    // July: 9 days an hour late (9:00, 1:45 above the allowance); August: 30 minutes (all forgiven)
    const nine = ["05", "06", "07", "08", "09", "12", "13", "14", "15"];
    const july = buildEmployeeMonth(month("2026-07", Object.fromEntries(nine.map((d) => [`2026-07-${d}`, ["09:00:00", "16:15:00"]])))).summary;
    const august = buildEmployeeMonth(month("2026-08", { "2026-08-02": ["08:30:00", "15:15:00"] })).summary;

    const totals = sumMonths([july, august]);
    expect([totals.months, totals.workingDays, totals.lateMin, totals.allowanceMin, totals.deductibleMin]).toEqual([2, july.workingDays + august.workingDays, 570, 435 + 30, 105]);
    // Not the same as one allowance over the two months together (570 - 435 = 135)
    expect(totals.deductionFils).toBe(july.deductionFils! + august.deductionFils!);
    expect(totals.missingRate).toBe(false);
  });

  it("leaves out months without an hourly wage, and says so", () => {
    const nine = ["05", "06", "07", "08", "09", "12", "13", "14", "15"];
    const noWage = buildEmployeeMonth(month("2026-07", Object.fromEntries(nine.map((d) => [`2026-07-${d}`, ["09:00:00", "16:15:00"]])), null)).summary;
    const august = buildEmployeeMonth(month("2026-08", { "2026-08-02": ["08:30:00", "15:15:00"] })).summary;
    const totals = sumMonths([noWage, august]);
    expect([totals.deductibleMin, totals.deductionFils, totals.missingRate]).toEqual([105, august.deductionFils, true]);
  });
});
