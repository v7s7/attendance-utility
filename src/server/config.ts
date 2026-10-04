import fs from "node:fs";
import path from "node:path";

/** The project folder: the nearest folder above this file that has package.json (works from src/ and dist/). */
function findRoot(dir: string): string {
  while (!fs.existsSync(path.join(dir, "package.json"))) {
    const parent = path.dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
  return dir;
}

const root = findRoot(import.meta.dirname);

// Optional settings in .env (see .env.example)
const envFile = path.join(root, ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

export const config = {
  port: Number(process.env.PORT ?? 8090),
  host: process.env.HOST ?? "0.0.0.0",
  /** The database is one file inside the project folder. */
  dbFile: path.resolve(root, process.env.DB_FILE ?? "data/attendance.db"),
  /** A copy of the database is saved here every day. */
  backupDir: path.resolve(root, process.env.BACKUP_DIR ?? "data/backups"),
  /** How many daily backups to keep. */
  backupKeep: Number(process.env.BACKUP_KEEP ?? 30),
  /** Write the server log to this file instead of the console. */
  logFile: process.env.LOG_FILE ? path.resolve(root, process.env.LOG_FILE) : null,
  webDir: path.resolve(root, "dist/web"),
};
