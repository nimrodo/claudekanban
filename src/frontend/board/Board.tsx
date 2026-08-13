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

function fraction(visible: number, total: number): string {
  return visible === total ? `${total}` : `${visible}/${total}`;
}

function visibleCountByStatus(
  topLevel: SessionDto[],
  childrenByParent: GroupedSessions["childrenByParent"],
  filter: SessionStatus | null
): Record<SessionStatus, number> {
  const counts = Object.fromEntries(STATUS_COLUMNS.map((status) => [status, 0])) as Record<
    SessionStatus,
    number
  >;
  for (const s of topLevel) {
    if (!matchesFilter(s, filter, childrenByParent)) continue;
    counts[s.status]++;
    for (const child of childrenByParent.get(s.id) ?? []) {
      counts[child.status]++;
    }
  }
  return counts;
}

export function Board({ sessions, onSelect }: { sessions: SessionDto[]; onSelect: (id: string) => void }) {
  const { topLevel, childrenByParent } = groupSessions(sessions);
  const counts = countByStatus(sessions);
  const [statusFilter, setStatusFilter] = useState<SessionStatus | null>(null);
  const visibleCounts = visibleCountByStatus(topLevel, childrenByParent, statusFilter);

  return (
    <>
      <div className="status-strip" role="group" aria-label="Filter by status">
        {STATUS_COLUMNS.map((status) => (
          <button
            key={status}
            type="button"
            data-status={status}
            data-empty={counts[status] === 0 ? "true" : undefined}
            aria-pressed={statusFilter === status}
            onClick={() => setStatusFilter((current) => (current === status ? null : status))}
          >
            {status} {fraction(visibleCounts[status], counts[status])}
          </button>
        ))}
      </div>
      <div className="board">
        {STATUS_COLUMNS.map((status) => (
          <div key={status} className="column" data-status={status}>
            {(() => {
              const columnTotal = topLevel.filter((s) => s.status === status);
              const columnSessions = columnTotal.filter((s) => matchesFilter(s, statusFilter, childrenByParent));
              return (
                <>
                  <div className="column-header">
                    <h2>{status}</h2>
                    <span className="column-count">{fraction(columnSessions.length, columnTotal.length)}</span>
                  </div>
                  {columnSessions.length === 0 ? (
                    <div className="column-empty">—</div>
                  ) : (
                    columnSessions.map((s) => (
                      <SessionCard
                        key={s.id}
                        session={s}
                        onSelect={onSelect}
                        children={childrenByParent.get(s.id) ?? []}
                      />
                    ))
                  )}
                </>
              );
            })()}
          </div>
        ))}
      </div>
    </>
  );
}
