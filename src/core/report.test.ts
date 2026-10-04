import { describe, expect, it } from "vitest";
import { buildEmployeeMonth, type EmployeeMonthInput } from "./report.ts";
import { DEFAULT_RULES, DEFAULT_SCHEDULES, dayRule, measureDay } from "./schedule.ts";
import type { Schedule } from "./types.ts";

const [FLEXIBLE, FIXED, HOURS] = DEFAULT_SCHEDULES.map((s, i): Schedule => ({ ...s, id: i + 1 }));

// Deduct from the first minute, so the small examples below show their numbers
const NO_ALLOWANCE = { ...DEFAULT_RULES, allowanceHours: 0 };

// September 2026: the 13th is a Sunday, the 17th a Thursday, the 18th a Friday
function month(over: Partial<EmployeeMonthInput> = {}): EmployeeMonthInput {
  return {
    month: "2026-09",
    today: "2026-10-04",
    schedule: FLEXIBLE,
    rules: NO_ALLOWANCE,
    holidays: [],
    coverage: [{ from: "2026-09-01", to: "2026-09-30" }],
    punches: {},
    invalid: {},
    adjustments: {},
    rate: null,
    ...over,
  };
}

const day = (input: EmployeeMonthInput, date: string) => {
  const found = buildEmployeeMonth(input).days.find((d) => d.date === date);
  if (!found) throw new Error("no day " + date);
  return found;
};

describe("flexible schedule (07:00, late after 08:00)", () => {
  const sun = dayRule(FLEXIBLE, "2026-09-13")!;
  const thu = dayRule(FLEXIBLE, "2026-09-17")!;

  it("counts 07:00 to 15:15 on Sunday and 07:00 to 15:00 on Thursday", () => {
    expect([sun.start, sun.latestStart, sun.end, sun.required]).toEqual([420, 480, 915, 435]);
    expect([thu.end, thu.required]).toEqual([900, 420]);
  });

  it("splits a shortage into late arrival and early leave", () => {
    expect(measureDay("08:30", "15:00", sun)).toMatchObject({ workedMin: 390, lateMin: 30, earlyMin: 15 });
    expect(measureDay("07:00", "14:00", sun)).toMatchObject({ lateMin: 0, earlyMin: 15, diffMin: -15 });
  });

  it("does not let staying late make up for arriving late", () => {
    expect(measureDay("09:00", "17:00", sun)).toMatchObject({ workedMin: 375, lateMin: 60, earlyMin: 0 });
  });

  it("ignores time before 07:00 and shows time above the required hours", () => {
    expect(measureDay("06:30", "15:45", sun)).toMatchObject({ workedMin: 495, diffMin: 60, lateMin: 0 });
  });
});

describe("fixed schedule (07:00-14:15)", () => {
  const sun = dayRule(FIXED, "2026-09-13")!;

  it("is late from 07:00 and early before 14:15", () => {
    expect([sun.latestStart, sun.end]).toEqual([420, 855]);
    expect(measureDay("07:10", "14:15", sun)).toMatchObject({ lateMin: 10, earlyMin: 0 });
    expect(measureDay("06:29", "14:12", sun)).toMatchObject({ lateMin: 0, earlyMin: 3 });
  });
});

describe("hours-only schedule", () => {
  it("lets someone who comes at 6:00 leave at 13:15, which the flexible schedule would not", () => {
    const punches = { "2026-09-13": ["06:00:00", "13:15:00"] };
    const hoursDay = day(month({ schedule: HOURS, punches }), "2026-09-13");
    expect([hoursDay.status, hoursDay.workedMin, hoursDay.shortfallMin]).toEqual(["OK", 435, 0]);
    // The flexible schedule counts from 07:00, so the same day is an hour short
    const flexDay = day(month({ schedule: FLEXIBLE, punches }), "2026-09-13");
    expect([flexDay.status, flexDay.workedMin, flexDay.earlyMin]).toEqual(["SHORT", 375, 60]);
  });

  const sun = dayRule(HOURS, "2026-09-13")!;

  it("counts the actual time from IN to OUT, including before 07:00", () => {
    expect(measureDay("06:00", "13:15", sun)).toMatchObject({ workedMin: 435, shortfallMin: 0, lateMin: 0 });
    expect(measureDay("09:00", "15:00", sun)).toMatchObject({ workedMin: 360, shortfallMin: 75, lateMin: 0 });
  });

  it("deducts the shortfall", () => {
    const m = buildEmployeeMonth(month({ schedule: HOURS, punches: { "2026-09-13": ["09:00:00", "15:00:00"] } }));
    expect(m.summary.deductibleMin).toBe(75);
  });
});

