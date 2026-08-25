import type { JSX } from "react";
import type { SessionStatus } from "../lib/transport/Transport.js";
import type { Lane } from "./laneOrder.js";
import { LaneCell } from "./LaneCell.js";
import { handleActivateKey } from "./Card.js";

const COLUMN_ORDER: SessionStatus[] = ["queued", "running", "waiting", "done", "failed"];

export interface LaneRowProps {
  lane: Lane;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  now: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  expandedCells: Set<string>; // `${cwd}:${status}`, owned by Board
  onToggleExpandedCell: (cwd: string, status: SessionStatus) => void;
}

export function LaneRow({
  lane,
  collapsed,
  onToggleCollapsed,
  now,
  selectedId,
  onSelect,
  expandedCells,
  onToggleExpandedCell,
}: LaneRowProps): JSX.Element {
  return (
    <div className="lane-row" data-collapsed={collapsed}>
      <div className="lane-head-cell">
        <button
          type="button"
          className="lane-head-chevron"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand lane" : "Collapse lane"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapsed();
          }}
        >
          <span className="lane-head-chevron-glyph" aria-hidden="true" />
        </button>
        <div
          className="lane-head-info"
          role="button"
          tabIndex={0}
          onClick={onToggleCollapsed}
          onKeyDown={(e) => handleActivateKey(e, onToggleCollapsed)}
        >
          <div className="lane-head-name" title={lane.cwd}>
            {lane.label}
          </div>
          <div className="lane-head-sub">{lane.total} sessions</div>
        </div>
      </div>
      {collapsed ? (
        <div className="lane-collapsed-strip">
          {COLUMN_ORDER.filter((status) => lane.byStatus[status].length > 0).map((status) => (
            <div key={status} className="lane-collapsed-pill" data-status={status}>
              <span className="lane-collapsed-dot" data-status={status} />
              <span className="lane-collapsed-count">{lane.byStatus[status].length}</span>
            </div>
          ))}
        </div>
      ) : (
        COLUMN_ORDER.map((status) => {
          const cellKey = `${lane.cwd}:${status}`;
          return (
            <LaneCell
              key={status}
              status={status}
              sessions={lane.byStatus[status]}
              childrenByParent={lane.childrenByParent}
              now={now}
              selectedId={selectedId}
              onSelect={onSelect}
              expanded={expandedCells.has(cellKey)}
              onToggleExpanded={() => onToggleExpandedCell(lane.cwd, status)}
            />
          );
        })
      )}
    </div>
  );
}
