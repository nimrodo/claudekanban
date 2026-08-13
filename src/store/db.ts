import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
  db.exec(schema);
  migrateSessionColumns(db);
  return db;
}

// CREATE TABLE IF NOT EXISTS doesn't retrofit new columns onto an existing on-disk DB —
// there's no migration runner in this project, so guard each new column here.
export function migrateSessionColumns(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(session)").all() as Array<{ name: string }>;
  if (!columns.some((c) => c.name === "last_activity_at")) {
    db.exec("ALTER TABLE session ADD COLUMN last_activity_at TEXT");
  }
  if (!columns.some((c) => c.name === "fail_reason")) {
    db.exec("ALTER TABLE session ADD COLUMN fail_reason TEXT");
  }
}
