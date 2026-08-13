import { useEffect, useRef, useState } from "react";
import type { SessionDetailResponse } from "../lib/transport/Transport.js";
import { buildTimeline } from "./eventSummary.js";
import { TimelineIcon } from "./TimelineIcon.js";
import "./drawer.css";

export function Drawer({
  open,
  detail,
  loading,
  error,
  onClose,
}: {
  open: boolean;
  detail: SessionDetailResponse | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      previouslyFocused.current = document.activeElement;
      closeButtonRef.current?.focus();
    } else {
      if (previouslyFocused.current instanceof HTMLElement) {
        previouslyFocused.current.focus();
      }
      previouslyFocused.current = null;
    }
  }, [open]);

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

  return (
    <>
      <div className="drawer-overlay" data-open={open} onClick={onClose} />
      <aside
        className="drawer"
        data-open={open}
        aria-hidden={!open}
        role="dialog"
        aria-modal="true"
        aria-label="Session detail"
      >
        <div className="drawer-header">
          <div>
            <div className="drawer-title">
              {detail ? detail.session.title ?? detail.session.owner : "Session detail"}
            </div>
            {detail && <div className="drawer-subtitle">{detail.session.cwd}</div>}
          </div>
          <button
            type="button"
            className="drawer-close"
            onClick={onClose}
            aria-label="Close"
            ref={closeButtonRef}
          >
            ×
          </button>
        </div>

        {loading && !detail && <div className="drawer-loading">Loading…</div>}
        {error && !detail && (
          <div className="drawer-error">
            <p>Couldn't load this session.</p>
            <p>{error}</p>
          </div>
        )}
        {detail && (
          <>
            <dl className="drawer-meta">
              <dt>Status</dt>
              <dd className="drawer-status">{detail.session.status}</dd>
              <dt>Owner</dt>
              <dd>{detail.session.owner}</dd>
              <dt>Model</dt>
              <dd>{detail.session.model ?? "—"}</dd>
              <dt>Started</dt>
              <dd>{detail.session.startedAt}</dd>
              <dt>Ended</dt>
              <dd>{detail.session.endedAt ?? "—"}</dd>
            </dl>

            {detail.session.status === "done" && detail.session.recap && (
              <div className="drawer-recap">
                <h3>Recap</h3>
                <p>{detail.session.recap}</p>
              </div>
            )}

            <div className="drawer-timeline">
              <h3>Timeline</h3>
              {timeline.map((entry) => (
                <div key={entry.id} className="timeline-entry">
                  <div className="timeline-row">
                    <TimelineIcon kind={entry.iconKind} />
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
                </div>
              ))}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
