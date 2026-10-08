import type { WageProfile } from "../../core/types.ts";
import { all, one, run, type Db } from "../db/database.ts";

export interface Employee {
  /** Employee ID from the attendance system (the CPR). */
  id: string;
  /** Name as exported by the attendance system (usually the first name only). */
  name: string;
  fullName: string;
  employeeNo: string;
  department: string;
  /** null = the default schedule. */
  scheduleId: number | null;
  wage: WageProfile;
  active: boolean;
}

interface EmployeeRow {
  id: string;
  name: string;
  full_name: string;
  employee_no: string;
  department: string;
  schedule_id: number | null;
  wage: string;
  active: number;
}

const toEmployee = (r: EmployeeRow): Employee => ({
  id: r.id,
  name: r.name,
  fullName: r.full_name,
  employeeNo: r.employee_no,
  department: r.department,
  scheduleId: r.schedule_id,
  wage: JSON.parse(r.wage) as WageProfile,
  active: r.active === 1,
});

export function listEmployees(db: Db): Employee[] {
  return all<EmployeeRow>(
    db,
    "SELECT * FROM employees ORDER BY CASE full_name WHEN '' THEN name ELSE full_name END, id",
  ).map(toEmployee);
}

export function getEmployee(db: Db, id: string): Employee | null {
  const row = one<EmployeeRow>(db, "SELECT * FROM employees WHERE id = ?", id);
  return row ? toEmployee(row) : null;
}

export type EmployeePatch = Partial<Pick<Employee, "fullName" | "employeeNo" | "department" | "scheduleId" | "wage" | "active">>;

export function updateEmployee(db: Db, id: string, patch: EmployeePatch): Employee | null {
  const current = getEmployee(db, id);
  if (!current) return null;
  const next = { ...current, ...patch };
  run(
    db,
    `UPDATE employees SET full_name = ?, employee_no = ?, department = ?, schedule_id = ?, wage = ?, active = ?,
       updated_at = datetime('now') WHERE id = ?`,
    next.fullName,
    next.employeeNo,
    next.department,
    next.scheduleId,
    JSON.stringify(next.wage),
    next.active ? 1 : 0,
    id,
  );
  return next;
}

/** Add an employee seen in an import, or refresh the name the attendance system uses. */
export function upsertFromImport(db: Db, e: { id: string; name: string; department: string }): "new" | "existing" {
  const existing = getEmployee(db, e.id);
  if (!existing) {
    run(db, "INSERT INTO employees (id, name, department) VALUES (?, ?, ?)", e.id, e.name, e.department);
    return "new";
  }
  run(
    db,
    "UPDATE employees SET name = ?, department = CASE department WHEN '' THEN ? ELSE department END WHERE id = ?",
    e.name || existing.name,
    e.department,
    e.id,
  );
  return "existing";
}

/** An all-digit ID without its leading zeros; "" for other IDs. */
const digitsKey = (id: string) => (/^\d+$/.test(id) ? id.replace(/^0+/, "") : "");

/**
 * Excel drops the leading zero of IDs it saves as numbers: 010101010 becomes 10101010. For
 * each ID in a file written another way than the employee the app knows, the known ID.
 */
export function matchEmployeeIds(db: Db, ids: string[]): Map<string, string> {
  const known = all<{ id: string }>(db, "SELECT id FROM employees").map((r) => r.id);
  const exact = new Set(known);
  const byDigits = new Map<string, string | null>();
  for (const id of known) {
    const key = digitsKey(id);
    if (key) byDigits.set(key, byDigits.has(key) ? null : id); // null: two employees share it, so no guessing
  }

  const out = new Map<string, string>();
  for (const id of new Set(ids)) {
    const key = digitsKey(id);
    if (exact.has(id) || !key) continue;
    const match = byDigits.get(key);
    if (match) out.set(id, match);
    else if (match === undefined) byDigits.set(key, id); // the same person written both ways in one file
  }
  return out;
}

/** Remove employees that no longer have any attendance, HR record or detail HR typed. Returns how many went. */
export function removeUnusedEmployees(db: Db, ids: string[]): number {
  let removed = 0;
  for (const id of ids) {
    removed += run(
      db,
      `DELETE FROM employees
        WHERE id = ? AND full_name = '' AND employee_no = '' AND schedule_id IS NULL AND wage = '{}'
          AND NOT EXISTS (SELECT 1 FROM coverage WHERE employee_id = employees.id)
          AND NOT EXISTS (SELECT 1 FROM punches WHERE employee_id = employees.id)
          AND NOT EXISTS (SELECT 1 FROM adjustments WHERE employee_id = employees.id)`,
      id,
    ).changes;
  }
  return removed;
}

/** The name to show: the full name HR typed, else the exported name. */
export const displayName = (e: Pick<Employee, "fullName" | "name">) => e.fullName || e.name;
