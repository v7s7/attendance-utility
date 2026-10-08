import { DEFAULT_RULES, DEFAULT_SCHEDULES } from "../../core/schedule.ts";
import type { Db } from "./database.ts";

// Each migration runs once, in order. Never edit a released migration; add a new one.
const MIGRATIONS: ((db: Db) => void)[] = [
  (db) => {
    db.exec(`
      CREATE TABLE users (
        id            INTEGER PRIMARY KEY,
        username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
        display_name  TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role          TEXT NOT NULL CHECK (role IN ('admin', 'hr')),
        active        INTEGER NOT NULL DEFAULT 1,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL
      );

      CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE schedules (
        id           INTEGER PRIMARY KEY,
        name         TEXT NOT NULL,
        kind         TEXT NOT NULL CHECK (kind IN ('flexible', 'fixed', 'hours')),
        start        TEXT NOT NULL,
        latest_start TEXT NOT NULL,
        hours        TEXT NOT NULL -- JSON: required "HH:MM" per weekday, Sunday first, null = day off
      );

      CREATE TABLE holidays (
        date TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT ''
      );

      -- id is the Employee ID from the attendance system (the CPR)
      CREATE TABLE employees (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL DEFAULT '', -- as exported by the attendance system
        full_name   TEXT NOT NULL DEFAULT '',
        employee_no TEXT NOT NULL DEFAULT '',
        department  TEXT NOT NULL DEFAULT '',
        schedule_id INTEGER REFERENCES schedules(id) ON DELETE SET NULL,
        wage        TEXT NOT NULL DEFAULT '{}', -- JSON WageProfile
        active      INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE imports (
        id             INTEGER PRIMARY KEY,
        file_name      TEXT NOT NULL,
        user_id        INTEGER REFERENCES users(id),
        created_at     TEXT NOT NULL DEFAULT (datetime('now')),
        date_from      TEXT NOT NULL,
        date_to        TEXT NOT NULL,
        row_count      INTEGER NOT NULL,
        employee_count INTEGER NOT NULL,
        punches_added  INTEGER NOT NULL
      );

      -- The period each import covers for each employee in it; days outside every
      -- covered period show as "no data" rather than absent
      CREATE TABLE coverage (
        import_id   INTEGER NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
        employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        date_from   TEXT NOT NULL,
        date_to     TEXT NOT NULL,
        PRIMARY KEY (import_id, employee_id)
      );

      CREATE TABLE punches (
        employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        date        TEXT NOT NULL,
        time        TEXT NOT NULL, -- HH:MM:SS
        import_id   INTEGER REFERENCES imports(id) ON DELETE SET NULL,
        PRIMARY KEY (employee_id, date, time)
      ) WITHOUT ROWID;

      -- Time entries the export had that could not be read
      CREATE TABLE punch_issues (
        employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        date        TEXT NOT NULL,
        raw         TEXT NOT NULL,
        PRIMARY KEY (employee_id, date, raw)
      ) WITHOUT ROWID;

      CREATE TABLE adjustments (
        employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        date        TEXT NOT NULL,
        in_time     TEXT,
        out_time    TEXT,
        excuse      TEXT,
        note        TEXT NOT NULL DEFAULT '',
        updated_by  INTEGER REFERENCES users(id),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (employee_id, date)
      );

      -- A locked month is frozen exactly as approved: the report is stored as it was
      CREATE TABLE month_locks (
        month     TEXT PRIMARY KEY,
        locked_by INTEGER REFERENCES users(id),
        locked_at TEXT NOT NULL DEFAULT (datetime('now')),
        snapshot  TEXT NOT NULL
      );

      CREATE TABLE audit_log (
        id      INTEGER PRIMARY KEY,
        at      TEXT NOT NULL DEFAULT (datetime('now')),
        user_id INTEGER REFERENCES users(id),
        action  TEXT NOT NULL,
        target  TEXT NOT NULL DEFAULT '',
        details TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX audit_log_at ON audit_log(at);
    `);

    const addSchedule = db.prepare(
      "INSERT INTO schedules (name, kind, start, latest_start, hours) VALUES (?, ?, ?, ?, ?)",
    );
    for (const s of DEFAULT_SCHEDULES) addSchedule.run(s.name, s.kind, s.start, s.latestStart, JSON.stringify(s.hours));

    const setSetting = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
    setSetting.run("rules", JSON.stringify(DEFAULT_RULES));
    setSetting.run("organization", JSON.stringify({ name: "", unit: "" }));
    setSetting.run("defaultScheduleId", "1");
  },

  // A monthly allowance of 7:15 for databases that started with none
  (db) => {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'rules'").get() as { value: string } | undefined;
    if (!row) return;
    const rules = JSON.parse(row.value) as { allowanceHours?: number };
    if (!rules.allowanceHours) {
      db.prepare("UPDATE settings SET value = ? WHERE key = 'rules'").run(JSON.stringify({ ...rules, allowanceHours: 7.25 }));
    }
  },

  // HR's decision for an absent day: "salary" deducts it from the salary
  (db) => {
    db.exec("ALTER TABLE adjustments ADD COLUMN absence TEXT");
  },

  // Every punch each import had, including ones already there, so deleting an import keeps
  // the punches another import also had; and the import each unreadable time came from
  (db) => {
    db.exec(`
      CREATE TABLE import_punches (
        import_id   INTEGER NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
        employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        date        TEXT NOT NULL,
        time        TEXT NOT NULL,
        PRIMARY KEY (import_id, employee_id, date, time)
      ) WITHOUT ROWID;
      CREATE INDEX import_punches_punch ON import_punches(employee_id, date, time);
      INSERT INTO import_punches SELECT import_id, employee_id, date, time FROM punches WHERE import_id IS NOT NULL;

      ALTER TABLE punch_issues ADD COLUMN import_id INTEGER REFERENCES imports(id) ON DELETE CASCADE;
      UPDATE punch_issues SET import_id = (
        SELECT MIN(c.import_id) FROM coverage c
         WHERE c.employee_id = punch_issues.employee_id AND punch_issues.date BETWEEN c.date_from AND c.date_to
      );
    `);
  },
];

export function migrate(db: Db): void {
  db.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)");
  const row = db.prepare("SELECT version FROM schema_version").get() as { version: number } | undefined;
  let version = row?.version ?? 0;
  if (!row) db.exec("INSERT INTO schema_version (version) VALUES (0)");

  for (; version < MIGRATIONS.length; version++) {
    db.exec("BEGIN");
    try {
      MIGRATIONS[version](db);
      db.prepare("UPDATE schema_version SET version = ?").run(version + 1);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}
