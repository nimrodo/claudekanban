import type Database from "better-sqlite3";
import { upsertSession, touchSessionActivity, type Session } from "./sessionStore.js";
import { changeEmitter } from "../domain/changeEmitter.js";

export function applySessionChange(db: Database.Database, session: Session, ts: string, eventId?: number): void {
  upsertSession(db, session);
  touchSessionActivity(db, session.id, ts);
  changeEmitter.emit("session-changed", session, eventId);
}
