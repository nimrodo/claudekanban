import type { SessionDto, SessionStatus } from "../lib/transport/Transport.js";
import { SessionCard } from "./SessionCard.js";
import "./board.css";

const STATUS_COLUMNS: SessionStatus[] = ["queued", "running", "waiting", "done", "failed"];

export function Board({ sessions }: { sessions: SessionDto[] }) {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const topLevel = sessions.filter((s) => !s.parentSessionId || !byId.has(s.parentSessionId));

  return (
    <div className="board">
      {STATUS_COLUMNS.map((status) => (
        <div key={status} className="column">
          <h2>{status}</h2>
          {topLevel
            .filter((s) => s.status === status)
            .map((s) => (
              <SessionCard key={s.id} session={s} children={sessions.filter((c) => c.parentSessionId === s.id)} />
            ))}
        </div>
      ))}
    </div>
  );
}
