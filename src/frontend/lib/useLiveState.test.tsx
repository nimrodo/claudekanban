import { describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useLiveState } from "./useLiveState.js";
import type { SessionDto, StreamEvent, Transport } from "./transport/Transport.js";

function makeSession(id: string, overrides: Partial<SessionDto> = {}): SessionDto {
  return {
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
    ...overrides,
  };
}

function fakeTransport(initial: SessionDto[]): {
  transport: Transport;
  emit: (e: StreamEvent) => void;
  getStateCallCount: () => number;
} {
  let listener: ((event: StreamEvent) => void) | null = null;
  let callCount = 0;
  const transport: Transport = {
    getState: () => {
      callCount += 1;
      return Promise.resolve({ sessions: initial });
    },
    getSessionDetail: () => Promise.reject(new Error("not used by useLiveState")),
    subscribe: (onEvent) => {
      listener = onEvent;
      return () => {
        listener = null;
      };
    },
  };
  return { transport, emit: (event) => listener?.(event), getStateCallCount: () => callCount };
}

describe("useLiveState", () => {
  it("loads initial state from transport.getState()", async () => {
    const { transport } = fakeTransport([makeSession("sess-1")]);
    const { result } = renderHook(() => useLiveState(transport));
    await waitFor(() => expect(result.current.sessions).toHaveLength(1));
    expect(result.current.sessions[0].id).toBe("sess-1");
  });

  it("applies a patch from a session-changed event in place, without refetching", async () => {
    const helper = fakeTransport([makeSession("sess-1", { status: "running" })]);
    const { result } = renderHook(() => useLiveState(helper.transport));
    await waitFor(() => expect(result.current.sessions).toHaveLength(1));
    expect(helper.getStateCallCount()).toBe(1);

    helper.emit({
      type: "session-changed",
      entityId: "sess-1",
      patch: makeSession("sess-1", { status: "done" }),
    });

    await waitFor(() => expect(result.current.sessions[0].status).toBe("done"));
    expect(helper.getStateCallCount()).toBe(1);
  });

  it("appends a session from a session-changed event for an id not yet in state", async () => {
    const helper = fakeTransport([makeSession("sess-1")]);
    const { result } = renderHook(() => useLiveState(helper.transport));
    await waitFor(() => expect(result.current.sessions).toHaveLength(1));

    helper.emit({ type: "session-changed", entityId: "sess-2", patch: makeSession("sess-2") });

    await waitFor(() => expect(result.current.sessions).toHaveLength(2));
    expect(helper.getStateCallCount()).toBe(1);
  });

  it("ignores a session-changed event with no patch", async () => {
    const helper = fakeTransport([makeSession("sess-1")]);
    const { result } = renderHook(() => useLiveState(helper.transport));
    await waitFor(() => expect(result.current.sessions).toHaveLength(1));

    helper.emit({ type: "session-changed", entityId: "sess-1" });
    await Promise.resolve();

    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0].status).toBe("running");
  });

  it("unsubscribes on unmount", () => {
    let unsubscribed = false;
    const transport: Transport = {
      getState: () => new Promise(() => {}),
      getSessionDetail: () => Promise.reject(new Error("not used by useLiveState")),
      subscribe: () => {
        return () => {
          unsubscribed = true;
        };
      },
    };
    const { unmount } = renderHook(() => useLiveState(transport));
    unmount();
    expect(unsubscribed).toBe(true);
  });
});
