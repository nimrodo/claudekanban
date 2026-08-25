import type { JSX } from "react";
import type { SessionStatus } from "../lib/transport/Transport.js";
import type { LaneSort } from "./laneOrder.js";

const STATUS_ORDER: SessionStatus[] = ["running", "waiting", "queued", "done", "failed"];

const SORT_OPTIONS: { value: LaneSort; label: string }[] = [
  { value: "activity", label: "activity" },
  { value: "name", label: "name" },
  { value: "sessions", label: "sessions" },
];

export function FleetBar({
  counts,
  sort,
  onSortChange,
}: {
  counts: Record<SessionStatus, number>;
  sort: LaneSort;
  onSortChange: (sort: LaneSort) => void;
}): JSX.Element {
  return (
    <div className="fleet-bar">
      <div className="fleet-bar-brand">
        <span className="fleet-bar-logo" aria-hidden="true" />
        <span className="fleet-bar-wordmark">claudekanban</span>
      </div>
      <span className="fleet-bar-divider" aria-hidden="true" />
      <div className="fleet-bar-counters">
        {STATUS_ORDER.map((status) => (
          <div key={status} className="fleet-bar-counter" data-status={status}>
            <span className="fleet-bar-counter-dot" data-status={status} />
            <span className="fleet-bar-counter-count">{counts[status]}</span>
            <span className="fleet-bar-counter-label">{status}</span>
          </div>
        ))}
      </div>
      <div className="fleet-bar-sort">
        <span className="fleet-bar-sort-label">sort</span>
        <div className="fleet-bar-sort-options">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="fleet-bar-sort-option"
              data-active={sort === option.value}
              onClick={() => onSortChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