describe("reading the month", () => {
  it("skips the weekend and stops at today", () => {
    const m = buildEmployeeMonth(month({ month: "2026-10" }));
    expect(m.days.map((d) => d.date)).toEqual(["2026-10-01", "2026-10-04"]);
  });

  it("marks days outside the imported period as no data instead of absent", () => {
    const m = buildEmployeeMonth(month({ coverage: [{ from: "2026-09-13", to: "2026-09-30" }] }));
    expect(m.days.find((d) => d.date === "2026-09-01")?.status).toBe("NO_DATA");
    expect(m.days.find((d) => d.date === "2026-09-14")?.status).toBe("ABSENT");
    expect(m.summary.partial).toBe(true);
  });

  it("reads a double tap at leaving time as a missing IN, not zero hours worked", () => {
    const d = day(month({ punches: { "2026-09-22": ["14:17:20", "14:17:25"] } }), "2026-09-22");
    expect([d.status, d.reason, d.outTime]).toEqual(["INCOMPLETE", "missingIn", "14:17:25"]);
  });

  it("treats a lone morning punch today as a day in progress", () => {
    const d = day(month({ month: "2026-10", punches: { "2026-10-04": ["08:00:45"] } }), "2026-10-04");
    expect(d.status).toBe("IN_PROGRESS");
  });

  it("uses times typed by HR and keeps what the device recorded", () => {
    const input = month({
      punches: { "2026-09-22": ["14:17:20"] },
      adjustments: { "2026-09-22": { inTime: "07:05", outTime: null, excuse: null, note: "" } },
    });
    const d = day(input, "2026-09-22");
    expect([d.status, d.inTime, d.inManual, d.deviceIn, d.earlyMin]).toEqual(["SHORT", "07:05", true, null, 3]);
  });

  it("shows public holidays and does not count them", () => {
    const m = buildEmployeeMonth(month({ holidays: [{ date: "2026-09-14", name: "Holiday" }] }));
    expect(m.days.find((d) => d.date === "2026-09-14")?.status).toBe("HOLIDAY");
    expect(m.summary.holidayDays).toBe(1);
  });
});

