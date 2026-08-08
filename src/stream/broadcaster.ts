import type { Response } from "express";
import { changeEmitter } from "../domain/changeEmitter.js";

const clients = new Set<Response>();

export function handleSseConnection(res: Response): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  clients.add(res);
  res.on("close", () => {
    clients.delete(res);
  });
}

changeEmitter.on("session-changed", (sessionId: string) => {
  const payload = JSON.stringify({ type: "session-changed", entityId: sessionId });
  for (const res of clients) {
    res.write(`data: ${payload}\n\n`);
  }
});
