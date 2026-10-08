import type { ImportDeleted, ImportResult } from "../../core/api.ts";
import { monthOf, monthsBetween } from "../../core/time.ts";
import { summarizeTimecard, type TimecardRow } from "../../core/timecard.ts";
import { transaction, type Db } from "../db/database.ts";
import { HttpError, notFound } from "../http.ts";
import {
  addCoverage,
  addPunch,
  addPunchIssue,
  createImport,
  deleteImportData,
  getImport,
  setImportPunchesAdded,
} from "../store/attendance.ts";
import { logAction } from "../store/audit.ts";
import { matchEmployeeIds, removeUnusedEmployees, upsertFromImport } from "../store/employees.ts";
import { isLocked } from "../store/locks.ts";

export interface ImportPayload {
  fileName: string;
  /** The period the export covers. Days in it without punches count as absent. */
  from: string;
  to: string;
  rows: TimecardRow[];
}

function assertUnlocked(db: Db, months: Iterable<string>): void {
  const locked = [...months].filter((m) => isLocked(db, m));
  if (locked.length) throw new HttpError(409, "month_locked", locked.join(", "));
}

export function importTimecard(db: Db, userId: number, payload: ImportPayload): ImportResult {
  const { fileName, from, to } = payload;
  if (from > to) throw new HttpError(400, "invalid_period");

  const months = new Set(monthsBetween(from, to));
  for (const r of payload.rows) months.add(monthOf(r.date));
  assertUnlocked(db, months);

  const known = matchEmployeeIds(db, payload.rows.map((r) => r.employeeId));
  const rows = payload.rows.map((r) => ({ ...r, employeeId: known.get(r.employeeId) ?? r.employeeId }));
  const employees = summarizeTimecard(rows);

  return transaction(db, () => {
    const importId = createImport(db, { fileName, userId, from, to, rowCount: rows.length, employeeCount: employees.length });

    let newEmployees = 0;
    for (const e of employees) {
      if (upsertFromImport(db, { id: e.employeeId, name: e.name, department: e.department }) === "new") newEmployees++;
      addCoverage(db, importId, e.employeeId, { from, to });
    }

    let punchesAdded = 0;
    let punchesExisting = 0;
    let unreadable = 0;
    for (const r of rows) {
      for (const t of r.times) {
        if (addPunch(db, r.employeeId, r.date, t, importId)) punchesAdded++;
        else punchesExisting++;
      }
      for (const raw of r.invalid) {
        addPunchIssue(db, r.employeeId, r.date, raw, importId);
        unreadable++;
      }
    }
    setImportPunchesAdded(db, importId, punchesAdded);

    const result = { importId, employees: employees.length, newEmployees, punchesAdded, punchesExisting, unreadable };
    logAction(db, userId, "import.create", fileName, { from, to, ...result });
    return result;
  });
}

/**
 * Undo an import that was wrong: its punches, its period and the employees only it added go.
 * HR's records (excuses, leave, typed times) stay. Not in an approved month.
 */
export function deleteImport(db: Db, userId: number, importId: number): ImportDeleted {
  const record = getImport(db, importId);
  if (!record) throw notFound("import_not_found");
  assertUnlocked(db, record.months);

  return transaction(db, () => {
    const { employeeIds, punchesRemoved } = deleteImportData(db, importId);
    const employeesRemoved = removeUnusedEmployees(db, employeeIds);
    const result = { punchesRemoved, employeesRemoved };
    logAction(db, userId, "import.delete", record.fileName, { importId, ...result });
    return result;
  });
}
