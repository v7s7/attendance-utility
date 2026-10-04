import type { LockInfo } from "../../core/api.ts";
import { all, one, run, type Db } from "../db/database.ts";

const LOCK_COLUMNS = `l.month, COALESCE(u.display_name, '') AS lockedBy, l.locked_at AS lockedAt
  FROM month_locks l LEFT JOIN users u ON u.id = l.locked_by`;

export function getLock(db: Db, month: string): LockInfo | null {
  return one<LockInfo>(db, `SELECT ${LOCK_COLUMNS} WHERE l.month = ?`, month) ?? null;
}

export function listLocks(db: Db): LockInfo[] {
  return all<LockInfo>(db, `SELECT ${LOCK_COLUMNS} ORDER BY l.month`);
}

/** The report stored when the month was locked. */
export function getSnapshot<T>(db: Db, month: string): T | null {
  const row = one<{ snapshot: string }>(db, "SELECT snapshot FROM month_locks WHERE month = ?", month);
  return row ? (JSON.parse(row.snapshot) as T) : null;
}

export function lockMonth(db: Db, month: string, userId: number, snapshot: unknown): void {
  run(db, "INSERT INTO month_locks (month, locked_by, snapshot) VALUES (?, ?, ?)", month, userId, JSON.stringify(snapshot));
}

export function unlockMonth(db: Db, month: string): boolean {
  return run(db, "DELETE FROM month_locks WHERE month = ?", month).changes > 0;
}

export function isLocked(db: Db, month: string): boolean {
  return one(db, "SELECT 1 FROM month_locks WHERE month = ?", month) !== undefined;
}
