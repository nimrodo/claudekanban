import type { SessionDto, SessionStatus } from "../lib/transport/Transport.js";

const STATUSES: SessionStatus[] = ["queued", "running", "waiting", "done", "failed"];

export function countByStatus(sessions: SessionDto[]): Record<SessionStatus, number> {
  const counts = Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<
    SessionStatus,
    number
  >;
  for (const session of sessions) {
    counts[session.status]++;
  }
  return counts;
}
