import type { Response } from "express";
import type { SessionShape } from "../domain/types.js";
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

changeEmitter.on("session-changed", (session: SessionShape, eventId?: number) => {
  const payload = JSON.stringify({ type: "session-changed", entityId: session.id, patch: session });
  const idLine = eventId !== undefined ? `id: ${eventId}\n` : "";
  for (const res of clients) {
    res.write(`${idLine}data: ${payload}\n\n`);
  }
});
