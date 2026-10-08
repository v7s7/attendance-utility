import { describe, expect, it } from "vitest";
import { detectLayout, missingFields, normalizeDate, readTimecard, setColumn, summarizeTimecard, type Cell } from "./timecard.ts";
import { deductionFils, hourlyRate } from "./wages.ts";

const read = (rows: Cell[][]) => readTimecard(rows, detectLayout(rows));

describe("readTimecard", () => {
  const rows = [
    ["﻿Employee ID", "First Name", "Department", "Date", "Times", "Time"],
    ["010101010", "SAMPLE", "IT", "2026-09-13", "2", "07:06:04;14:23:36"],
    ["010101010", "SAMPLE", "IT", "2026-09-27", "1", "06:54:09"],
    ["", "", "", "", "", ""],
  ];

  it("reads the BioTime export, keeping the leading zero of the ID", () => {
    expect(detectLayout(rows)).toEqual({ headerRow: 0, columns: ["employeeId", "name", "department", "date", null, "time"] });
    const result = read(rows);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      employeeId: "010101010",
      name: "SAMPLE",
      department: "IT",
      date: "2026-09-13",
      times: ["07:06:04", "14:23:36"],
      invalid: [],
    });
  });

  it("summarises each employee's dates", () => {
    expect(summarizeTimecard(read(rows))).toEqual([
      { employeeId: "010101010", name: "SAMPLE", department: "IT", from: "2026-09-13", to: "2026-09-27", days: 2 },
    ]);
  });

  it("finds the columns in any order, under report titles and with Arabic titles", () => {
    const arabic = [
      ["تقرير الحضور"],
      ["من 2026-09-01 إلى 2026-09-30"],
      ["الوقت", "القسم", "التاريخ", "الاسم", "الرقم الشخصي"],
      ["07:06;14:23", "IT", "13/09/2026", "موظف تجريبي", "010101010"],
    ];
    expect(read(arabic)).toEqual([
      { employeeId: "010101010", name: "موظف تجريبي", department: "IT", date: "2026-09-13", times: ["07:06:00", "14:23:00"], invalid: [] },
    ]);
  });

  it("ignores columns that look like times but aren't punches", () => {
    const rows = [
      ["Emp ID", "Name", "Date", "Check In", "Check Out", "Work Time", "Late"],
      ["010101010", "SAMPLE", "13/09/2026", "07:06", "", "07:00", "00:06"],
      ["010101010", "SAMPLE", "14/09/2026", "07:00", "14:20", "07:20", ""],
    ];
    expect(detectLayout(rows).columns).toEqual(["employeeId", "name", "date", "time", "time", null, null]);
    expect(read(rows).map((r) => r.times)).toEqual([["07:06:00"], ["07:00:00", "14:20:00"]]);
  });

  it("reads one punch per row with the date and time together, from Excel cells", () => {
    const rows: Cell[][] = [
      ["Personnel ID", "First Name", "Last Name", "Punch Time"],
      [10101010, "SAMPLE", "PERSON", new Date(Date.UTC(2026, 8, 13, 7, 6, 4))],
      [10101010, "SAMPLE", "PERSON", "13/09/2026 2:23 PM"],
    ];
    expect(read(rows)).toEqual([
      { employeeId: "10101010", name: "SAMPLE PERSON", department: "", date: "2026-09-13", times: ["07:06:04"], invalid: [] },
      { employeeId: "10101010", name: "SAMPLE PERSON", department: "", date: "2026-09-13", times: ["14:23:00"], invalid: [] },
    ]);
  });

  it("works out the columns from the cells when the file has no titles", () => {
    const rows = [
      ["010101010", "SAMPLE", "IT", "09/13/2026", "2", "07:06:04 14:23:36"],
      ["010101010", "SAMPLE", "IT", "09/14/2026", "1", "06:54:09"],
    ];
    const layout = detectLayout(rows);
    expect(layout).toEqual({ headerRow: -1, columns: ["employeeId", "name", null, "date", null, "time"] });
    // 09/13 can only be September 13th, so the file writes the month first
    expect(readTimecard(rows, layout).map((r) => [r.date, r.times])).toEqual([
      ["2026-09-13", ["07:06:04", "14:23:36"]],
      ["2026-09-14", ["06:54:09"]],
    ]);
  });

  it("says what is missing, and lets HR choose another column", () => {
    const rows = [
      ["Code", "Name", "Day", "Punches"],
      ["A-1", "SAMPLE", "2026-09-13", "07:06"],
    ];
    const layout = detectLayout(rows);
    expect(missingFields(rows, layout)).toEqual(["employeeId", "date"]);

    let columns = setColumn(layout.columns, 0, "employeeId");
    columns = setColumn(columns, 2, "date");
    expect(missingFields(rows, { ...layout, columns })).toEqual([]);
    expect(read(rows)).toEqual([]);
    expect(readTimecard(rows, { ...layout, columns })[0]).toMatchObject({ employeeId: "A-1", date: "2026-09-13", times: ["07:06:00"] });
    // A field only one column can hold moves
    expect(setColumn(columns, 1, "employeeId")).toEqual([null, "employeeId", "date", "time"]);
  });
});

describe("normalizeDate", () => {
  it("reads ISO dates, day-first dates and rejects nonsense", () => {
    expect(normalizeDate("2026-10-05")).toBe("2026-10-05");
    expect(normalizeDate("05/10/2026")).toBe("2026-10-05");
    expect(normalizeDate("05/10/2026", false)).toBe("2026-05-10");
    expect(normalizeDate("5-Oct-26")).toBe("2026-10-05");
    expect(normalizeDate("Oct 5, 2026 07:00")).toBe("2026-10-05");
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
