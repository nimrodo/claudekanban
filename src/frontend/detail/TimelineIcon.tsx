import type { TimelineIconKind } from "./eventSummary.js";

const PATHS: Record<TimelineIconKind, string> = {
  start: "M7 1a6 6 0 1 0 0 12A6 6 0 0 0 7 1Z",
  stop: "M3.5 3.5h7v7h-7z",
  tool: "M2 3.5 5.5 7 2 10.5 M6.5 11h5.5",
  spawn: "M4 2v4.5c0 1 .5 1.5 1.5 1.5H10 M8 6l2 2-2 2 M4 2h0",
  permission: "M7 1 2.5 2.8v3.6c0 3 2 4.9 4.5 5.6 2.5-.7 4.5-2.6 4.5-5.6V2.8Z",
  notification: "M7 1.5c-1.4 0-2.5 1.1-2.5 2.5v1.6c0 .5-.2 1-.5 1.4L3 8.5h8L9.9 7c-.3-.4-.5-.9-.5-1.4V4c0-1.4-1.1-2.5-2.4-2.5Z M5.8 10.2a1.2 1.2 0 0 0 2.4 0",
  other: "M7 7m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0",
};

export function TimelineIcon({ kind }: { kind: TimelineIconKind }) {
  return (
    <span className="timeline-icon" data-icon-kind={kind}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
        <path d={PATHS[kind]} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
