import type { JSX } from "react";
import { useMemo, useState } from "react";
import type { SessionDto, SessionStatus } from "../lib/transport/Transport.js";
import { buildLanes, type Lane, type LaneSort } from "./laneOrder.js";
import { countByStatus, STATUSES } from "./statusCounts.js";
import { useLocalStorageState } from "./useLocalStorageState.js";
import { FleetBar } from "./FleetBar.js";
import { LaneRow } from "./LaneRow.js";
import "./board.css";

function isHistoryOnly(lane: Lane): boolean {
  return (
    lane.byStatus.running.length === 0 &&
    lane.byStatus.waiting.length === 0 &&
    lane.byStatus.queued.length === 0
  );
}

export function Board({
  sessions,
  selectedId,
  onSelect,
  now,
}: {
  sessions: SessionDto[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  now: number;
}): JSX.Element {
  const [laneCollapsed, setLaneCollapsed] = useLocalStorageState<Record<string, boolean>>(
    "ck.swimlanes.collapsed",
    {}
  );
  const [laneSort, setLaneSort] = useLocalStorageState<LaneSort>("ck.swimlanes.sort", "activity");
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());

  const lanes = useMemo(() => buildLanes(sessions, laneSort), [sessions, laneSort]);
  const counts = useMemo(() => countByStatus(sessions), [sessions]);

  function toggleCollapsed(cwd: string) {
    setLaneCollapsed((prev) => {
      const lane = lanes.find((l) => l.cwd === cwd);
      const effective = prev[cwd] ?? (lane ? isHistoryOnly(lane) : false);
      return { ...prev, [cwd]: !effective };
    });
  }

  function toggleExpandedCell(cwd: string, status: SessionStatus) {
    const cellKey = `${cwd}:${status}`;
    setExpandedCells((prev) => {
      const next = new Set(prev);
      if (next.has(cellKey)) {
        next.delete(cellKey);
      } else {
        next.add(cellKey);
      }
      return next;
    });
  }

  return (
    <div className="board-shell">
      <FleetBar counts={counts} sort={laneSort} onSortChange={setLaneSort} />
      <div className="lane-header-row">
        <div className="lane-header-cell">PROJECT</div>
        {STATUSES.map((status) => (
          <div key={status} className="lane-header-cell" data-status={status}>
            {status} {counts[status]}
          </div>
        ))}
      </div>
      <div className="lane-stack">
        {lanes.map((lane) => (
          <LaneRow
            key={lane.cwd}
            lane={lane}
            collapsed={laneCollapsed[lane.cwd] ?? isHistoryOnly(lane)}
            onToggleCollapsed={() => toggleCollapsed(lane.cwd)}
            now={now}
            selectedId={selectedId}
            onSelect={onSelect}
            expandedCells={expandedCells}
            onToggleExpandedCell={toggleExpandedCell}
          />
        ))}
      </div>
    </div>
  );
}
