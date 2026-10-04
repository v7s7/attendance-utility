import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { migrate } from "./migrations.ts";

export type Db = Database.Database;
type Param = string | number | bigint | Buffer | null;

/** Open (or create) the database file and bring its schema up to date. */
export function openDatabase(file: string): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  return db;
}

export function one<T>(db: Db, sql: string, ...params: Param[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function all<T>(db: Db, sql: string, ...params: Param[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

/** Run a write; returns how many rows changed and the new row id. */
export function run(db: Db, sql: string, ...params: Param[]): { changes: number; id: number } {
  const result = db.prepare(sql).run(...params);
  return { changes: result.changes, id: Number(result.lastInsertRowid) };
}

/** Run `fn` in a transaction: all of its writes are saved, or none are. */
export function transaction<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
