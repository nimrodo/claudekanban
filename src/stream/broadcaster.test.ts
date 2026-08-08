import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { Response } from "express";

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

  it("broadcasts a session-changed event to a registered client", async () => {
    const { handleSseConnection } = await import("./broadcaster.js");
    const { changeEmitter } = await import("../domain/changeEmitter.js");
    const { res, written } = fakeResponse();
    handleSseConnection(res);
    changeEmitter.emit("session-changed", "sess-1");
    expect(written).toEqual([`data: {"type":"session-changed","entityId":"sess-1"}\n\n`]);
  });

  it("stops writing to a client after it closes", async () => {
    const { handleSseConnection } = await import("./broadcaster.js");
    const { changeEmitter } = await import("../domain/changeEmitter.js");
    const { res, written, triggerClose } = fakeResponse();
    handleSseConnection(res);
    triggerClose();
    changeEmitter.emit("session-changed", "sess-1");
    expect(written).toHaveLength(0);
  });
});
