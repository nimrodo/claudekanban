import { describe, expect, it } from "vitest";
import { buildLanes, cwdLabel, laneWeight } from "./laneOrder.js";
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
    failReason: null,
    lastActivitySummary: null,
    lastActivityAt: null,
    ...overrides,
  };
}

describe("cwdLabel", () => {
  it("strips trailing slashes and returns the last path segment", () => {
    expect(cwdLabel("/home/user/projects/myapp/")).toBe("myapp");
  });

  it("returns the last path segment when there is no trailing slash", () => {
    expect(cwdLabel("/home/user/projects/myapp")).toBe("myapp");
  });

  it("returns the full string when there is no path separator (a single word)", () => {
    expect(cwdLabel("myapp")).toBe("myapp");
  });

  it("returns the full string when splitting yields only empty segments", () => {
    expect(cwdLabel("/")).toBe("/");
  });

  it("handles multiple trailing slashes", () => {
    expect(cwdLabel("/home/user/projects//")).toBe("projects");
  });

  it("handles root path /tmp", () => {
    expect(cwdLabel("/tmp")).toBe("tmp");
  });
});

describe("laneWeight", () => {
  it("computes running*100 + waiting*50 + queued*10 + failed*5, ignores done", () => {
    const byStatus = {
      queued: [session({ id: "q1" }), session({ id: "q2" })],
      running: [session({ id: "r1" })],
      waiting: [session({ id: "w1" })],
      done: [session({ id: "d1" }), session({ id: "d2" }), session({ id: "d3" })],
      failed: [session({ id: "f1" })],
    };

    // 1*100 + 1*50 + 2*10 + 1*5 = 100 + 50 + 20 + 5 = 175
    const weight = laneWeight(byStatus);
    expect(weight).toBe(175);
  });

  it("returns 0 when all statuses have no sessions", () => {
    const byStatus = {
      queued: [],
      running: [],
      waiting: [],
      done: [],
      failed: [],
    };
    expect(laneWeight(byStatus)).toBe(0);
  });

  it("only counts running sessions when only they are present", () => {
    const byStatus = {
      queued: [],
      running: [session({ id: "r1" }), session({ id: "r2" }), session({ id: "r3" })],
      waiting: [],
      done: [],
      failed: [],
    };
    expect(laneWeight(byStatus)).toBe(300);
  });

  it("ignores done sessions in weight calculation", () => {
    const byStatus = {
      queued: [],
      running: [],
      waiting: [],
      done: [session({ id: "d1" }), session({ id: "d2" }), session({ id: "d3" }), session({ id: "d4" })],
      failed: [],
    };
    expect(laneWeight(byStatus)).toBe(0);
  });
});

