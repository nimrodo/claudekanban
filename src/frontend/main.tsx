import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { Board } from "./board/Board.js";
import { AttachPane } from "./detail/AttachPane.js";
import { useLiveState } from "./lib/useLiveState.js";
import { useSessionDetail } from "./lib/useSessionDetail.js";
import { HttpSseTransport } from "./lib/transport/HttpSseTransport.js";
import { groupSessions } from "./board/groupSessions.js";
import "./app.css";

const transport = new HttpSseTransport();

function App() {
  const { sessions } = useLiveState(transport);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { detail, loading, error } = useSessionDetail(transport, selectedId);
  const { childrenByParent } = groupSessions(sessions);

  const hasLiveSessions = sessions.some((s) => s.status === "running" || s.status === "waiting");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!hasLiveSessions) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hasLiveSessions]);

  return (
    <div className="app-grid" data-pane-open={selectedId !== null}>
      <Board sessions={sessions} selectedId={selectedId} onSelect={setSelectedId} now={now} />
      {selectedId !== null && (
        <AttachPane
          detail={detail}
          loading={loading}
          error={error}
          onClose={() => setSelectedId(null)}
          liveChildrenByParent={childrenByParent}
          now={now}
        />
      )}
    </div>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("missing #root element");
createRoot(container).render(<App />);
