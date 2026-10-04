import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { datesBetween, monthsBetween } from "../../core/time.ts";
import { transaction, type Db } from "../db/database.ts";
import { HttpError, notFound } from "../http.ts";
import { DateStr } from "../schemas.ts";
import { logAction } from "../store/audit.ts";
import { isLocked } from "../store/locks.ts";
import { deleteHolidays, listHolidays, setHoliday } from "../store/settings.ts";
import { currentUser } from "./guards.ts";

// Public holidays apply to every employee and every report. HR and administrators can set
// them; a locked month keeps its approved numbers, so its holidays cannot change.
const Range = z
  .object({ from: DateStr, to: DateStr })
  .refine((r) => r.from <= r.to, "invalid_period")
  .refine((r) => datesBetween(r.from, r.to).length <= 31, "period_too_long");

function assertUnlocked(db: Db, from: string, to: string): void {
  const locked = monthsBetween(from, to).filter((m) => isLocked(db, m));
  if (locked.length) throw new HttpError(409, "month_locked", locked.join(", "));
}

export function holidayRoutes(app: FastifyInstance, db: Db): void {
  app.get("/holidays", async () => listHolidays(db));

  // One holiday over one or more days, e.g. Eid from the 20th to the 22nd
  app.post("/holidays", async (req) => {
    const user = currentUser(req);
    const body = Range.and(z.object({ name: z.string().trim().min(1).max(80) })).parse(req.body);
    assertUnlocked(db, body.from, body.to);
    const dates = datesBetween(body.from, body.to);
    transaction(db, () => {
      for (const date of dates) setHoliday(db, date, body.name);
      logAction(db, user.id, "holiday.set", body.name, { ...body, days: dates.length });
    });
    return { days: dates.length };
  });

  app.delete("/holidays", async (req) => {
    const user = currentUser(req);
    const body = Range.parse(req.body);
    assertUnlocked(db, body.from, body.to);
    const removed = deleteHolidays(db, body.from, body.to);
    if (!removed) throw notFound("holiday_not_found");
    logAction(db, user.id, "holiday.delete", `${body.from} – ${body.to}`, { ...body, days: removed });
    return { days: removed };
  });
}
