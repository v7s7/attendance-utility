import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/database.ts";
import { HttpError, notFound } from "../http.ts";
import { DisplayName, Password, RoleSchema, Username } from "../schemas.ts";
import { logAction } from "../store/audit.ts";
import {
  checkLogin,
  countActiveAdmins,
  createUser,
  getUser,
  listUsers,
  updateUser,
} from "../store/users.ts";
import { currentUser, requireAdmin } from "./guards.ts";

export function userRoutes(app: FastifyInstance, db: Db): void {
  // Any signed-in user can change their own password
  app.post("/account/password", async (req) => {
    const me = currentUser(req);
    const body = z.object({ current: z.string(), next: Password }).parse(req.body);
    if (!(await checkLogin(db, me.username, body.current))) throw new HttpError(400, "wrong_password");
    await updateUser(db, me.id, { password: body.next });
    logAction(db, me.id, "account.password");
    return { ok: true };
  });

  app.get("/users", async (req) => {
    requireAdmin(req);
    return listUsers(db);
  });

  app.post("/users", async (req) => {
    const admin = requireAdmin(req);
    const body = z
      .object({ username: Username, displayName: DisplayName, password: Password, role: RoleSchema })
      .parse(req.body);
    if (listUsers(db).some((u) => u.username.toLowerCase() === body.username.toLowerCase())) {
      throw new HttpError(409, "username_taken");
    }
    const user = await createUser(db, body);
    logAction(db, admin.id, "user.create", user.username, { role: user.role });
    return user;
  });

  app.patch("/users/:id", async (req) => {
    const admin = requireAdmin(req);
    const id = z.coerce.number().int().parse((req.params as { id: string }).id);
    const body = z
      .object({ displayName: DisplayName, role: RoleSchema, active: z.boolean(), password: Password })
      .partial()
      .parse(req.body);

    const target = getUser(db, id);
    if (!target) throw notFound("user_not_found");
    // Never leave the system without an active admin
    const losesAdmin = target.role === "admin" && target.active && (body.role === "hr" || body.active === false);
    if (losesAdmin && countActiveAdmins(db) <= 1) throw new HttpError(409, "last_admin");

    const user = await updateUser(db, id, body);
    const { password, ...changes } = body;
    logAction(db, admin.id, "user.update", target.username, { ...changes, passwordReset: Boolean(password) });
    return user;
  });
}
