import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { backupStamp, copyDatabase } from "../backups.ts";
import type { Db } from "../db/database.ts";
import { HttpError, notFound } from "../http.ts";
import { RulesSchema, ScheduleSchema } from "../schemas.ts";
import { logAction } from "../store/audit.ts";
import {
  deleteSchedule,
  getDefaultScheduleId,
  getOrganization,
  getRules,
  getSchedule,
  listHolidays,
  listSchedules,
  saveSchedule,
  setSetting,
} from "../store/settings.ts";
import { requireAdmin } from "./guards.ts";

const idParam = (params: unknown) => z.coerce.number().int().parse((params as { id: string }).id);

export function settingsRoutes(app: FastifyInstance, db: Db): void {
  app.get("/settings", async () => ({
    rules: getRules(db),
    organization: getOrganization(db),
    defaultScheduleId: getDefaultScheduleId(db),
    schedules: listSchedules(db),
    holidays: listHolidays(db),
  }));

  app.put("/settings", async (req) => {
    const admin = requireAdmin(req);
    const body = z
      .object({
        rules: RulesSchema,
        organization: z.object({ name: z.string().trim().max(120), unit: z.string().trim().max(120) }),
        defaultScheduleId: z.number().int(),
      })
      .partial()
      .parse(req.body);

    if (body.defaultScheduleId !== undefined && !getSchedule(db, body.defaultScheduleId)) {
      throw notFound("schedule_not_found");
    }
    if (body.rules) setSetting(db, "rules", body.rules);
    if (body.organization) setSetting(db, "organization", body.organization);
    if (body.defaultScheduleId !== undefined) setSetting(db, "defaultScheduleId", body.defaultScheduleId);
    logAction(db, admin.id, "settings.update", "", body);
    return { ok: true };
  });

  app.post("/schedules", async (req) => {
    const admin = requireAdmin(req);
    const body = ScheduleSchema.parse(req.body);
    const id = saveSchedule(db, body);
    logAction(db, admin.id, "schedule.create", body.name, body);
    return getSchedule(db, id);
  });

  app.put("/schedules/:id", async (req) => {
    const admin = requireAdmin(req);
    const id = idParam(req.params);
    if (!getSchedule(db, id)) throw notFound("schedule_not_found");
    const body = ScheduleSchema.parse(req.body);
    saveSchedule(db, { ...body, id });
    logAction(db, admin.id, "schedule.update", body.name, body);
    return getSchedule(db, id);
  });

  app.delete("/schedules/:id", async (req) => {
    const admin = requireAdmin(req);
    const id = idParam(req.params);
    if (id === getDefaultScheduleId(db)) throw new HttpError(409, "schedule_is_default");
    const schedule = getSchedule(db, id);
    if (!schedule || !deleteSchedule(db, id)) throw notFound("schedule_not_found");
    logAction(db, admin.id, "schedule.delete", schedule.name);
    return { ok: true };
  });

  // Download a copy of the whole database (a .db file that SQLite tools can open)
  app.get("/backup", async (req, reply) => {
    const admin = requireAdmin(req);
    const name = `attendance-${backupStamp()}.db`;
    const file = path.join(os.tmpdir(), `${process.pid}-${Date.now()}-${name}`);
    copyDatabase(db, file);
    logAction(db, admin.id, "backup.download", name);

    const stream = fs.createReadStream(file);
    stream.on("close", () => fs.rm(file, { force: true }, () => undefined));
    reply.header("Content-Type", "application/octet-stream");
    reply.header("Content-Disposition", `attachment; filename="${name}"`);
    return reply.send(stream);
  });
}
