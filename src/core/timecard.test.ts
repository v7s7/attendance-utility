import { describe, expect, it } from "vitest";
import { normalizeDate, readTimecard, summarizeTimecard } from "./timecard.ts";
import { deductionFils, hourlyRate } from "./wages.ts";

describe("readTimecard", () => {
  const rows = [
    { "﻿Employee ID": "010101010", "First Name": "SAMPLE", Department: "IT", Date: "2026-09-13", Times: "2", Time: "07:06:04;14:23:36" },
    { "﻿Employee ID": "010101010", "First Name": "SAMPLE", Department: "IT", Date: "2026-09-27", Times: "1", Time: "06:54:09" },
    { "﻿Employee ID": "", "First Name": "", Department: "", Date: "", Times: "", Time: "" },
  ];

  it("reads the BioTime export, keeping the leading zero of the ID", () => {
    const read = readTimecard(rows);
    expect(read).toHaveLength(2);
    expect(read[0]).toEqual({
      employeeId: "010101010",
      name: "SAMPLE",
      department: "IT",
      date: "2026-09-13",
      times: ["07:06:04", "14:23:36"],
      invalid: [],
    });
  });

  it("summarises each employee's dates", () => {
    expect(summarizeTimecard(readTimecard(rows))).toEqual([
      { employeeId: "010101010", name: "SAMPLE", department: "IT", from: "2026-09-13", to: "2026-09-27", days: 2 },
    ]);
  });
});

describe("normalizeDate", () => {
  it("reads ISO dates, day-first dates and rejects nonsense", () => {
    expect(normalizeDate("2026-10-05")).toBe("2026-10-05");
    expect(normalizeDate("05/10/2026")).toBe("2026-10-05");
    expect(normalizeDate("31/02/2026")).toBe("");
    expect(normalizeDate("hello")).toBe("");
  });
});

describe("wages", () => {
  it("looks up the CSB tables", () => {
    expect(hourlyRate({ mode: "table", scale: "general", grade: 2, step: 8 })).toBe(2.065);
    expect(hourlyRate({ mode: "table", scale: "general", grade: 2, step: 1 })).toBeNull();
    expect(hourlyRate({ mode: "table", scale: "executive", grade: 7, step: 15 })).toBe(25.01);
    expect(hourlyRate({ mode: "custom", rate: 3.5 })).toBe(3.5);
  });

  it("rounds the deduction to the nearest fils", () => {
    expect(deductionFils(90, 2.065)).toBe(3098);
    expect(deductionFils(90, null)).toBeNull();
  });
});
