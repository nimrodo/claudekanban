import { useEffect, useRef, useState } from "react";
import type { SessionDetailResponse, SessionDto, SessionStatus } from "../lib/transport/Transport.js";
import { buildTimeline, type TimelineEntry } from "./eventSummary.js";
import { TimelineIcon } from "./TimelineIcon.js";
import { cwdLabel } from "../board/laneOrder.js";
import { formatElapsed } from "../board/formatElapsed.js";
import "./attachPane.css";

/**
 * The amber-rail / running-subagent-detection algorithm (spec's flagged open
 * design question). `TimelineEntry` alone can't tell us which live children a
 * given `spawn` entry "produced" — there's no id linkage in the event payload
 * shape available here. Rather than fabricate a correlation the data can't
 * prove, we attribute ALL live children collectively to the MOST RECENT spawn
 * entry only. Known simplification: if an older spawn entry happens to still
 * have live children in some edge case (overlapping Task calls), it is not
 * marked active by this algorithm.
 */
export function isMostRecentSpawnEntry(entry: TimelineEntry, timeline: TimelineEntry[]): boolean {
  const mostRecentSpawn = timeline.find((e) => e.iconKind === "spawn");
  return mostRecentSpawn?.id === entry.id;
}

export function isEntryActive(
  entry: TimelineEntry,
  timeline: TimelineEntry[],
  children: SessionDto[],
  sessionStatus: SessionStatus
): boolean {
  if (entry.iconKind === "spawn") {
    return isMostRecentSpawnEntry(entry, timeline) && children.some((c) => c.status === "running");
  }
  return timeline[0]?.id === entry.id && sessionStatus === "running";
}

function subagentDuration(child: SessionDto, now: number): string {
  if (child.status === "running") {
    return formatElapsed(now - Date.parse(child.startedAt));
  }
  const endMs = Date.parse(child.endedAt ?? child.startedAt);
  return formatElapsed(endMs - Date.parse(child.startedAt));
}

function SubagentRow({ child, now, raised }: { child: SessionDto; now: number; raised: boolean }) {
  return (
    <div className="subagent-row" data-raised={raised} data-status={child.status}>
      <div className="subagent-row-main">
        <span className="subagent-row-dot" data-status={child.status} />
        <span className="subagent-row-owner">{child.owner}</span>
        <span className="subagent-row-spacer" />
        <span className="subagent-row-duration">{subagentDuration(child, now)}</span>
      </div>
      {raised && (
        <div className="subagent-progress-track">
          <div className="subagent-progress-fill" />
        </div>
      )}
      {raised && child.lastActivitySummary && (
        <div className="subagent-row-activity">{child.lastActivitySummary}</div>
      )}
    </div>
  );
}

export function AttachPane({
  detail,
  loading,
  error,
  onClose,
  liveChildrenByParent,
  now,
}: {
  detail: SessionDetailResponse | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  liveChildrenByParent: Map<string, SessionDto[]>;
  now: number;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const headerRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<Element | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    headerRef.current?.focus();
    return () => {
      if (previouslyFocused.current instanceof HTMLElement) {
        previouslyFocused.current.focus();
      }
      previouslyFocused.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleExpanded(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const timeline = detail ? buildTimeline(detail.events) : [];
  const children = detail ? liveChildrenByParent.get(detail.session.id) ?? [] : [];

  const statusTs = detail
    ? detail.session.status === "running" || detail.session.status === "waiting"
      ? detail.session.startedAt
      : detail.session.endedAt ?? detail.session.startedAt
    : null;

  return (
    <aside className="attach-pane" role="complementary" aria-label="Attached session">
      <div className="attach-pane-header" ref={headerRef} tabIndex={-1}>
        {detail && (
          <div className="attach-pane-status-line">
            <span className="attach-pane-status-dot" data-status={detail.session.status} />
            <span className="attach-pane-status-text" data-status={detail.session.status}>
              {detail.session.status.toUpperCase()}
              {statusTs ? ` · ${formatElapsed(now - Date.parse(statusTs))}` : ""}
            </span>
            <span className="attach-pane-spacer" />
            <span className="attach-pane-esc-hint">esc to detach</span>
          </div>
        )}
        <div className="attach-pane-title">
          {detail ? detail.session.title ?? cwdLabel(detail.session.cwd) : "Session detail"}
        </div>
        {detail && (
          <div className="attach-pane-meta">
            <span>{cwdLabel(detail.session.cwd)}</span>
            <span>{detail.events.length} events</span>
            <span>{detail.session.model ?? "—"}</span>
          </div>
        )}
      </div>

      {loading && !detail && <div className="attach-pane-loading">Loading…</div>}
      {error && !detail && (
        <div className="attach-pane-error">
          <p>Couldn't load this session.</p>
          <p>{error}</p>
        </div>
      )}
      {detail && (
        <>
          {detail.session.status === "done" && detail.session.recap && (
            <div className="attach-pane-recap">
              <h3>Recap</h3>
              <p>{detail.session.recap}</p>
            </div>
          )}

          {detail.session.status === "failed" && detail.session.failReason && (
            <div className="attach-pane-fail-reason">
              <h3>Failure reason</h3>
              <pre className="timeline-raw">{detail.session.failReason}</pre>
            </div>
          )}

          <div className="attach-pane-timeline">
            <div className="attach-pane-timeline-label">TIMELINE</div>
            {timeline.map((entry) => {
              const active = isEntryActive(entry, timeline, children, detail.session.status);
              return (
                <div key={entry.id} className="timeline-entry">
                  <div className="timeline-row">
                    <span className="timeline-icon-tile" data-active={active}>
                      <TimelineIcon kind={entry.iconKind} />
                    </span>
                    <span className="timeline-connector" data-active={active} />
                    <span className="timeline-ts">{entry.ts}</span>
                    <span className="timeline-summary">{entry.summary}</span>
                    {entry.count > 1 && <span className="timeline-count">×{entry.count}</span>}
                    <button type="button" className="timeline-toggle" onClick={() => toggleExpanded(entry.id)}>
                      {expanded.has(entry.id) ? "Hide raw" : "Show raw"}
                    </button>
                  </div>
                  {expanded.has(entry.id) && (
                    <pre className="timeline-raw">
                      {JSON.stringify(entry.raw.length === 1 ? entry.raw[0] : entry.raw, null, 2)}
                    </pre>
                  )}
                  {entry.iconKind === "spawn" && children.length > 0 && (
                    <>
                      <div className="subagent-group-header">Task · {children.length} subagents</div>
                      <div className="subagent-group">
                        {children.map((child) => (
                          <SubagentRow
                            key={child.id}
                            child={child}
                            now={now}
                            raised={child.status === "running"}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </aside>
  );
}
