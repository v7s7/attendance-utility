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

/** CSV text: UTF-8 as BioTime writes it, or the Arabic Windows encoding Excel saves in. */
async function csvText(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1256").decode(bytes);
  }
}

/** The sheets of an uploaded .xlsx, or the one table of a .csv, as rows of cells. */
export async function readSpreadsheet(file: File): Promise<SheetCell[][][]> {
  if (file.name.toLowerCase().endsWith(".csv")) {
    return [Papa.parse<SheetCell[]>(await csvText(file), { skipEmptyLines: true }).data];
  }
  return (await readXlsxFile(file)).map((s) => s.data as SheetCell[][]);
}

/** Read an uploaded .xlsx or .csv and match it to the employees; the first sheet with a CPR column is used. */
export async function readUploadedSheet(file: File, employees: EmployeeView[], schedules: Schedule[]): Promise<SheetResult> {
  const sheets = await readSpreadsheet(file);
  let result: SheetResult = { ok: false, error: "no_header" };
  for (const rows of sheets) {
    result = readEmployeeSheet(rows, employees, schedules);
    if (result.ok) break;
  }
  return result;
}
