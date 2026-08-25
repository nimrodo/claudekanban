import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { ReactNode } from "react";
import { render, act } from "@testing-library/react";
import { useLocalStorageState } from "./useLocalStorageState.js";

// Test component that exposes hook state for testing
function TestComponent<T>({
  hookArgs,
  onStateChange,
}: {
  hookArgs: [string, T];
  onStateChange: (state: [T, (value: T | ((prev: T) => T)) => void]) => void;
}): ReactNode {
  const state = useLocalStorageState(hookArgs[0], hookArgs[1]);
  onStateChange(state);
  return null;
}

describe("useLocalStorageState", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("initializes from an existing localStorage value if present", () => {
    localStorage.setItem("test-key", JSON.stringify({ foo: "bar" }));
    let hookState: [any, any];
    render(
      <TestComponent
        hookArgs={["test-key", { foo: "default" }]}
        onStateChange={(state) => {
          hookState = state;
        }}
      />
    );
    expect(hookState![0]).toEqual({ foo: "bar" });
  });

  it("falls back to default when key is absent", () => {
    let hookState: [any, any];
    render(
      <TestComponent
        hookArgs={["missing-key", { foo: "default" }]}
        onStateChange={(state) => {
          hookState = state;
        }}
      />
    );
    expect(hookState![0]).toEqual({ foo: "default" });
  });

  it("falls back to default when stored value is invalid JSON", () => {
    localStorage.setItem("bad-json", "not valid json at all");
    let hookState: [any, any];
    render(
      <TestComponent
        hookArgs={["bad-json", { foo: "default" }]}
        onStateChange={(state) => {
          hookState = state;
        }}
      />
    );
    expect(hookState![0]).toEqual({ foo: "default" });
  });

  it("writes to localStorage when the setter is called", () => {
    let hookState: [any, any];
    render(
      <TestComponent
        hookArgs={["test-key", { count: 0 }]}
        onStateChange={(state) => {
          hookState = state;
        }}
      />
    );
    act(() => {
      hookState![1]({ count: 42 });
    });
    expect(hookState![0]).toEqual({ count: 42 });
    expect(localStorage.getItem("test-key")).toBe(JSON.stringify({ count: 42 }));
  });

  it("two independent keys don't clobber each other", () => {
    let hookState1: [any, any];
    let hookState2: [any, any];
    render(
      <>
        <TestComponent
          hookArgs={["key-1", "default-1"]}
          onStateChange={(state) => {
            hookState1 = state;
          }}
        />
        <TestComponent
          hookArgs={["key-2", "default-2"]}
          onStateChange={(state) => {
            hookState2 = state;
          }}
        />
      </>
    );

    act(() => {
      hookState1![1]("value-1");
    });
    act(() => {
      hookState2![1]("value-2");
    });

    expect(localStorage.getItem("key-1")).toBe(JSON.stringify("value-1"));
    expect(localStorage.getItem("key-2")).toBe(JSON.stringify("value-2"));
    expect(hookState1![0]).toBe("value-1");
    expect(hookState2![0]).toBe("value-2");
  });

  it("supports updater function in setValue", () => {
    let hookState: [any, any];
    render(
      <TestComponent
        hookArgs={["counter", 0]}
        onStateChange={(state) => {
          hookState = state;
        }}
      />
    );
    act(() => {
      hookState![1]((prev) => prev + 1);
    });
    expect(hookState![0]).toBe(1);
    expect(localStorage.getItem("counter")).toBe("1");
  });

  it("handles array values", () => {
    let hookState: [any, any];
    render(
      <TestComponent
        hookArgs={["items", [] as string[]]}
        onStateChange={(state) => {
          hookState = state;
        }}
      />
    );
    act(() => {
      hookState![1](["a", "b", "c"]);
    });
    expect(hookState![0]).toEqual(["a", "b", "c"]);
    expect(localStorage.getItem("items")).toBe(JSON.stringify(["a", "b", "c"]));
  });

  it("handles boolean values", () => {
    let hookState: [any, any];
    render(
      <TestComponent
        hookArgs={["toggle", false]}
        onStateChange={(state) => {
          hookState = state;
        }}
      />
    );
    act(() => {
      hookState![1](true);
    });
    expect(hookState![0]).toBe(true);
    expect(localStorage.getItem("toggle")).toBe("true");
  });
});