describe("buildLanes", () => {
  it("groups top-level sessions by cwd, ignoring children", () => {
    const sessions = [
      session({ id: "s1", cwd: "/home/a" }),
      session({ id: "s2", cwd: "/home/b" }),
      session({ id: "child-1", parentSessionId: "s1", cwd: "/home/a" }),
    ];
    const lanes = buildLanes(sessions, "name");
    expect(lanes).toHaveLength(2);
    expect(lanes[0].cwd).toBe("/home/a");
    expect(lanes[0].total).toBe(1);
    expect(lanes[1].cwd).toBe("/home/b");
    expect(lanes[1].total).toBe(1);
  });

  it("sorts by activity (descending weight), most active first", () => {
    const sessions = [
      session({ id: "s1", cwd: "/proj-a", status: "queued" }),
      session({ id: "s2", cwd: "/proj-b", status: "running" }),
    ];
    const lanes = buildLanes(sessions, "activity");
    expect(lanes[0].cwd).toBe("/proj-b"); // running (100 weight)
    expect(lanes[1].cwd).toBe("/proj-a"); // queued (10 weight)
  });

  it("tie-breaks activity sort by most recent startedAt", () => {
    const sessions = [
      session({
        id: "s1",
        cwd: "/proj-a",
        status: "waiting",
        startedAt: "2026-08-08T10:00:00.000Z",
      }),
      session({
        id: "s2",
        cwd: "/proj-b",
        status: "waiting",
        startedAt: "2026-08-08T11:00:00.000Z",
      }),
    ];
    const lanes = buildLanes(sessions, "activity");
    // Same weight (both waiting: 50), so tie-break by startedAt
    expect(lanes[0].cwd).toBe("/proj-b"); // more recent start
    expect(lanes[1].cwd).toBe("/proj-a"); // earlier start
  });

  it("sorts by name (alphabetical, case per localeCompare)", () => {
    const sessions = [
      session({ id: "s1", cwd: "/home/zebra" }),
      session({ id: "s2", cwd: "/home/apple" }),
      session({ id: "s3", cwd: "/home/Banana" }),
    ];
    const lanes = buildLanes(sessions, "name");
    const labels = lanes.map((l) => l.label);
    // localeCompare default: case-insensitive, then case-sensitive
    expect(labels).toEqual(["apple", "Banana", "zebra"]);
  });

  it("sorts by sessions (descending total count)", () => {
    const sessions = [
      session({ id: "s1", cwd: "/proj-a" }),
      session({ id: "s2", cwd: "/proj-b" }),
      session({ id: "s3", cwd: "/proj-b" }),
      session({ id: "s4", cwd: "/proj-c" }),
      session({ id: "s5", cwd: "/proj-c" }),
      session({ id: "s6", cwd: "/proj-c" }),
    ];
    const lanes = buildLanes(sessions, "sessions");
    expect(lanes[0].total).toBe(3); // proj-c
    expect(lanes[1].total).toBe(2); // proj-b
    expect(lanes[2].total).toBe(1); // proj-a
  });

  it("keeps two lanes with same basename but different full cwds as separate entries", () => {
    const sessions = [
      session({ id: "s1", cwd: "/home/user/project" }),
      session({ id: "s2", cwd: "/var/log/project" }),
    ];
    const lanes = buildLanes(sessions, "name");
    expect(lanes).toHaveLength(2);
    expect(lanes.map((l) => l.cwd)).toEqual(["/home/user/project", "/var/log/project"]);
    // Both have label "project" but remain separate lanes
    expect(lanes[0].label).toBe("project");
    expect(lanes[1].label).toBe("project");
  });

  it("promotes orphaned child to top-level by its own cwd if parent is missing", () => {
    const sessions = [
      session({ id: "orphan-1", parentSessionId: "missing-parent", cwd: "/home/orphan" }),
      session({ id: "unrelated", cwd: "/home/other" }),
    ];
    const lanes = buildLanes(sessions, "name");
    expect(lanes).toHaveLength(2);
    const orphanLane = lanes.find((l) => l.cwd === "/home/orphan");
    expect(orphanLane).toBeDefined();
    expect(orphanLane?.total).toBe(1);
  });

  it("includes all session statuses in byStatus, even with 0 count", () => {
    const sessions = [session({ id: "s1", cwd: "/proj", status: "running" })];
    const lanes = buildLanes(sessions, "name");
    const lane = lanes[0];
    expect(lane.byStatus).toHaveProperty("queued");
    expect(lane.byStatus).toHaveProperty("running");
    expect(lane.byStatus).toHaveProperty("waiting");
    expect(lane.byStatus).toHaveProperty("done");
    expect(lane.byStatus).toHaveProperty("failed");
    expect(lane.byStatus.queued).toEqual([]);
    expect(lane.byStatus.running).toEqual([sessions[0]]);
    expect(lane.byStatus.waiting).toEqual([]);
    expect(lane.byStatus.done).toEqual([]);
    expect(lane.byStatus.failed).toEqual([]);
  });

  it("shares the global childrenByParent map across all lanes", () => {
    const parent = session({ id: "parent-1", cwd: "/proj-a" });
    const child = session({ id: "child-1", parentSessionId: "parent-1", cwd: "/proj-a" });
    const sessions = [parent, child];
    const lanes = buildLanes(sessions, "name");
    expect(lanes[0].childrenByParent.get("parent-1")).toEqual([child]);
  });

  it("maintains stable sort for equal keys (Array.prototype.sort stability)", () => {
    // Two lanes with same name should maintain their original relative order
    const sessions = [
      session({ id: "s1", cwd: "/path/a/app", startedAt: "2026-08-08T10:00:00.000Z" }),
      session({ id: "s2", cwd: "/path/b/app", startedAt: "2026-08-08T10:00:00.000Z" }),
    ];
    const lanes = buildLanes(sessions, "name");
    // Both have label "app", same weight (0), same startedAt
    // Stable sort should keep /path/a/app before /path/b/app
    expect(lanes[0].cwd).toBe("/path/a/app");
    expect(lanes[1].cwd).toBe("/path/b/app");
  });
});
