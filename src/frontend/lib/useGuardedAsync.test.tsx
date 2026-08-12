import { describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useGuardedAsync } from "./useGuardedAsync.js";

describe("useGuardedAsync", () => {
  it("fetches once on mount and exposes the result as data", async () => {
    const { result } = renderHook(() => useGuardedAsync(() => Promise.resolve("hello"), []));
    await waitFor(() => expect(result.current.data).toBe("hello"));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("sets loading while the fetch is in flight", () => {
    const { result } = renderHook(() => useGuardedAsync(() => new Promise(() => {}), []));
    expect(result.current.loading).toBe(true);
  });

  it("sets an error and stops loading when the fetch rejects", async () => {
    const { result } = renderHook(() => useGuardedAsync(() => Promise.reject(new Error("boom")), []));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("boom");
    expect(result.current.data).toBeNull();
  });

  it("does not fetch at all when enabled is false", async () => {
    let calls = 0;
    const { result } = renderHook(() =>
      useGuardedAsync(
        () => {
          calls += 1;
          return Promise.resolve("hello");
        },
        [],
        { enabled: false }
      )
    );
    expect(result.current).toEqual({ data: null, loading: false, error: null, refetch: expect.any(Function) });
    await Promise.resolve();
    expect(calls).toBe(0);
  });

  it("ignores a stale response that resolves after a newer refetch's response", async () => {
    let callCount = 0;
    const resolvers: Array<(value: string) => void> = [];
    const { result } = renderHook(() =>
      useGuardedAsync(
        () => {
          callCount += 1;
          return new Promise<string>((resolve) => resolvers.push(resolve));
        },
        []
      )
    );
    await waitFor(() => expect(callCount).toBe(1));

    result.current.refetch();
    result.current.refetch();
    await waitFor(() => expect(callCount).toBe(3));

    // Resolve the latest (third) call first...
    resolvers[2]("third");
    await waitFor(() => expect(result.current.data).toBe("third"));

    // ...then resolve an earlier call late. The stale response must not win.
    resolvers[0]("first");
    await Promise.resolve();
    await Promise.resolve();

    expect(result.current.data).toBe("third");
  });

  it("ignores an in-flight fetch that resolves after unmount", async () => {
    let resolveFetch: ((value: string) => void) | null = null;
    const { unmount } = renderHook(() =>
      useGuardedAsync(() => new Promise<string>((resolve) => (resolveFetch = resolve)), [])
    );

    unmount();

    expect(() => resolveFetch?.("late")).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });
});
