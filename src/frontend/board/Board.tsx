import type { SessionDto, SessionStatus } from "../lib/transport/Transport.js";
import { SessionCard } from "./SessionCard.js";
import { groupSessions } from "./groupSessions.js";
import { countByStatus } from "./statusCounts.js";
import "./board.css";

const STATUS_COLUMNS: SessionStatus[] = ["queued", "running", "waiting", "done", "failed"];

export function Board({ sessions, onSelect }: { sessions: SessionDto[]; onSelect: (id: string) => void }) {
  const { topLevel, childrenByParent } = groupSessions(sessions);
  const counts = countByStatus(sessions);

  return (
    <>
      <div className="status-strip" role="group" aria-label="Filter by status">
        {STATUS_COLUMNS.map((status) => (
          <button key={status} type="button" data-status={status}>
            {status} {counts[status]}
          </button>
        ))}
      </div>
      <div className="board">
        {STATUS_COLUMNS.map((status) => (
          <div key={status} className="column" data-status={status}>
            <h2>{status}</h2>
            {(() => {
              const columnSessions = topLevel.filter((s) => s.status === status);
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
