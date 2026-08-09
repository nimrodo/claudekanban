import type { SessionDto, SessionStatus } from "../lib/transport/Transport.js";
import { SessionCard } from "./SessionCard.js";
import "./board.css";

const STATUS_COLUMNS: SessionStatus[] = ["queued", "running", "waiting", "done", "failed"];

export function Board({ sessions, onSelect }: { sessions: SessionDto[]; onSelect: (id: string) => void }) {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  // A failed subagent is promoted to a top-level card in the "failed" column so its
  // failure is visible at column level, instead of being buried inside its parent's card.
  const isPromotedFailedChild = (s: SessionDto) => Boolean(s.parentSessionId) && byId.has(s.parentSessionId!) && s.status === "failed";
  const topLevel = sessions.filter((s) => (!s.parentSessionId || !byId.has(s.parentSessionId) || isPromotedFailedChild(s)));

  return (
    <div className="board">
      {STATUS_COLUMNS.map((status) => (
        <div key={status} className="column" data-status={status}>
          <h2>{status}</h2>
          {topLevel
            .filter((s) => s.status === status)
            .map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                onSelect={onSelect}
                children={isPromotedFailedChild(s) ? [] : sessions.filter((c) => c.parentSessionId === s.id && c.status !== "failed")}
              />
            ))}
        </div>
      ))}
    </div>
  );
}
