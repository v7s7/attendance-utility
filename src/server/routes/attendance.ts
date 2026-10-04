import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { firstDayOfMonth, lastDayOfMonth, localToday } from "../../core/time.ts";
import type { Db } from "../db/database.ts";
import { HttpError, notFound } from "../http.ts";
import { DateStr, MonthStr, periodParams, TimecardRowSchema } from "../schemas.ts";
import { importTimecard } from "../services/imports.ts";
import { employeeMonthReport, freezeMonth, listMonths, monthOverview, monthReview, periodOverview } from "../services/reports.ts";
import { coverWholeMonth, listImports } from "../store/attendance.ts";
import { listAudit, logAction } from "../store/audit.ts";
import { getLock, unlockMonth } from "../store/locks.ts";
import { currentUser, requireAdmin } from "./guards.ts";

const monthParam = (params: unknown) => MonthStr.parse((params as { month: string }).month);

export function attendanceRoutes(app: FastifyInstance, db: Db): void {
  app.get("/imports", async () => listImports(db));

  app.post("/imports", async (req) => {
    const user = currentUser(req);
    const body = z
      .object({
        fileName: z.string().trim().min(1).max(300),
        from: DateStr,
        to: DateStr,
        rows: z.array(TimecardRowSchema).min(1).max(100_000),
      })
      .parse(req.body);
    return importTimecard(db, user.id, body);
  });

  app.get("/months", async () => listMonths(db));

  app.get("/months/:month", async (req) => monthOverview(db, monthParam(req.params)));

  app.get("/months/:month/review", async (req) => monthReview(db, monthParam(req.params)));

  // Everyone over several months
  app.get("/period/:from/:to", async (req) => {
    const { from, to } = periodParams(req.params);
    return periodOverview(db, from, to);
  });

  app.get("/months/:month/employees/:id", async (req) =>
    employeeMonthReport(db, String((req.params as { id: string }).id), monthParam(req.params)),
  );

  // HR confirms the BioTime files covered the whole month: working days without a punch
  // (not weekends or holidays) then count as absent instead of "no data"
  app.post("/months/:month/whole", async (req) => {
    const user = currentUser(req);
    const month = monthParam(req.params);
    if (getLock(db, month)) throw new HttpError(409, "month_locked");
    const today = localToday();
    const last = lastDayOfMonth(month) < today ? lastDayOfMonth(month) : today;
    const changed = coverWholeMonth(db, firstDayOfMonth(month), last);
    logAction(db, user.id, "month.cover", month, { employees: changed });
    return { employees: changed };
  });

  // Locking freezes the month as approved; nothing in it can change until it is unlocked
  app.post("/months/:month/lock", async (req) => {
    const admin = requireAdmin(req);
    const month = monthParam(req.params);
    if (getLock(db, month)) throw new HttpError(409, "month_locked");
    freezeMonth(db, month, admin.id);
    logAction(db, admin.id, "month.lock", month);
    return getLock(db, month);
  });

  app.delete("/months/:month/lock", async (req) => {
    const admin = requireAdmin(req);
    const month = monthParam(req.params);
    if (!unlockMonth(db, month)) throw notFound("month_not_locked");
    logAction(db, admin.id, "month.unlock", month);
    return { ok: true };
  });

  app.get("/audit", async (req) => {
    requireAdmin(req);
    return listAudit(db);
  });
}
