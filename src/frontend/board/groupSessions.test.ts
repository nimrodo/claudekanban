import { describe, expect, it } from "vitest";
import { groupSessions } from "./groupSessions.js";
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

describe("groupSessions", () => {
  it("treats a session with no parent as top-level", () => {
    const s = session({ id: "sess-1" });
    const { topLevel, childrenByParent } = groupSessions([s]);
    expect(topLevel).toEqual([s]);
    expect(childrenByParent.size).toBe(0);
  });

  it("treats a session whose parentSessionId is not in the list as top-level (orphan)", () => {
    const orphan = session({ id: "orphan-1", parentSessionId: "missing-parent" });
    const { topLevel, childrenByParent } = groupSessions([orphan]);
    expect(topLevel).toEqual([orphan]);
    expect(childrenByParent.size).toBe(0);
  });

  it("groups a child under its parent, not as top-level", () => {
    const parent = session({ id: "parent-1" });
    const child = session({ id: "child-1", parentSessionId: "parent-1" });
    const { topLevel, childrenByParent } = groupSessions([parent, child]);
    expect(topLevel).toEqual([parent]);
    expect(childrenByParent.get("parent-1")).toEqual([child]);
  });

  it("keeps a failed child grouped under its parent, not promoted to top-level", () => {
    const parent = session({ id: "parent-1", status: "running" });
    const failedChild = session({ id: "child-1", parentSessionId: "parent-1", status: "failed" });
    const { topLevel, childrenByParent } = groupSessions([parent, failedChild]);
    expect(topLevel).toEqual([parent]);
    expect(childrenByParent.get("parent-1")).toEqual([failedChild]);
  });

  it("preserves original array order for topLevel and for each parent's children", () => {
    const parent = session({ id: "parent-1" });
    const childA = session({ id: "child-a", parentSessionId: "parent-1" });
    const childB = session({ id: "child-b", parentSessionId: "parent-1" });
    const other = session({ id: "other-1" });
    const { topLevel, childrenByParent } = groupSessions([parent, childA, other, childB]);
    expect(topLevel.map((s) => s.id)).toEqual(["parent-1", "other-1"]);
    expect(childrenByParent.get("parent-1")?.map((s) => s.id)).toEqual(["child-a", "child-b"]);
  });

  it("returns an empty topLevel and empty map for no sessions", () => {
    const { topLevel, childrenByParent } = groupSessions([]);
    expect(topLevel).toEqual([]);
    expect(childrenByParent.size).toBe(0);
  });
});
