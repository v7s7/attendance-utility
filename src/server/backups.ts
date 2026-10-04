import fs from "node:fs";
import path from "node:path";
import { localToday } from "../core/time.ts";
import type { Db } from "./db/database.ts";

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10-04-1206" in local time, used in backup file names. */
export function backupStamp(now = new Date()): string {
  return `${localToday(now)}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

/** Write a consistent copy of the database to `file`, even while the app is running. */
export function copyDatabase(db: Db, file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.rmSync(file, { force: true });
  db.prepare("VACUUM INTO ?").run(file);
}

/** Save a backup into `dir` (e.g. attendance-2026-10-04-1206.db) and keep only the newest `keep`. */
export function backupNow(db: Db, dir: string, keep: number): string {
  const file = path.join(dir, `attendance-${backupStamp()}.db`);
  copyDatabase(db, file);

  const old = fs
    .readdirSync(dir)
    .filter((f) => /^attendance-\d{4}-\d{2}-\d{2}-\d{4}\.db$/.test(f))
    .sort()
    .slice(0, -keep);
  for (const f of old) fs.rmSync(path.join(dir, f), { force: true });
  return file;
}

/** Make one backup a day: at start-up if today has none yet, then checking every hour. */
export function scheduleDailyBackups(db: Db, dir: string, keep: number, log: (message: string) => void): void {
  const check = () => {
    try {
      const today = `attendance-${localToday()}-`;
      const exists = fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.startsWith(today));
      if (!exists) log(`Backup saved: ${backupNow(db, dir, keep)}`);
    } catch (error) {
      log(`Backup failed: ${(error as Error).message}`);
    }
  };
  check();
  setInterval(check, 60 * 60 * 1000).unref();
}
