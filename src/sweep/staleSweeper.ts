import type Database from "better-sqlite3";
import { getSession, listRunningSessionActivity } from "../store/sessionStore.js";
import { applySessionChange } from "../store/applyChange.js";
import { findStaleSessionIds } from "../domain/staleSweep.js";

export function runStaleSweep(db: Database.Database, nowIso: string, timeoutMinutes: number): void {
  const candidates = listRunningSessionActivity(db);
  const staleIds = findStaleSessionIds(candidates, nowIso, timeoutMinutes);
  for (const id of staleIds) {
    const existing = getSession(db, id);
    if (!existing) continue;
    const updated = {
      ...existing,
      status: "failed" as const,
      endedAt: nowIso,
      failReason: `No activity for ${timeoutMinutes} minutes`,
    };
    applySessionChange(db, updated, nowIso);
  }
}
