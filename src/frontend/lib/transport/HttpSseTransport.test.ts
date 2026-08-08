import { describe, expect, it, vi, beforeEach } from "vitest";
import { HttpSseTransport } from "./HttpSseTransport.js";

describe("HttpSseTransport", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ sessions: [{ id: "sess-1" }] }) }))
    );
    vi.stubGlobal(
      "EventSource",
      vi.fn().mockImplementation(function (this: { close: () => void; onmessage: ((e: { data: string }) => void) | null }) {
        this.close = vi.fn();
        this.onmessage = null;
      })
    );
  });

  it("getState fetches /api/state and returns parsed JSON", async () => {
    const transport = new HttpSseTransport();
    const state = await transport.getState();
    expect(fetch).toHaveBeenCalledWith("/api/state");
    expect(state.sessions).toEqual([{ id: "sess-1" }]);
  });

  it("getState throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    const transport = new HttpSseTransport();
    await expect(transport.getState()).rejects.toThrow("GET /api/state failed: 500");
  });

  it("subscribe opens an EventSource on /stream and forwards parsed messages", () => {
    const transport = new HttpSseTransport();
    const received: unknown[] = [];
    transport.subscribe((event) => received.push(event));
    expect(EventSource).toHaveBeenCalledWith("/stream");
    const instance = (EventSource as unknown as { mock: { instances: Array<{ onmessage: (e: { data: string }) => void }> } })
      .mock.instances[0];
    instance.onmessage({ data: JSON.stringify({ type: "session-changed", entityId: "sess-1" }) });
    expect(received).toEqual([{ type: "session-changed", entityId: "sess-1" }]);
  });

  it("subscribe's returned unsubscribe function closes the EventSource", () => {
    const transport = new HttpSseTransport();
    const unsubscribe = transport.subscribe(() => {});
    const instance = (EventSource as unknown as { mock: { instances: Array<{ close: () => void }> } }).mock.instances[0];
    unsubscribe();
    expect(instance.close).toHaveBeenCalled();
  });
});
