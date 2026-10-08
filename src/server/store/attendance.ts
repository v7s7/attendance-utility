import type { ImportRecord } from "../../core/api.ts";
import { monthsBetween } from "../../core/time.ts";
import type { AbsenceDecision, Adjustment, DateRange, Excuse } from "../../core/types.ts";
import { all, one, run, type Db } from "../db/database.ts";

export function createImport(
  db: Db,
  i: { fileName: string; userId: number; from: string; to: string; rowCount: number; employeeCount: number },
): number {
  return run(
    db,
    `INSERT INTO imports (file_name, user_id, date_from, date_to, row_count, employee_count, punches_added)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
    i.fileName,
    i.userId,
    i.from,
    i.to,
    i.rowCount,
    i.employeeCount,
  ).id;
}

export function setImportPunchesAdded(db: Db, importId: number, count: number): void {
  run(db, "UPDATE imports SET punches_added = ? WHERE id = ?", count, importId);
}

export function listImports(db: Db, limit = 100): ImportRecord[] {
  return all<ImportRecord>(
    db,
    `SELECT i.id, i.file_name AS fileName, COALESCE(u.display_name, '') AS userName, i.created_at AS createdAt,
            i.date_from AS dateFrom, i.date_to AS dateTo, i.row_count AS rowCount,
            i.employee_count AS employeeCount, i.punches_added AS punchesAdded
       FROM imports i LEFT JOIN users u ON u.id = i.user_id
      ORDER BY i.id DESC LIMIT ?`,
    limit,
  );
}

export function addCoverage(db: Db, importId: number, employeeId: string, range: DateRange): void {
  run(db, "INSERT INTO coverage (import_id, employee_id, date_from, date_to) VALUES (?, ?, ?, ?)", importId, employeeId, range.from, range.to);
}

/** Returns true when the punch is new. */
export function addPunch(db: Db, employeeId: string, date: string, time: string, importId: number): boolean {
  run(db, "INSERT OR IGNORE INTO import_punches (import_id, employee_id, date, time) VALUES (?, ?, ?, ?)", importId, employeeId, date, time);
  return (
    run(db, "INSERT OR IGNORE INTO punches (employee_id, date, time, import_id) VALUES (?, ?, ?, ?)", employeeId, date, time, importId)
      .changes > 0
  );
}

export function addPunchIssue(db: Db, employeeId: string, date: string, raw: string, importId: number): void {
  run(db, "INSERT OR IGNORE INTO punch_issues (employee_id, date, raw, import_id) VALUES (?, ?, ?, ?)", employeeId, date, raw, importId);
}

export interface ImportInfo {
  fileName: string;
  /** Every month the import touches: its period and the dates of its punches. */
  months: string[];
}

export function getImport(db: Db, importId: number): ImportInfo | null {
  const row = one<{ fileName: string; dateFrom: string; dateTo: string }>(
    db,
    "SELECT file_name AS fileName, date_from AS dateFrom, date_to AS dateTo FROM imports WHERE id = ?",
    importId,
  );
  if (!row) return null;
  const months = new Set(monthsBetween(row.dateFrom, row.dateTo));
  for (const r of all<{ month: string }>(db, "SELECT DISTINCT substr(date, 1, 7) AS month FROM import_punches WHERE import_id = ?", importId)) {
    months.add(r.month);
  }
  return { fileName: row.fileName, months: [...months].sort() };
}

/**
 * Remove an import: its period, its unreadable times and the punches only it had. A punch
 * another import also had stays, credited to that import. Returns the employees it covered
 * and how many punches went.
 */
export function deleteImportData(db: Db, importId: number): { employeeIds: string[]; punchesRemoved: number } {
  const employeeIds = all<{ id: string }>(
    db,
    "SELECT employee_id AS id FROM coverage WHERE import_id = ? UNION SELECT employee_id FROM import_punches WHERE import_id = ?",
    importId,
    importId,
  ).map((r) => r.id);

  const otherSource = `FROM import_punches s WHERE s.import_id <> ? AND s.employee_id = punches.employee_id
                          AND s.date = punches.date AND s.time = punches.time`;
  const punchesRemoved = run(db, `DELETE FROM punches WHERE import_id = ? AND NOT EXISTS (SELECT 1 ${otherSource})`, importId, importId).changes;
  run(db, `UPDATE punches SET import_id = (SELECT MIN(s.import_id) ${otherSource}) WHERE import_id = ?`, importId, importId);
  // Its coverage, punch list and unreadable times go with it
  run(db, "DELETE FROM imports WHERE id = ?", importId);
  return { employeeIds, punchesRemoved };
}

export function coverageFor(db: Db, employeeId: string, from: string, to: string): DateRange[] {
  return all<DateRange>(
    db,
    "SELECT date_from AS 'from', date_to AS 'to' FROM coverage WHERE employee_id = ? AND date_from <= ? AND date_to >= ?",
    employeeId,
    to,
    from,
  );
}

export function punchesFor(db: Db, employeeId: string, from: string, to: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const r of all<{ date: string; time: string }>(
    db,
    "SELECT date, time FROM punches WHERE employee_id = ? AND date BETWEEN ? AND ? ORDER BY date, time",
    employeeId,
    from,
    to,
  )) {
    (out[r.date] ??= []).push(r.time);
  }
  return out;
}

export function issuesFor(db: Db, employeeId: string, from: string, to: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of all<{ date: string; n: number }>(
    db,
    "SELECT date, COUNT(*) AS n FROM punch_issues WHERE employee_id = ? AND date BETWEEN ? AND ? GROUP BY date",
    employeeId,
    from,
    to,
  )) {
    out[r.date] = r.n;
  }
  return out;
}

interface AdjustmentRow {
  date: string;
  in_time: string | null;
  out_time: string | null;
  excuse: Excuse | null;
  note: string;
  absence: AbsenceDecision | null;
}

export function adjustmentsFor(db: Db, employeeId: string, from: string, to: string): Record<string, Adjustment> {
  const out: Record<string, Adjustment> = {};
  for (const r of all<AdjustmentRow>(
    db,
    "SELECT date, in_time, out_time, excuse, note, absence FROM adjustments WHERE employee_id = ? AND date BETWEEN ? AND ?",
    employeeId,
    from,
    to,
  )) {
    out[r.date] = { inTime: r.in_time, outTime: r.out_time, excuse: r.excuse, note: r.note, absence: r.absence };
  }
  return out;
}

export function setAdjustment(db: Db, employeeId: string, date: string, a: Adjustment, userId: number): void {
  run(
    db,
    `INSERT INTO adjustments (employee_id, date, in_time, out_time, excuse, note, absence, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(employee_id, date) DO UPDATE SET in_time = excluded.in_time, out_time = excluded.out_time,
       excuse = excluded.excuse, note = excluded.note, absence = excluded.absence, updated_by = excluded.updated_by,
       updated_at = datetime('now')`,
    employeeId,
    date,
    a.inTime,
    a.outTime,
    a.excuse,
    a.note,
    a.absence ?? null,
    userId,
  );
}

/** Annual leave days recorded for an employee between two dates (e.g. this year so far). */
export function annualLeaveDays(db: Db, employeeId: string, from: string, to: string): number {
  return (
    one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM adjustments WHERE employee_id = ? AND excuse = 'annual' AND date BETWEEN ? AND ?", employeeId, from, to)
      ?.n ?? 0
  );
}

export function deleteAdjustment(db: Db, employeeId: string, date: string): boolean {
  return run(db, "DELETE FROM adjustments WHERE employee_id = ? AND date = ?", employeeId, date).changes > 0;
}

/** Employees with any attendance data or HR record between the two dates. */
export function employeesWithData(db: Db, from: string, to: string): string[] {
  return all<{ id: string }>(
    db,
    `SELECT employee_id AS id FROM coverage WHERE date_from <= ? AND date_to >= ?
     UNION SELECT employee_id FROM punches WHERE date BETWEEN ? AND ?
     UNION SELECT employee_id FROM adjustments WHERE date BETWEEN ? AND ?`,
    to,
    from,
    from,
    to,
    from,
    to,
  ).map((r) => r.id);
}

/**
 * HR confirms that the files of a month covered all of it, from `first` to `last`: every
 * import that touches the month is stretched to the whole month, so working days without a
 * punch count as absent instead of "no data". Returns how many employees' periods changed.
 */
export function coverWholeMonth(db: Db, first: string, last: string): number {
  run(
    db,
    `UPDATE imports SET date_from = MIN(date_from, ?), date_to = MAX(date_to, ?)
     WHERE id IN (SELECT import_id FROM coverage WHERE date_from <= ? AND date_to >= ?)`,
    first,
    last,
    last,
    first,
  );
  return run(
    db,
    "UPDATE coverage SET date_from = MIN(date_from, ?), date_to = MAX(date_to, ?) WHERE date_from <= ? AND date_to >= ?",
    first,
    last,
    last,
    first,
  ).changes;
}

/** Date ranges with data for one employee: imported periods, punches and HR records. */
export function employeeDataRanges(db: Db, employeeId: string): DateRange[] {
  return all<DateRange>(
    db,
    `SELECT date_from AS 'from', date_to AS 'to' FROM coverage WHERE employee_id = ?
     UNION SELECT MIN(date), MAX(date) FROM punches WHERE employee_id = ? GROUP BY substr(date, 1, 7)
     UNION SELECT MIN(date), MAX(date) FROM adjustments WHERE employee_id = ? GROUP BY substr(date, 1, 7)`,
    employeeId,
    employeeId,
    employeeId,
  ).filter((r) => r.from && r.to);
}

/** Every date range that has data, used to list the months HR can open. */
export function dataRanges(db: Db): DateRange[] {
  return all<DateRange>(
    db,
    `SELECT date_from AS 'from', date_to AS 'to' FROM coverage
     UNION SELECT MIN(date), MAX(date) FROM punches WHERE date IS NOT NULL GROUP BY substr(date, 1, 7)`,
  ).filter((r) => r.from && r.to);
}
