import { describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useSessionDetail } from "./useSessionDetail.js";
import type { SessionDetailResponse, StreamEvent, Transport } from "./transport/Transport.js";

function makeDetail(id: string): SessionDetailResponse {
  return {
    session: {
      id,
      parentSessionId: null,
      owner: "main",
      title: null,
      status: "running",
      startedAt: "2026-08-08T10:00:00.000Z",
      endedAt: null,
      cwd: "/tmp",
      model: null,
      recap: null,
    },
    events: [],
  };
}

function fakeTransport(): {
  transport: Transport;
  emit: (e: StreamEvent) => void;
  resolveNext: (detail: SessionDetailResponse) => void;
  rejectNext: (err: unknown) => void;
  getDetailCallCount: () => number;
} {
  let listener: ((event: StreamEvent) => void) | null = null;
  let callCount = 0;
  const resolvers: Array<(detail: SessionDetailResponse) => void> = [];
  const rejecters: Array<(err: unknown) => void> = [];
  const transport: Transport = {
    getState: async () => ({ sessions: [] }),
    getSessionDetail: (_id: string) => {
      callCount += 1;
      return new Promise((resolve, reject) => {
        resolvers.push(resolve);
        rejecters.push(reject);
      });
    },
    subscribe: (onEvent) => {
      listener = onEvent;
      return () => {
        listener = null;
      };
    },
  };
  return {
    transport,
    emit: (event) => listener?.(event),
    resolveNext: (detail) => resolvers.shift()?.(detail),
    rejectNext: (err) => rejecters.shift()?.(err),
    getDetailCallCount: () => callCount,
  };
}

describe("useSessionDetail", () => {
  it("returns no detail and not loading when sessionId is null", () => {
    const { transport } = fakeTransport();
    const { result } = renderHook(() => useSessionDetail(transport, null));
    expect(result.current).toEqual({ detail: null, loading: false, error: null });
  });

  it("fetches and loads detail when given a sessionId", async () => {
    const helper = fakeTransport();
    const { result } = renderHook(() => useSessionDetail(helper.transport, "sess-1"));
    expect(result.current.loading).toBe(true);

    helper.resolveNext(makeDetail("sess-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.detail?.session.id).toBe("sess-1");
  });

  it("refetches when a session-changed event matches the current sessionId", async () => {
    const helper = fakeTransport();
    const { result } = renderHook(() => useSessionDetail(helper.transport, "sess-1"));
    helper.resolveNext(makeDetail("sess-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    helper.emit({ type: "session-changed", entityId: "sess-1" });
    await waitFor(() => expect(helper.getDetailCallCount()).toBe(2));
    helper.resolveNext(makeDetail("sess-1"));
    await waitFor(() => expect(result.current.detail?.session.id).toBe("sess-1"));
  });

  it("ignores a session-changed event for a different sessionId", async () => {
    const helper = fakeTransport();
    renderHook(() => useSessionDetail(helper.transport, "sess-1"));
    helper.resolveNext(makeDetail("sess-1"));
    await waitFor(() => expect(helper.getDetailCallCount()).toBe(1));

    helper.emit({ type: "session-changed", entityId: "sess-2" });
    // Give any (incorrect) refetch a chance to fire, then assert it didn't.
    await Promise.resolve();
    expect(helper.getDetailCallCount()).toBe(1);
  });

  it("sets an error and stops loading when the fetch rejects", async () => {
    const helper = fakeTransport();
    const { result } = renderHook(() => useSessionDetail(helper.transport, "sess-1"));
    expect(result.current.loading).toBe(true);

    helper.rejectNext(new Error("Not found"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Not found");
    expect(result.current.detail).toBeNull();
  });

  it("unsubscribes on unmount", () => {
    let unsubscribed = false;
    const transport: Transport = {
      getState: async () => ({ sessions: [] }),
      getSessionDetail: () => new Promise(() => {}),
      subscribe: () => () => {
        unsubscribed = true;
      },
    };
    const { unmount } = renderHook(() => useSessionDetail(transport, "sess-1"));
    unmount();
    expect(unsubscribed).toBe(true);
  });
});
