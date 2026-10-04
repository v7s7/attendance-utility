import fs from "node:fs";
import path from "node:path";
import fastifyCookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import Fastify, { LogController, type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import type { Db } from "./db/database.ts";
import { HttpError } from "./http.ts";
import { attendanceRoutes } from "./routes/attendance.ts";
import { authRoutes, SESSION_COOKIE } from "./routes/auth.ts";
import { employeeRoutes } from "./routes/employees.ts";
import { holidayRoutes } from "./routes/holidays.ts";
import { currentUser } from "./routes/guards.ts";
import { settingsRoutes } from "./routes/settings.ts";
import { userRoutes } from "./routes/users.ts";
import { sessionUser, type User } from "./store/users.ts";

declare module "fastify" {
  interface FastifyRequest {
    user: User | null;
  }
}

export interface AppOptions {
  /** Folder with the built web app (dist/web). Not served when missing. */
  webDir?: string;
  /** false, or Fastify logger options such as { level: "warn" } or { level: "info", file }. */
  logger?: boolean | { level: string; file?: string };
}

export async function buildApp(db: Db, { webDir, logger = false }: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger,
    bodyLimit: 25 * 1024 * 1024,
    // One line per request is noise in the terminal; errors are still logged
    logController: new LogController({ disableRequestLogging: true }),
  });

  await app.register(fastifyCookie);
  app.decorateRequest("user", null);
  app.addHook("onRequest", async (req) => {
    req.user = sessionUser(db, req.cookies[SESSION_COOKIE]);
  });

  app.addHook("onSend", async (_req, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "same-origin");
  });

  app.setErrorHandler((error, req, reply) => {
    if (error instanceof ZodError) {
      const issues = error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
      return reply.code(400).send({ error: "invalid_input", issues });
    }
    if (error instanceof HttpError) return reply.code(error.status).send({ error: error.code, message: error.message });

    const status = (error as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ error: "bad_request", message: (error as Error).message });

    req.log.error(error);
    return reply.code(500).send({ error: "server_error" });
  });

  await app.register(
    async (api) => {
      authRoutes(api, db);
      await api.register(async (secured) => {
        secured.addHook("preHandler", async (req) => {
          currentUser(req);
        });
        userRoutes(secured, db);
        settingsRoutes(secured, db);
        employeeRoutes(secured, db);
        holidayRoutes(secured, db);
        attendanceRoutes(secured, db);
      });
    },
    { prefix: "/api" },
  );

  const hasWeb = Boolean(webDir && fs.existsSync(path.join(webDir, "index.html")));
  if (hasWeb && webDir) {
    await app.register(fastifyStatic, {
      root: webDir,
      setHeaders: (reply, file) => {
        // Built assets have content hashes in their names, so they never change
        const immutable = file.includes(`${path.sep}assets${path.sep}`);
        reply.header("Cache-Control", immutable ? "public, max-age=31536000, immutable" : "no-cache");
      },
    });
  }

  // Unknown API paths are 404s; any other path loads the web app, which has its own pages
  app.setNotFoundHandler((req, reply) => {
    if (!hasWeb || req.url.startsWith("/api/") || req.method !== "GET") {
      return reply.code(404).send({ error: "not_found" });
    }
    reply.header("Cache-Control", "no-cache");
    return reply.sendFile("index.html");
  });

  return app;
}
