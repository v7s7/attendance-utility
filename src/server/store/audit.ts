import type { AuditEntry } from "../../core/api.ts";
import { all, run, type Db } from "../db/database.ts";

/** Record who changed what. `action` is a short code such as "adjustment.set". */
export function logAction(db: Db, userId: number | null, action: string, target = "", details: object = {}): void {
  run(db, "INSERT INTO audit_log (user_id, action, target, details) VALUES (?, ?, ?, ?)", userId, action, target, JSON.stringify(details));
}

export function listAudit(db: Db, limit = 300): AuditEntry[] {
  return all<Omit<AuditEntry, "details"> & { details: string }>(
    db,
    `SELECT a.id, a.at, COALESCE(u.display_name, '') AS userName, a.action, a.target, a.details
       FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.id DESC LIMIT ?`,
    limit,
  ).map((r) => ({ ...r, details: JSON.parse(r.details) as Record<string, unknown> }));
}
