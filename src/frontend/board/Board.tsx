import { useState } from "react";
import type { SessionDto, SessionStatus } from "../lib/transport/Transport.js";
import { SessionCard } from "./SessionCard.js";
import { groupSessions, type GroupedSessions } from "./groupSessions.js";
import { countByStatus } from "./statusCounts.js";
import "./board.css";

const STATUS_COLUMNS: SessionStatus[] = ["queued", "running", "waiting", "done", "failed"];

function matchesFilter(session: SessionDto, filter: SessionStatus | null, childrenByParent: GroupedSessions["childrenByParent"]): boolean {
  if (!filter) return true;
  if (session.status === filter) return true;
  return (childrenByParent.get(session.id) ?? []).some((child) => child.status === filter);
}

export function Board({ sessions, onSelect }: { sessions: SessionDto[]; onSelect: (id: string) => void }) {
  const { topLevel, childrenByParent } = groupSessions(sessions);
  const counts = countByStatus(sessions);
  const [statusFilter, setStatusFilter] = useState<SessionStatus | null>(null);

  return (
    <>
      <div className="status-strip" role="group" aria-label="Filter by status">
        {STATUS_COLUMNS.map((status) => (
          <button
            key={status}
            type="button"
            data-status={status}
            aria-pressed={statusFilter === status}
            onClick={() => setStatusFilter((current) => (current === status ? null : status))}
          >
            {status} {counts[status]}
          </button>
        ))}
      </div>
      <div className="board">
        {STATUS_COLUMNS.map((status) => (
          <div key={status} className="column" data-status={status}>
            <h2>{status}</h2>
            {(() => {
              const columnSessions = topLevel
                .filter((s) => s.status === status)
                .filter((s) => matchesFilter(s, statusFilter, childrenByParent));
              if (columnSessions.length === 0) {
                return <div className="column-empty">—</div>;
              }
              return columnSessions.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  onSelect={onSelect}
                  children={childrenByParent.get(s.id) ?? []}
                />
              ));
            })()}
          </div>
        ))}
      </div>
    </>
  );
}
