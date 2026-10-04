import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/database.ts";
import { HttpError } from "../http.ts";
import { logAction } from "../store/audit.ts";
import { checkLogin, createSession, deleteSession, SESSION_MAX_AGE_SEC } from "../store/users.ts";

export const SESSION_COOKIE = "au_session";

function startSession(db: Db, req: FastifyRequest, reply: FastifyReply, userId: number): void {
  reply.setCookie(SESSION_COOKIE, createSession(db, userId), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: req.protocol === "https",
    maxAge: SESSION_MAX_AGE_SEC,
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sign-in routes; these are reachable without a session. There is no sign-up:
 * IT creates the first administrator with `npm run create-user`, and
 * administrators add everyone else from the Users page.
 */
export function authRoutes(app: FastifyInstance, db: Db): void {
  app.get("/auth/status", async (req) => ({ user: req.user }));

  app.post("/auth/login", async (req, reply) => {
    const body = z.object({ username: z.string().max(80), password: z.string().max(200) }).parse(req.body);
    const user = await checkLogin(db, body.username.trim(), body.password);
    if (!user) {
      await sleep(400); // slows down password guessing
      throw new HttpError(401, "login_failed");
    }
    logAction(db, user.id, "auth.login");
    startSession(db, req, reply, user.id);
    return { user };
  });

  app.post("/auth/logout", async (req, reply) => {
    deleteSession(db, req.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });
}
