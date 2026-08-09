import { useEffect, useState } from "react";
import type { SessionDetailResponse } from "../lib/transport/Transport.js";
import { buildTimeline } from "./eventSummary.js";
import "./drawer.css";

export function Drawer({
  open,
  detail,
  loading,
  onClose,
}: {
  open: boolean;
  detail: SessionDetailResponse | null;
  loading: boolean;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

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
      <aside className="drawer" data-open={open} aria-hidden={!open}>
        {loading && !detail && <div className="drawer-loading">Loading…</div>}
        {detail && (
          <>
            <div className="drawer-header">
              <div>
                <div className="drawer-title">{detail.session.title ?? detail.session.owner}</div>
                <div className="drawer-subtitle">{detail.session.cwd}</div>
              </div>
              <button type="button" className="drawer-close" onClick={onClose} aria-label="Close">
                ×
              </button>
            </div>

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
                    <span className="timeline-ts">{entry.ts}</span>
                    <span className="timeline-summary">{entry.summary}</span>
                    <button type="button" className="timeline-toggle" onClick={() => toggleExpanded(entry.id)}>
                      {expanded.has(entry.id) ? "Hide raw" : "Show raw"}
                    </button>
                  </div>
                  {expanded.has(entry.id) && (
                    <pre className="timeline-raw">{JSON.stringify(entry.raw, null, 2)}</pre>
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
