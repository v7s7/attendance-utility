import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Role, User } from "../../core/api.ts";
import { all, one, run, type Db } from "../db/database.ts";

export type { Role, User };

interface UserRow {
  id: number;
  username: string;
  display_name: string;
  password_hash: string;
  role: Role;
  active: number;
}

const toUser = (r: UserRow): User => ({
  id: r.id,
  username: r.username,
  displayName: r.display_name,
  role: r.role,
  active: r.active === 1,
});

// ---- passwords: scrypt with a random salt, stored as scrypt$N$r$p$salt$hash

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1 };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, N, r, p, salt, hash] = stored.split("$");
  if (kind !== "scrypt") return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scryptAsync(password, Buffer.from(salt, "base64"), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return timingSafeEqual(actual, expected);
}

// ---- users

export function countUsers(db: Db): number {
  return one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM users")?.n ?? 0;
}

export function listUsers(db: Db): User[] {
  return all<UserRow>(db, "SELECT * FROM users ORDER BY display_name").map(toUser);
}

export function getUser(db: Db, id: number): User | null {
  const row = one<UserRow>(db, "SELECT * FROM users WHERE id = ?", id);
  return row ? toUser(row) : null;
}

export async function createUser(
  db: Db,
  u: { username: string; displayName: string; password: string; role: Role },
): Promise<User> {
  const hash = await hashPassword(u.password);
  const id = run(
    db,
    "INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)",
    u.username,
    u.displayName,
    hash,
    u.role,
  ).id;
  return getUser(db, id)!;
}

export async function updateUser(
  db: Db,
  id: number,
  patch: { displayName?: string; role?: Role; active?: boolean; password?: string },
): Promise<User | null> {
  const current = getUser(db, id);
  if (!current) return null;
  run(
    db,
    "UPDATE users SET display_name = ?, role = ?, active = ? WHERE id = ?",
    patch.displayName ?? current.displayName,
    patch.role ?? current.role,
    (patch.active ?? current.active) ? 1 : 0,
    id,
  );
  if (patch.password) run(db, "UPDATE users SET password_hash = ? WHERE id = ?", await hashPassword(patch.password), id);
  if (patch.active === false || patch.password) run(db, "DELETE FROM sessions WHERE user_id = ?", id);
  return getUser(db, id);
}

export function countActiveAdmins(db: Db): number {
  return one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1")?.n ?? 0;
}

/** The user for a username and password, or null. */
export async function checkLogin(db: Db, username: string, password: string): Promise<User | null> {
  const row = one<UserRow>(db, "SELECT * FROM users WHERE username = ?", username);
  if (!row || row.active !== 1) return null;
  return (await verifyPassword(password, row.password_hash)) ? toUser(row) : null;
}

// ---- sessions: the browser keeps a random token; only its hash is stored

const SESSION_DAYS = 7;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function createSession(db: Db, userId: number): string {
  const token = randomBytes(32).toString("base64url");
  run(
    db,
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', ?))",
    hashToken(token),
    userId,
    `+${SESSION_DAYS} days`,
  );
  run(db, "DELETE FROM sessions WHERE expires_at < datetime('now')");
  return token;
}

export function sessionUser(db: Db, token: string | undefined): User | null {
  if (!token) return null;
  const row = one<UserRow>(
    db,
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > datetime('now') AND u.active = 1`,
    hashToken(token),
  );
  return row ? toUser(row) : null;
}

export function deleteSession(db: Db, token: string | undefined): void {
  if (token) run(db, "DELETE FROM sessions WHERE token_hash = ?", hashToken(token));
}

export const SESSION_MAX_AGE_SEC = SESSION_DAYS * 24 * 3600;
