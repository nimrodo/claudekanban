import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useLiveState } from "./useLiveState.js";
import type { SessionDto, StreamEvent, Transport } from "./transport/Transport.js";

function makeSession(id: string): SessionDto {
  return {
    id,
    parentSessionId: null,
    owner: "main",
    status: "running",
    startedAt: "2026-08-08T10:00:00.000Z",
    endedAt: null,
    cwd: "/tmp",
    model: null,
    recap: null,
  };
}

function fakeTransport(initial: SessionDto[]): { transport: Transport; emit: (e: StreamEvent) => void; state: SessionDto[] } {
  let state = initial;
  let listener: ((event: StreamEvent) => void) | null = null;
  const transport: Transport = {
    getState: async () => ({ sessions: state }),
    subscribe: (onEvent) => {
      listener = onEvent;
      return () => {
        listener = null;
      };
    },
  };
  return {
    transport,
    emit: (event: StreamEvent) => listener?.(event),
    get state() {
      return state;
    },
    set state(next: SessionDto[]) {
      state = next;
    },
  } as unknown as { transport: Transport; emit: (e: StreamEvent) => void; state: SessionDto[] };
}

describe("useLiveState", () => {
  it("loads initial state from transport.getState()", async () => {
    const { transport } = fakeTransport([makeSession("sess-1")]);
    const { result } = renderHook(() => useLiveState(transport));
    await waitFor(() => expect(result.current.sessions).toHaveLength(1));
    expect(result.current.sessions[0].id).toBe("sess-1");
  });

  it("refetches state when a stream event arrives", async () => {
    const helper = fakeTransport([makeSession("sess-1")]);
    const { result } = renderHook(() => useLiveState(helper.transport));
    await waitFor(() => expect(result.current.sessions).toHaveLength(1));

    helper.state = [makeSession("sess-1"), makeSession("sess-2")];
    helper.emit({ type: "session-changed", entityId: "sess-2" });

    await waitFor(() => expect(result.current.sessions).toHaveLength(2));
  });

  it("tears down the subscription and ignores in-flight getState on unmount", async () => {
    let unsubscribed = false;
    let resolveSecondFetch: ((state: { sessions: SessionDto[] }) => void) | null = null;
    let getStateCallCount = 0;
    let listener: ((event: StreamEvent) => void) | null = null;

    const transport: Transport = {
      getState: () => {
        getStateCallCount += 1;
        if (getStateCallCount === 1) {
          return Promise.resolve({ sessions: [makeSession("sess-1")] });
        }
        // Second call (triggered by the emitted event) resolves only when we say so.
        return new Promise((resolve) => {
          resolveSecondFetch = resolve;
        });
      },
      subscribe: (onEvent) => {
        listener = onEvent;
        return () => {
          unsubscribed = true;
          listener = null;
        };
      },
    };

    const { result, unmount } = renderHook(() => useLiveState(transport));
    await waitFor(() => expect(result.current.sessions).toHaveLength(1));

    // Trigger the second, slow-resolving getState() call, then unmount before it resolves.
    listener?.({ type: "session-changed", entityId: "sess-2" });
    await waitFor(() => expect(getStateCallCount).toBe(2));

    unmount();
    expect(unsubscribed).toBe(true);

    // Resolve the in-flight fetch after unmount; the hook must not update state or throw/warn.
    expect(() => {
      resolveSecondFetch?.({ sessions: [makeSession("sess-1"), makeSession("sess-2")] });
    }).not.toThrow();

    // Allow the resolved promise's .then() to run.
    await Promise.resolve();
    await Promise.resolve();

    expect(result.current.sessions).toHaveLength(1);
  });
});
