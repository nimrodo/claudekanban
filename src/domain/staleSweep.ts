import type { SessionStatus } from "../store/sessionStore.js";

export interface StaleCandidate {
  id: string;
  status: SessionStatus;
  lastActivityAt: string | null;
}

export function findStaleSessionIds(candidates: StaleCandidate[], nowIso: string, timeoutMinutes: number): string[] {
  const now = new Date(nowIso).getTime();
  const timeoutMs = timeoutMinutes * 60_000;
  return candidates
    .filter((c) => c.status === "running")
    .filter((c) => c.lastActivityAt === null || now - new Date(c.lastActivityAt).getTime() >= timeoutMs)
    .map((c) => c.id);
}
