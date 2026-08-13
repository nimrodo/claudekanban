import { describe, expect, it } from "vitest";
import { countByStatus } from "./statusCounts.js";
import type { SessionDto } from "../lib/transport/Transport.js";

function session(overrides: Partial<SessionDto>): SessionDto {
  return {
    id: "sess-1",
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

describe("countByStatus", () => {
  it("counts sessions by status, defaulting every known status to 0", () => {
    const counts = countByStatus([session({ id: "sess-1", status: "running" })]);
    expect(counts).toEqual({ queued: 0, running: 1, waiting: 0, done: 0, failed: 0 });
  });

  it("counts a child/subagent session under its own status, separately from its parent", () => {
    const counts = countByStatus([
      session({ id: "parent-1", status: "running" }),
      session({ id: "child-1", parentSessionId: "parent-1", status: "failed" }),
    ]);
    expect(counts).toEqual({ queued: 0, running: 1, waiting: 0, done: 0, failed: 1 });
  });
});
