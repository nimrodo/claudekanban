import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
  db.exec(schema);
  return db;
}
