import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useLiveState } from "./useLiveState.js";
import type { SessionDto, StreamEvent, Transport } from "./transport/Transport.js";

function makeSession(id: string): SessionDto {
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
    const pending: { resolve: ((state: { sessions: SessionDto[] }) => void) | null } = { resolve: null };
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
          pending.resolve = resolve;
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
      pending.resolve?.({ sessions: [makeSession("sess-1"), makeSession("sess-2")] });
    }).not.toThrow();

    // Allow the resolved promise's .then() to run.
    await Promise.resolve();
    await Promise.resolve();

    expect(result.current.sessions).toHaveLength(1);
  });

  it("ignores a stale getState() response that resolves after a newer one", async () => {
    let listener: ((event: StreamEvent) => void) | null = null;
    let getStateCallCount = 0;
    const resolvers: Array<(state: { sessions: SessionDto[] }) => void> = [];

    const transport: Transport = {
      getState: () => {
        getStateCallCount += 1;
        if (getStateCallCount === 1) {
          return Promise.resolve({ sessions: [makeSession("sess-1")] });
        }
        return new Promise((resolve) => {
          resolvers.push(resolve);
        });
      },
      subscribe: (onEvent) => {
        listener = onEvent;
        return () => {
          listener = null;
        };
      },
    };

    const { result } = renderHook(() => useLiveState(transport));
    await waitFor(() => expect(result.current.sessions).toHaveLength(1));

    // Fire two events in quick succession; each triggers its own getState() call.
    listener?.({ type: "session-changed", entityId: "sess-2" });
    listener?.({ type: "session-changed", entityId: "sess-3" });
    await waitFor(() => expect(getStateCallCount).toBe(3));

    // Resolve the SECOND event's fetch (the latest, correct one) first...
    resolvers[1]({ sessions: [makeSession("sess-1"), makeSession("sess-2"), makeSession("sess-3")] });
    await waitFor(() => expect(result.current.sessions).toHaveLength(3));

    // ...then resolve the FIRST event's fetch late (stale response arriving out of order).
    resolvers[0]({ sessions: [makeSession("sess-1"), makeSession("sess-2")] });
    await Promise.resolve();
    await Promise.resolve();

    // The stale response must not overwrite the newer, correct state.
    expect(result.current.sessions).toHaveLength(3);
  });
});
