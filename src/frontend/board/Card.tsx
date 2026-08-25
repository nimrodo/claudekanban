import type { JSX, KeyboardEvent } from "react";
import type { SessionDto } from "../lib/transport/Transport.js";
import { formatElapsed } from "./formatElapsed.js";
import { SubagentChips } from "./SubagentChips.js";

export function handleActivateKey(e: KeyboardEvent, onActivate: () => void) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    onActivate();
  }
}

export interface CardProps {
  session: SessionDto;
  children: SessionDto[]; // subagents, for chip rendering only
  now: number; // ms epoch, for elapsed computation; ticked at Board level
  selected: boolean;
  onSelect: (id: string) => void;
  queuePosition?: number; // 1-based index within the queued column, only meaningful for status="queued"
}

export function Card({ session, children, now, selected, onSelect, queuePosition }: CardProps): JSX.Element {
  const activate = () => onSelect(session.id);

  return (
    <div
      className="lane-card"
      data-status={session.status}
      data-selected={selected}
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={(e) => handleActivateKey(e, activate)}
    >
      {renderBody(session, children, now, onSelect, queuePosition)}
    </div>
  );
}

function renderBody(
  session: SessionDto,
  children: SessionDto[],
  now: number,
  onSelect: (id: string) => void,
  queuePosition: number | undefined
): JSX.Element {
  switch (session.status) {
    case "running":
      return (
        <>
          <div className="lane-card-title">{session.title ?? session.cwd}</div>
          {session.lastActivitySummary && (
            <div className="lane-card-activity" title={session.lastActivitySummary}>
              {session.lastActivitySummary}
            </div>
          )}
          <div className="lane-card-footer">
            <span className="lane-card-elapsed">{formatElapsed(now - new Date(session.startedAt).getTime())}</span>
            <span className="lane-card-spacer" />
            <SubagentChips children={children} onSelect={onSelect} />
          </div>
        </>
      );
    case "waiting":
      return (
        <>
          <div className="lane-card-title">{session.title ?? session.cwd}</div>
          {session.lastActivitySummary && (
            <div className="lane-card-activity" title={session.lastActivitySummary}>
              {session.lastActivitySummary}
            </div>
          )}
          <div className="lane-card-footer">
            <span className="lane-card-blocked">
              blocked {formatElapsed(now - new Date(session.startedAt).getTime())}
            </span>
            <span className="lane-card-spacer" />
            {session.lastActivitySummary && (
              <span className="lane-card-activity-muted" title={session.lastActivitySummary}>
                {session.lastActivitySummary}
              </span>
            )}
          </div>
        </>
      );
    case "queued":
      return (
        <>
          <div className="lane-card-title">{session.title ?? session.cwd}</div>
          <div className="lane-card-meta">
            #{queuePosition ?? 1} · queued {formatElapsed(now - new Date(session.startedAt).getTime())}
          </div>
        </>
      );
    case "done": {
      const endedAtMs = session.endedAt ? new Date(session.endedAt).getTime() : now;
      const startedAtMs = new Date(session.startedAt).getTime();
      return (
        <>
          <div className="lane-card-title">{session.title ?? session.cwd}</div>
          <div className="lane-card-meta">{formatElapsed(endedAtMs - startedAtMs)}</div>
        </>
      );
    }
    case "failed":
      return (
        <>
          <div className="lane-card-title">{session.title ?? session.cwd}</div>
          {session.failReason && <div className="lane-card-fail-reason">{session.failReason}</div>}
        </>
      );
  }
}
