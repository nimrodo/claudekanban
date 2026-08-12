import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { Response } from "express";
import type { SessionShape } from "../domain/types.js";

vi.mock("../domain/changeEmitter.js", () => ({ changeEmitter: new EventEmitter() }));

function fakeResponse() {
  const written: string[] = [];
  const listeners: Record<string, () => void> = {};
  const res = {
    writeHead: vi.fn(),
    write: vi.fn((chunk: string) => {
      written.push(chunk);
    }),
    on: vi.fn((event: string, cb: () => void) => {
      listeners[event] = cb;
    }),
  } as unknown as Response;
  return { res, written, triggerClose: () => listeners.close?.() };
}

describe("handleSseConnection", () => {
  it("writes SSE headers and registers the client", async () => {
    const { handleSseConnection } = await import("./broadcaster.js");
    const { res } = fakeResponse();
    handleSseConnection(res);
    expect(res.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ "Content-Type": "text/event-stream" })
    );
  });

  const session: SessionShape = {
    id: "sess-1",
    parentSessionId: null,
    owner: "main",
    title: null,
    status: "running",
    startedAt: "2026-08-12T10:00:00.000Z",
    endedAt: null,
    cwd: "/tmp/project",
    model: "claude-sonnet-5",
    recap: null,
  };

  it("broadcasts a session-changed event with the full session as patch", async () => {
    const { handleSseConnection } = await import("./broadcaster.js");
    const { changeEmitter } = await import("../domain/changeEmitter.js");
    const { res, written } = fakeResponse();
    handleSseConnection(res);
    changeEmitter.emit("session-changed", session);
    expect(written).toEqual([`data: ${JSON.stringify({ type: "session-changed", entityId: "sess-1", patch: session })}\n\n`]);
  });

  it("prefixes the write with an id: line when an event id is provided", async () => {
    const { handleSseConnection } = await import("./broadcaster.js");
    const { changeEmitter } = await import("../domain/changeEmitter.js");
    const { res, written } = fakeResponse();
    handleSseConnection(res);
    changeEmitter.emit("session-changed", session, 42);
    expect(written).toEqual([
      `id: 42\ndata: ${JSON.stringify({ type: "session-changed", entityId: "sess-1", patch: session })}\n\n`,
    ]);
  });

  it("stops writing to a client after it closes", async () => {
    const { handleSseConnection } = await import("./broadcaster.js");
    const { changeEmitter } = await import("../domain/changeEmitter.js");
    const { res, written, triggerClose } = fakeResponse();
    handleSseConnection(res);
    triggerClose();
    changeEmitter.emit("session-changed", session);
    expect(written).toHaveLength(0);
  });
});
