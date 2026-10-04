import readXlsxFile from "read-excel-file/node";
import { describe, expect, it } from "vitest";
import writeXlsxFile from "write-excel-file/node";
import type { EmployeeView } from "./api.ts";
import { employeeSheetData, readEmployeeSheet, type SheetCell } from "./employeeSheet.ts";
import type { Schedule } from "./types.ts";

const schedules: Schedule[] = [
  { id: 1, name: "دوام مرن", kind: "flexible", start: "07:00", latestStart: "08:00", hours: [] },
  { id: 3, name: "ساعات العمل فقط", kind: "hours", start: "07:00", latestStart: "07:00", hours: [] },
];

function employee(id: string, more: Partial<EmployeeView> = {}): EmployeeView {
  return {
    id,
    name: "AHMED",
    exportedName: "AHMED",
    fullName: "",
    employeeNo: "",
    department: "IT",
    scheduleChoice: null,
    scheduleId: 1,
    scheduleName: "دوام مرن",
    wage: {},
    rate: null,
    active: true,
    ...more,
  };
}

const header = ["الرقم الشخصي", "الاسم في جهاز البصمة", "الاسم الكامل", "الرقم الوظيفي", "القسم", "جدول الدوام", "جدول الأجور", "الدرجة", "الرتبة", "أجر الساعة (إدخال يدوي)"];

describe("readEmployeeSheet", () => {
  it("reads names, schedules and wages, and leaves empty cells alone", () => {
    const result = readEmployeeSheet(
      [
        header,
        // Excel turned the CPR into a number and dropped the leading zero
        [10101010, "SAMPLE", "موظف تجريبي", 1234, "", "ساعات العمل فقط", "الوظائف العمومية (الاعتيادية)", 5, 3, null],
        ["020202020", "SARA", "", "", "", "", "", "", "", "3.5"],
        ["030303030", "ALI", "", "", "", "", "", "", "", ""],
      ],
      [employee("010101010"), employee("020202020"), employee("030303030")],
      schedules,
    );
    expect(result.ok && result.updates.map((u) => [u.employee.id, u.update])).toEqual([
      ["010101010", { fullName: "موظف تجريبي", employeeNo: "1234", scheduleId: 3, wage: { mode: "table", scale: "general", grade: 5, step: 3 } }],
      ["020202020", { wage: { mode: "custom", rate: 3.5 } }],
    ]);
    expect(result.ok && [result.unchanged, result.problems]).toEqual([1, []]);
  });

  it("changes only the step after a promotion, and reads the minimum step by name", () => {
    const current = employee("1", { wage: { mode: "table", scale: "general", grade: 5, step: 3 } });
    const step = (value: string | number) => {
      const result = readEmployeeSheet([["CPR", "Step"], ["1", value]], [current], schedules);
      return result.ok ? result.updates[0]?.update : null;
    };
    expect(step(4)).toEqual({ wage: { mode: "table", scale: "general", grade: 5, step: 4 } });
    expect(step("الحد الأدنى")?.wage?.step).toBe(0);
  });

  it("lists what it could not use, with the Excel row number", () => {
    const result = readEmployeeSheet(
      [
        ["قائمة الموظفين"],
        header,
        ["999", "", "", "", "", "", "", "", "", ""],
        ["", "", "اسم بدون رقم", "", "", "", "", "", "", ""],
        ["1", "", "", "", "", "دوام ليلي", "", "", "", ""],
        ["1", "", "", "", "", "", "", "", "", ""],
        ["2", "", "", "", "", "", "العمومية", 2, 1, ""], // grade 2 starts at step 8
        ["3", "", "", "", "", "", "", "", "", "abc"],
        ["4", "", "", "", "", "", "", "", 3, ""],
      ],
      [employee("1"), employee("2"), employee("3"), employee("4")],
      schedules,
    );
    expect(result.ok && result.problems.map((p) => [p.row, p.code])).toEqual([
      [3, "unknown_employee"],
      [4, "missing_id"],
      [5, "unknown_schedule"],
      [6, "duplicate"],
      [7, "bad_wage"],
      [8, "bad_rate"],
      [9, "incomplete_wage"], // a step alone, for someone with no wage table yet
    ]);
  });

  it("reads back the sheet it gives out without changing anything", async () => {
    const employees = [
      employee("010101010", { fullName: "موظف تجريبي", scheduleChoice: 3, scheduleName: "ساعات العمل فقط", wage: { mode: "table", scale: "general", grade: 5, step: 0 } }),
      employee("020202020", { wage: { mode: "custom", rate: 3.25 } }),
      employee("030303030"),
    ];
    for (const lang of ["ar", "en"] as const) {
      const file = await writeXlsxFile(employeeSheetData(employees, lang, lang === "ar" ? "الحد الأدنى" : "minimum")).toBuffer();
      const [sheet] = await readXlsxFile(file);
      const result = readEmployeeSheet(sheet.data as SheetCell[][], employees, schedules);
      expect(result.ok && [result.updates, result.unchanged, result.problems]).toEqual([[], 3, []]);
      // The CPR keeps its leading zero
      expect(sheet.data[1][0]).toBe("010101010");
    }
  });

  it("needs a CPR column", () => {
    expect(readEmployeeSheet([["Name", "Grade"], ["x", 1]], [], schedules)).toEqual({ ok: false, error: "no_header" });
  });
});
