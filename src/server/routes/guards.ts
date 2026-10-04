import type { FastifyRequest } from "fastify";
import { HttpError } from "../http.ts";
import type { User } from "../store/users.ts";

export function currentUser(req: FastifyRequest): User {
  if (!req.user) throw new HttpError(401, "login_required");
  return req.user;
}

export function requireAdmin(req: FastifyRequest): User {
  const user = currentUser(req);
  if (user.role !== "admin") throw new HttpError(403, "admin_only");
  return user;
}
