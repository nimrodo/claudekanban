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
      vi.fn().mockImplementation(function (this: {
        close: () => void;
        onmessage: ((e: { data: string; lastEventId?: string }) => void) | null;
        onopen: (() => void) | null;
      }) {
        this.close = vi.fn();
        this.onmessage = null;
        this.onopen = null;
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

  it("does not resync on the first open (initial connect)", async () => {
    const transport = new HttpSseTransport();
    const received: unknown[] = [];
    transport.subscribe((event) => received.push(event));
    const instance = (
      EventSource as unknown as { mock: { instances: Array<{ onopen: (() => void) | null }> } }
    ).mock.instances[0];
    instance.onopen?.();
    await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled();
    expect(received).toEqual([]);
  });

  it("resyncs via GET /api/state?since= on a reconnect (second open)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ sessions: [{ id: "sess-1" }, { id: "sess-2" }] }) }))
    );
    const transport = new HttpSseTransport();
    const received: unknown[] = [];
    transport.subscribe((event) => received.push(event));
    const instance = (
      EventSource as unknown as {
        mock: {
          instances: Array<{
            onopen: (() => void) | null;
            onmessage: ((e: { data: string; lastEventId?: string }) => void) | null;
          }>;
        };
      }
    ).mock.instances[0];

    instance.onopen?.(); // first open: initial connect, no resync
    instance.onmessage?.({ data: JSON.stringify({ type: "session-changed", entityId: "sess-1" }), lastEventId: "7" });
    instance.onopen?.(); // second open: reconnect, triggers resync
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/state?since=7"));
    await vi.waitFor(() =>
      expect(received).toContainEqual({ type: "resync", sessions: [{ id: "sess-1" }, { id: "sess-2" }] })
    );
  });

  it("subscribe's returned unsubscribe function closes the EventSource", () => {
    const transport = new HttpSseTransport();
    const unsubscribe = transport.subscribe(() => {});
    const instance = (EventSource as unknown as { mock: { instances: Array<{ close: () => void }> } }).mock.instances[0];
    unsubscribe();
    expect(instance.close).toHaveBeenCalled();
  });

  it("getSessionDetail fetches /api/sessions/:id and returns parsed JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ session: { id: "sess-1" }, events: [{ id: 1, sessionId: "sess-1", ts: "t", type: "SessionStart", payload: "{}" }] }),
      }))
    );
    const transport = new HttpSseTransport();
    const detail = await transport.getSessionDetail("sess-1");
    expect(fetch).toHaveBeenCalledWith("/api/sessions/sess-1");
    expect(detail.session).toEqual({ id: "sess-1" });
    expect(detail.events).toHaveLength(1);
  });

  it("getSessionDetail throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })));
    const transport = new HttpSseTransport();
    await expect(transport.getSessionDetail("missing")).rejects.toThrow("GET /api/sessions/missing failed: 404");
  });
});
