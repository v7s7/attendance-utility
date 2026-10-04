import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { dayRule } from "../../core/schedule.ts";
import { datesBetween, monthOf, monthsBetween } from "../../core/time.ts";
import type { Adjustment } from "../../core/types.ts";
import { transaction, type Db } from "../db/database.ts";
import { HttpError, notFound } from "../http.ts";
import { DateStr, ExcuseSchema, periodParams, TimeStr, WageSchema } from "../schemas.ts";
import { adjustmentsFor, deleteAdjustment, setAdjustment } from "../store/attendance.ts";
import { logAction } from "../store/audit.ts";
import { getEmployee, updateEmployee, type Employee } from "../store/employees.ts";
import { isLocked } from "../store/locks.ts";
import { getSchedule, listHolidays } from "../store/settings.ts";
import { employeeMonths, employeePeriod, employeeSchedule, listEmployeeViews } from "../services/reports.ts";
import { currentUser } from "./guards.ts";

const EmployeeUpdateBody = z
  .object({
    fullName: z.string().trim().max(120),
    employeeNo: z.string().trim().max(40),
    department: z.string().trim().max(120),
    scheduleId: z.number().int().nullable(),
    wage: WageSchema,
    active: z.boolean(),
  })
  .partial();

const AdjustmentBody = z.object({
  inTime: TimeStr.nullable(),
  outTime: TimeStr.nullable(),
  excuse: ExcuseSchema.nullable(),
  note: z.string().trim().max(300),
  absence: z.enum(["salary"]).nullable().optional(),
});

function loadEmployee(db: Db, params: unknown): Employee {
  const employee = getEmployee(db, String((params as { id: string }).id));
  if (!employee) throw notFound("employee_not_found");
  return employee;
}

function assertUnlocked(db: Db, months: string[]): void {
  const locked = months.filter((m) => isLocked(db, m));
  if (locked.length) throw new HttpError(409, "month_locked", locked.join(", "));
}

export function employeeRoutes(app: FastifyInstance, db: Db): void {
  app.get("/employees", async () => listEmployeeViews(db));

  // The months an employee has data for, newest first: their page opens on the latest
  app.get("/employees/:id/months", async (req) => employeeMonths(db, loadEmployee(db, req.params).id));

  // One employee over several months
  app.get("/employees/:id/period/:from/:to", async (req) => {
    const employee = loadEmployee(db, req.params);
    const { from, to } = periodParams(req.params);
    return employeePeriod(db, employee.id, from, to);
  });

  app.patch("/employees/:id", async (req) => {
    const user = currentUser(req);
    const employee = loadEmployee(db, req.params);
    const body = EmployeeUpdateBody.parse(req.body);

    if (body.scheduleId != null && !getSchedule(db, body.scheduleId)) throw notFound("schedule_not_found");
    const updated = updateEmployee(db, employee.id, body);
    logAction(db, user.id, "employee.update", employee.id, body);
    return updated;
  });

  // Many employees at once, from the employee sheet HR uploads; all or nothing
  app.post("/employees/bulk", async (req) => {
    const user = currentUser(req);
    const { updates } = z
      .object({ updates: z.array(z.object({ id: z.string().min(1).max(40), update: EmployeeUpdateBody })).min(1).max(5000) })
      .parse(req.body);

    for (const { id, update } of updates) {
      if (!getEmployee(db, id)) throw new HttpError(404, "employee_not_found", id);
      if (update.scheduleId != null && !getSchedule(db, update.scheduleId)) throw notFound("schedule_not_found");
    }
    transaction(db, () => {
      for (const { id, update } of updates) {
        updateEmployee(db, id, update);
        logAction(db, user.id, "employee.update", id, { ...update, source: "sheet" });
      }
    });
    return { updated: updates.length };
  });

  // HR's record for one day: times from the manual register, an excuse, a note.
  // An empty record removes it.
  app.put("/employees/:id/days/:date", async (req) => {
    const user = currentUser(req);
    const employee = loadEmployee(db, req.params);
    const date = DateStr.parse((req.params as { date: string }).date);
    assertUnlocked(db, [monthOf(date)]);

    const body: Adjustment = AdjustmentBody.parse(req.body);
    const empty = !body.inTime && !body.outTime && !body.excuse && !body.note && !body.absence;
    if (empty) deleteAdjustment(db, employee.id, date);
    else setAdjustment(db, employee.id, date, body, user.id);

    logAction(db, user.id, empty ? "adjustment.clear" : "adjustment.set", `${employee.id} ${date}`, body);
    return { ok: true };
  });

  // Record leave (e.g. annual leave from the 15th to the 25th) on every working day in a range
  app.post("/employees/:id/leave", async (req) => {
    const user = currentUser(req);
    const employee = loadEmployee(db, req.params);
    const body = z
      .object({ from: DateStr, to: DateStr, excuse: ExcuseSchema, note: z.string().trim().max(300) })
      .refine((b) => b.from <= b.to, "invalid_period")
      .refine((b) => datesBetween(b.from, b.to).length <= 120, "period_too_long")
      .parse(req.body);
    assertUnlocked(db, monthsBetween(body.from, body.to));

    const schedule = employeeSchedule(db, employee);
    const holidays = new Set(listHolidays(db, body.from, body.to).map((h) => h.date));
    const existing = adjustmentsFor(db, employee.id, body.from, body.to);
    const dates = datesBetween(body.from, body.to).filter((d) => dayRule(schedule, d) && !holidays.has(d));

    transaction(db, () => {
      for (const date of dates) {
        const keep = existing[date];
        setAdjustment(db, employee.id, date, {
          inTime: keep?.inTime ?? null,
          outTime: keep?.outTime ?? null,
          excuse: body.excuse,
          note: body.note || keep?.note || "",
        }, user.id);
      }
      logAction(db, user.id, "leave.set", employee.id, { ...body, days: dates.length });
    });
    return { days: dates.length };
  });
}
