import type { Organization } from "../../core/api.ts";
import { DEFAULT_RULES } from "../../core/schedule.ts";
import type { Holiday, Rules, Schedule, ScheduleKind } from "../../core/types.ts";
import { all, one, run, type Db } from "../db/database.ts";

function getSetting<T>(db: Db, key: string, fallback: T): T {
  const row = one<{ value: string }>(db, "SELECT value FROM settings WHERE key = ?", key);
  return row ? (JSON.parse(row.value) as T) : fallback;
}

export function setSetting(db: Db, key: string, value: unknown): void {
  run(
    db,
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    key,
    JSON.stringify(value),
  );
}

/** Saved rules, with defaults for any option added after they were saved. */
export function getRules(db: Db): Rules {
  return { ...DEFAULT_RULES, ...getSetting<Partial<Rules>>(db, "rules", {}) };
}

export function getOrganization(db: Db): Organization {
  return { name: "", unit: "", ...getSetting<Partial<Organization>>(db, "organization", {}) };
}

export function getDefaultScheduleId(db: Db): number {
  return getSetting(db, "defaultScheduleId", 1);
}

interface ScheduleRow {
  id: number;
  name: string;
  kind: ScheduleKind;
  start: string;
  latest_start: string;
  hours: string;
}

const toSchedule = (r: ScheduleRow): Schedule => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  start: r.start,
  latestStart: r.latest_start,
  hours: JSON.parse(r.hours) as (string | null)[],
});

export function listSchedules(db: Db): Schedule[] {
  return all<ScheduleRow>(db, "SELECT * FROM schedules ORDER BY id").map(toSchedule);
}

export function getSchedule(db: Db, id: number): Schedule | null {
  const row = one<ScheduleRow>(db, "SELECT * FROM schedules WHERE id = ?", id);
  return row ? toSchedule(row) : null;
}

/** Insert when `id` is missing, otherwise update. Returns the id. */
export function saveSchedule(db: Db, s: Omit<Schedule, "id"> & { id?: number }): number {
  const values = [s.name, s.kind, s.start, s.latestStart, JSON.stringify(s.hours)] as const;
  if (s.id === undefined) {
    return run(db, "INSERT INTO schedules (name, kind, start, latest_start, hours) VALUES (?, ?, ?, ?, ?)", ...values).id;
  }
  run(db, "UPDATE schedules SET name = ?, kind = ?, start = ?, latest_start = ?, hours = ? WHERE id = ?", ...values, s.id);
  return s.id;
}

export function deleteSchedule(db: Db, id: number): boolean {
  return run(db, "DELETE FROM schedules WHERE id = ?", id).changes > 0;
}

export function listHolidays(db: Db, from = "0000-00-00", to = "9999-99-99"): Holiday[] {
  return all<Holiday>(db, "SELECT date, name FROM holidays WHERE date BETWEEN ? AND ? ORDER BY date", from, to);
}

export function setHoliday(db: Db, date: string, name: string): void {
  run(db, "INSERT INTO holidays (date, name) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET name = excluded.name", date, name);
}

/** Remove the holidays between two dates; returns how many days were removed. */
export function deleteHolidays(db: Db, from: string, to: string): number {
  return run(db, "DELETE FROM holidays WHERE date BETWEEN ? AND ?", from, to).changes;
}
