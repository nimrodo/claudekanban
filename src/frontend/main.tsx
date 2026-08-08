import { createRoot } from "react-dom/client";
import { Board } from "./board/Board.js";
import { useLiveState } from "./lib/useLiveState.js";
import { HttpSseTransport } from "./lib/transport/HttpSseTransport.js";

const transport = new HttpSseTransport();

function App() {
  const { sessions } = useLiveState(transport);
  return <Board sessions={sessions} />;
}

const container = document.getElementById("root");
if (!container) throw new Error("missing #root element");
createRoot(container).render(<App />);
