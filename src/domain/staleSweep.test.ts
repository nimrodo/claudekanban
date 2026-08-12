import { describe, expect, it } from "vitest";
import { findStaleSessionIds, type StaleCandidate } from "./staleSweep.js";

function candidate(overrides: Partial<StaleCandidate>): StaleCandidate {
  return { id: "sess-1", status: "running", lastActivityAt: "2026-08-12T10:00:00.000Z", ...overrides };
}

describe("findStaleSessionIds", () => {
  it("flags a running session whose last activity is older than the timeout", () => {
    const result = findStaleSessionIds(
      [candidate({ id: "sess-1", lastActivityAt: "2026-08-12T09:49:00.000Z" })],
      "2026-08-12T10:00:00.000Z",
      10
    );
    expect(result).toEqual(["sess-1"]);
  });

  it("does not flag a running session whose last activity is within the timeout", () => {
    const result = findStaleSessionIds(
      [candidate({ id: "sess-1", lastActivityAt: "2026-08-12T09:55:00.000Z" })],
      "2026-08-12T10:00:00.000Z",
      10
    );
    expect(result).toEqual([]);
  });

  it("flags a running session with no recorded activity at all", () => {
    const result = findStaleSessionIds(
      [candidate({ id: "sess-1", lastActivityAt: null })],
      "2026-08-12T10:00:00.000Z",
      10
    );
    expect(result).toEqual(["sess-1"]);
  });

  it("ignores non-running sessions regardless of last activity", () => {
    const result = findStaleSessionIds(
      [candidate({ id: "sess-1", status: "done", lastActivityAt: "2026-08-12T09:00:00.000Z" })],
      "2026-08-12T10:00:00.000Z",
      10
    );
    expect(result).toEqual([]);
  });
});
