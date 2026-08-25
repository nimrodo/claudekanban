import type { JSX } from "react";
import type { SessionDto, SessionStatus } from "../lib/transport/Transport.js";
import { Card } from "./Card.js";

const CAP = 5;

export interface LaneCellProps {
  status: SessionStatus;
  sessions: SessionDto[]; // already this lane's top-level sessions for this status, UNSORTED/UNCAPPED
  childrenByParent: Map<string, SessionDto[]>;
  now: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  expanded: boolean; // is this (lane,status) cell currently expanded past the cap?
  onToggleExpanded: () => void;
}

function sortForStatus(status: SessionStatus, sessions: SessionDto[]): SessionDto[] {
  const copy = [...sessions];

  if (status === "running" || status === "waiting") {
    copy.sort((a, b) => {
      const aTime = new Date(a.lastActivityAt ?? a.startedAt).getTime();
      const bTime = new Date(b.lastActivityAt ?? b.startedAt).getTime();
      return bTime - aTime; // descending
    });
  } else if (status === "queued") {
    copy.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()); // ascending
  } else {
    // done / failed: endedAt descending, nulls last
    copy.sort((a, b) => {
      const aTime = a.endedAt ? new Date(a.endedAt).getTime() : -Infinity;
      const bTime = b.endedAt ? new Date(b.endedAt).getTime() : -Infinity;
      return bTime - aTime;
    });
  }

  return copy;
}

export function LaneCell({
  status,
  sessions,
  childrenByParent,
  now,
  selectedId,
  onSelect,
  expanded,
  onToggleExpanded,
}: LaneCellProps): JSX.Element {
  const ordered = sortForStatus(status, sessions);
  const capped = status === "failed" ? false : ordered.length > CAP;
  const visible = capped && !expanded ? ordered.slice(0, CAP) : ordered;
  const hiddenCount = ordered.length - visible.length;

  return (
    <div className="lane-cell" data-status={status}>
      {visible.length === 0 && status !== "waiting" && <div className="lane-cell-empty">—</div>}
      {visible.map((session, index) => (
        <Card
          key={session.id}
          session={session}
          children={childrenByParent.get(session.id) ?? []}
          now={now}
          selected={selectedId === session.id}
          onSelect={onSelect}
          queuePosition={status === "queued" ? index + 1 : undefined}
        />
      ))}
      {capped && (
        <button type="button" className="lane-cell-overflow-toggle" onClick={onToggleExpanded}>
          {expanded ? "show less" : `+${hiddenCount} more`}
        </button>
      )}
    </div>
  );
}