describe("monthly deduction", () => {
  const punches = {
    "2026-09-13": ["08:30:00", "15:15:00"], // 30 late
    "2026-09-14": ["07:00:00", "14:00:00"], // 15 early
    "2026-09-15": ["07:10:00"], // missing OUT
  };
  const coverage = [{ from: "2026-09-13", to: "2026-09-15" }];

  it("adds late arrival and early leave, and holds missing punches for review", () => {
    const s = buildEmployeeMonth(month({ punches, coverage, rate: 2.59 })).summary;
    expect([s.lateMin, s.earlyMin, s.deductibleMin, s.needsReview]).toEqual([30, 15, 45, 1]);
    expect(s.deductionFils).toBe(Math.round((45 * 2590) / 60));
  });

  it("follows the rules: allowance, no early leave, absences and missing punches as full days", () => {
    const rules = { ...NO_ALLOWANCE, allowanceHours: 0.25, deductEarlyLeave: false, incompleteMode: "deduct" as const };
    const s = buildEmployeeMonth(month({ punches, coverage, rules })).summary;
    expect([s.latenessMin, s.allowanceMin, s.deductIncompleteMin, s.deductibleMin]).toEqual([30, 15, 435, 450]);
  });

  it("forgives the first 7:15 of the month by default and deducts only the time above it", () => {
    const late = (dates: string[]) => Object.fromEntries(dates.map((d) => [d, ["09:00:00", "16:15:00"]]));
    const rules = DEFAULT_RULES;
    // 45 minutes in the month: all forgiven
    expect(buildEmployeeMonth(month({ punches, coverage, rules })).summary).toMatchObject({ latenessMin: 45, allowanceMin: 45, deductibleMin: 0 });
    // Nine days an hour late is 9:00; 1:45 of it is above the allowance
    const nine = ["13", "14", "15", "16", "17", "20", "21", "22", "23"].map((d) => "2026-09-" + d);
    const s = buildEmployeeMonth(month({ punches: late(nine), coverage: [{ from: "2026-09-13", to: "2026-09-23" }], rules })).summary;
    expect([s.latenessMin, s.allowanceMin, s.deductibleMin]).toEqual([540, 435, 105]);
  });

  it("totals the hours worked against the hours required", () => {
    const s = buildEmployeeMonth(month({ punches, coverage })).summary;
    // 08:30-15:15 is 6:45 and 07:00-14:00 is 7:00; three working days of 7:15 were required
    expect([s.workedMin, s.requiredMin]).toEqual([6 * 60 + 45 + 7 * 60, 3 * 435]);
    // A sick day is not required
    const adjustments = { "2026-09-15": { inTime: null, outTime: null, excuse: "sick" as const, note: "" } };
    expect(buildEmployeeMonth(month({ punches, coverage, adjustments })).summary.requiredMin).toBe(2 * 435);
  });

  it("lets HR decide each absence: sick leave, annual leave, or from the salary at the same rate", () => {
    const blank = { inTime: null, outTime: null, note: "" };
    const input = month({
      punches: { "2026-09-13": ["08:30:00", "15:15:00"] }, // 30 minutes late; the 14th to the 17th absent
      coverage: [{ from: "2026-09-13", to: "2026-09-17" }],
      adjustments: {
        "2026-09-14": { ...blank, excuse: "sick" },
        "2026-09-15": { ...blank, excuse: "annual" },
        "2026-09-16": { ...blank, excuse: null, absence: "salary" },
        // The 17th: no decision yet
      },
      rate: 2.59,
    });
    const s = buildEmployeeMonth(input).summary;
    expect([s.absentDays, s.salaryAbsenceDays, s.pendingAbsentDays, s.sickDays, s.annualDays, s.needsReview]).toEqual([2, 1, 1, 1, 1, 1]);
    // Priced apart: 30 minutes of lateness, and one day of 7:15 from the salary
    expect([s.deductAbsenceMin, s.deductibleMin]).toEqual([435, 465]);
    expect([s.latenessFils, s.absenceFils, s.deductionFils]).toEqual([1295, 18778, 20073]);

    // The monthly allowance forgives the lateness, never the absence
    const withAllowance = buildEmployeeMonth({ ...input, rules: DEFAULT_RULES }).summary;
    expect([withAllowance.allowanceMin, withAllowance.deductibleMin, withAllowance.latenessFils]).toEqual([30, 435, 0]);
  });

  it("never deducts sick leave and does not count it as a permission", () => {
    const adjustments = { "2026-09-15": { inTime: null, outTime: null, excuse: "sick" as const, note: "" } };
    const s = buildEmployeeMonth(month({ punches, coverage, adjustments })).summary;
    expect([s.sickDays, s.needsReview, s.permissionCount, s.deductibleMin]).toEqual([1, 0, 0, 45]);
  });

  it("warns when personal permissions go over the monthly limit", () => {
    const permission = { inTime: null, outTime: null, excuse: "permission" as const, note: "" };
    const adjustments = Object.fromEntries(
      ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-06", "2026-09-07"].map((d) => [d, permission]),
    );
    const s = buildEmployeeMonth(month({ adjustments })).summary;
    expect([s.permissionCount, s.permissionOver]).toEqual([5, true]);
  });
});
