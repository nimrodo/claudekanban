import type { KeyboardEvent } from "react";
import type { SessionDto } from "../lib/transport/Transport.js";

function cwdLabel(cwd: string): string {
  return cwd.replace(/\/+$/, "").split("/").pop() || cwd;
}

function handleActivateKey(e: KeyboardEvent, onActivate: () => void) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    onActivate();
  }
}

export function SessionCard({
  session,
  children,
  onSelect,
}: {
  session: SessionDto;
  children: SessionDto[];
  onSelect: (id: string) => void;
}) {
  return (
    <div
      className="card"
      role="button"
      tabIndex={0}
      onClick={() => onSelect(session.id)}
      onKeyDown={(e) => handleActivateKey(e, () => onSelect(session.id))}
    >
      <div className="card-cwd" title={session.cwd}>{cwdLabel(session.cwd)}</div>
      <div className="card-owner">{session.owner}</div>
      <div className="card-id">{session.id.slice(0, 8)}</div>
      <div className="card-status">{session.status}</div>
      {session.status === "failed" && session.failReason && (
        <div className="card-fail-reason" title={session.failReason}>{session.failReason}</div>
      )}
      {children.length > 0 && (
        <div className="card-children">
          {children.map((child) => (
            <div
              key={child.id}
              className="child-card"
              data-status={child.status}
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(child.id);
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                handleActivateKey(e, () => onSelect(child.id));
              }}
            >
              {child.title && (
                <div className="child-title" title={child.title}>{child.title}</div>
              )}
              <div className="child-meta">
                <span className="card-owner">{child.owner}</span>
                <span className="card-status">{child.status}</span>
              </div>
              {child.status === "failed" && child.failReason && (
                <div className="card-fail-reason" title={child.failReason}>{child.failReason}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
