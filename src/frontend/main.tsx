import { createRoot } from "react-dom/client";
import { useState } from "react";
import { Board } from "./board/Board.js";
import { Drawer } from "./detail/Drawer.js";
import { useLiveState } from "./lib/useLiveState.js";
import { useSessionDetail } from "./lib/useSessionDetail.js";
import { HttpSseTransport } from "./lib/transport/HttpSseTransport.js";

const transport = new HttpSseTransport();

function App() {
  const { sessions } = useLiveState(transport);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { detail, loading, error } = useSessionDetail(transport, selectedId);

  return (
    <>
      <Board sessions={sessions} onSelect={setSelectedId} />
      <Drawer
        open={selectedId !== null}
        detail={detail}
        loading={loading}
        error={error}
        onClose={() => setSelectedId(null)}
      />
    </>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("missing #root element");
createRoot(container).render(<App />);
