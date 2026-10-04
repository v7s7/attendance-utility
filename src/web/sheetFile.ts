// The employee Excel sheet as a file: writing the one HR downloads and reading the one they upload.
import Papa from "papaparse";
import readXlsxFile from "read-excel-file/browser";
import writeXlsxFile, { type SheetData } from "write-excel-file/browser";
import type { EmployeeView } from "../core/api.ts";
import { employeeSheetData, readEmployeeSheet, type SheetCell, type SheetResult } from "../core/employeeSheet.ts";
import type { Schedule } from "../core/types.ts";
import { WAGE_SCALES } from "../core/wageTables.ts";
import type { Lang, Translate } from "./i18n/context.ts";

/** The Excel sheet HR fills in: every employee with what is set today, and a page of instructions. */
export async function downloadEmployeeSheet(employees: EmployeeView[], schedules: Schedule[], lang: Lang, t: Translate): Promise<void> {
  const data: SheetData = employeeSheetData(employees, lang, t("wage.minimum"));
  const help: SheetData = [
    [{ value: t("sheet.helpName"), fontWeight: "bold" }],
    [t("sheet.help.1")],
    [t("sheet.help.2")],
    [""],
    [t("sheet.help.3")],
    ...schedules.map((s) => [`• ${s.name}`]),
    [""],
    [t("sheet.help.4")],
    ...WAGE_SCALES.map((s) => [`• ${lang === "ar" ? s.ar : s.en}`]),
    [""],
    [t("sheet.help.5")],
    [t("sheet.help.6")],
  ];

  await writeXlsxFile([
    {
      sheet: t("sheet.name"),
      data,
      columns: [14, 20, 30, 14, 26, 20, 30, 9, 12, 16].map((width) => ({ width })),
      rightToLeft: lang === "ar",
      stickyRowsCount: 1,
    },
    { sheet: t("sheet.helpName"), data: help, columns: [{ width: 110 }], rightToLeft: lang === "ar" },
  ]).toFile(`${t("sheet.fileName")}.xlsx`);
}

/** Read an uploaded .xlsx or .csv and match it to the employees; the first sheet with a CPR column is used. */
export async function readUploadedSheet(file: File, employees: EmployeeView[], schedules: Schedule[]): Promise<SheetResult> {
  let sheets: SheetCell[][][];
  if (file.name.toLowerCase().endsWith(".csv")) {
    const rows = await new Promise<SheetCell[][]>((resolve, reject) =>
      Papa.parse<SheetCell[]>(file, { skipEmptyLines: true, complete: (res) => resolve(res.data), error: reject }),
    );
    sheets = [rows];
  } else {
    sheets = (await readXlsxFile(file)).map((s) => s.data as SheetCell[][]);
  }
  let result: SheetResult = { ok: false, error: "no_header" };
  for (const rows of sheets) {
    result = readEmployeeSheet(rows, employees, schedules);
    if (result.ok) break;
  }
  return result;
}
