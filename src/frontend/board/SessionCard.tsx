import type { SessionDto } from "../lib/transport/Transport.js";

function cwdLabel(cwd: string): string {
  return cwd.replace(/\/+$/, "").split("/").pop() || cwd;
}

export function SessionCard({ session, children }: { session: SessionDto; children: SessionDto[] }) {
  return (
    <div className="card">
      <div className="card-cwd" title={session.cwd}>{cwdLabel(session.cwd)}</div>
      <div className="card-owner">{session.owner}</div>
      <div className="card-id">{session.id.slice(0, 8)}</div>
      <div className="card-status">{session.status}</div>
      {children.length > 0 && (
        <div className="card-children">
          {children.map((child) => (
            <div key={child.id} className="child-card">
              {child.title && (
                <div className="child-title" title={child.title}>{child.title}</div>
              )}
              <div className="child-meta">
                <span className="card-owner">{child.owner}</span>
                <span className="card-status">{child.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
