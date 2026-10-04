import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildApp } from "./app.ts";
import { scheduleDailyBackups } from "./backups.ts";
import { config } from "./config.ts";
import { openDatabase } from "./db/database.ts";
import { countUsers } from "./store/users.ts";

if (config.logFile) fs.mkdirSync(path.dirname(config.logFile), { recursive: true });

const db = openDatabase(config.dbFile);
const app = await buildApp(db, {
  webDir: config.webDir,
  // Only warnings and errors in the terminal; everything when writing to a log file
  logger: config.logFile ? { level: "info", file: config.logFile } : { level: "warn" },
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await app.close();
    db.close();
    process.exit(0);
  });
}

await app.listen({ port: config.port, host: config.host });

const network = Object.values(os.networkInterfaces())
  .flat()
  .filter((n) => n && n.family === "IPv4" && !n.internal)
  .map((n) => `http://${n!.address}:${config.port}`);

console.log(`
  Attendance & Deductions is running
  Local:     http://localhost:${config.port}
  Network:   ${network.join("  ") || "-"}
  Database:  ${config.dbFile}
  Backups:   ${config.backupDir}
`);

if (countUsers(db) === 0) {
  console.log("  No accounts yet. Create the IT administrator with:");
  console.log("  npm run create-user -- <username> <password> <display name>\n");
}

scheduleDailyBackups(db, config.backupDir, config.backupKeep, (message) => console.log("  " + message));
