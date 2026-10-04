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

/** The name to show: the full name HR typed, else the exported name. */
export const displayName = (e: Pick<Employee, "fullName" | "name">) => e.fullName || e.name;
