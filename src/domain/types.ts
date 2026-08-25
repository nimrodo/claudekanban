export type SessionStatus = "queued" | "running" | "waiting" | "done" | "failed";

export interface SessionShape {
  id: string;
  parentSessionId: string | null;
  owner: string;
  title: string | null;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  cwd: string;
  model: string | null;
  recap: string | null;
  failReason: string | null;
  lastActivitySummary: string | null;
  lastActivityAt: string | null;
}
