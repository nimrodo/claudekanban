import { describe, expect, it } from "vitest";
import {
  synthesizeSubagentSession,
  type PostToolUsePayload,
  synthesizeSubagentStart,
  type SubagentStartPayload,
  synthesizeSubagentStop,
  type SubagentStopPayload,
  mergeSubagentTitle,
} from "./subagentSynthesis.js";
import type { Session } from "../store/sessionStore.js";

function payload(overrides: Partial<PostToolUsePayload>): PostToolUsePayload {
  return {
    hook_event_name: "PostToolUse",
    session_id: "parent-1",
    cwd: "/tmp/project",
    tool_name: "Agent",
    tool_input: { subagent_type: "Explore", description: "Find TODO occurrences" },
    tool_response: { agentId: "agent-123" },
    ...overrides,
  };
}

describe("synthesizeSubagentSession", () => {
  it("returns null for non-Agent/Task tool calls", () => {
    expect(synthesizeSubagentSession(payload({ tool_name: "Bash" }), "2026-08-08T10:00:00.000Z")).toBeNull();
  });

  it("returns null when tool_response has no agentId (still running / not a subagent spawn)", () => {
    expect(synthesizeSubagentSession(payload({ tool_response: {} }), "2026-08-08T10:00:00.000Z")).toBeNull();
  });

  it("synthesizes a done child session from a successful Agent/Task call", () => {
    const child = synthesizeSubagentSession(payload({}), "2026-08-08T10:00:05.000Z");
    expect(child).toEqual({
      id: "agent-123",
      parentSessionId: "parent-1",
      owner: "Explore",
      title: "Find TODO occurrences",
      status: "done",
      startedAt: "2026-08-08T10:00:05.000Z",
      endedAt: "2026-08-08T10:00:05.000Z",
      cwd: "/tmp/project",
      model: null,
      recap: null,
      failReason: null,
      lastActivitySummary: "Spawned Explore subagent",
    });
  });

  it("synthesizes a failed child session when tool_response carries an error", () => {
    const child = synthesizeSubagentSession(
      payload({ tool_response: { agentId: "agent-456", error: "timed out" } }),
      "2026-08-08T10:00:05.000Z"
    );
    expect(child?.status).toBe("failed");
    expect(child?.failReason).toBe("timed out");
  });

  it("stringifies a non-string tool_response.error into failReason", () => {
    const child = synthesizeSubagentSession(
      payload({ tool_response: { agentId: "agent-789", error: { code: 137, message: "killed" } } }),
      "2026-08-08T10:00:05.000Z"
    );
    expect(child?.failReason).toBe(JSON.stringify({ code: 137, message: "killed" }));
  });

  it("defaults owner to \"unknown\" when subagent_type is missing", () => {
    const child = synthesizeSubagentSession(payload({ tool_input: {} }), "2026-08-08T10:00:05.000Z");
    expect(child?.owner).toBe("unknown");
  });

  it("recognizes tool_name \"Task\" as well as \"Agent\"", () => {
    expect(synthesizeSubagentSession(payload({ tool_name: "Task" }), "2026-08-08T10:00:05.000Z")).not.toBeNull();
  });

  it("sets title to null when description is missing", () => {
    const child = synthesizeSubagentSession(
      payload({ tool_input: { subagent_type: "Explore" } }),
      "2026-08-08T10:00:05.000Z"
    );
    expect(child?.title).toBeNull();
  });

  it("sets title to null when description is an empty string", () => {
    const child = synthesizeSubagentSession(
      payload({ tool_input: { subagent_type: "Explore", description: "" } }),
      "2026-08-08T10:00:05.000Z"
    );
    expect(child?.title).toBeNull();
  });

  it("sets lastActivitySummary from the spawning PostToolUse call", () => {
    const child = synthesizeSubagentSession(payload({}), "2026-08-08T10:00:05.000Z");
    expect(child?.lastActivitySummary).toBe("Spawned Explore subagent");
  });
});

describe("synthesizeSubagentStart", () => {
  function startPayload(overrides: Partial<SubagentStartPayload> = {}): SubagentStartPayload {
    return {
      hook_event_name: "SubagentStart",
      session_id: "parent-1",
      cwd: "/tmp/project",
      agent_id: "agent-123",
      agent_type: "Explore",
      ...overrides,
    };
  }

  it("creates a running child session with no title yet, when no existing row", () => {
    const child = synthesizeSubagentStart(undefined, startPayload(), "2026-08-09T10:00:00.000Z");
    expect(child).toEqual({
      id: "agent-123",
      parentSessionId: "parent-1",
      owner: "Explore",
      title: null,
      status: "running",
      startedAt: "2026-08-09T10:00:00.000Z",
      endedAt: null,
      cwd: "/tmp/project",
      model: null,
      recap: null,
      failReason: null,
      lastActivitySummary: "Running Explore subagent",
    });
  });

  it("returns null when agent_id is missing", () => {
    expect(synthesizeSubagentStart(undefined, startPayload({ agent_id: undefined }), "2026-08-09T10:00:00.000Z")).toBeNull();
  });

  it("returns null when agent_type is empty (background-job false positive filter)", () => {
    expect(synthesizeSubagentStart(undefined, startPayload({ agent_type: "" }), "2026-08-09T10:00:00.000Z")).toBeNull();
  });

  it("does not clobber an existing done row (late or duplicate SubagentStart delivery)", () => {
    const doneChild: Session = {
      id: "agent-123",
      parentSessionId: "parent-1",
      owner: "Explore",
      title: "Find TODO occurrences",
      status: "done",
      startedAt: "2026-08-09T10:00:00.000Z",
      endedAt: "2026-08-09T10:00:17.000Z",
      cwd: "/tmp/project",
      model: null,
      recap: null,
      failReason: null,
      lastActivitySummary: "Spawned Explore subagent",
    };
    const result = synthesizeSubagentStart(doneChild, startPayload(), "2026-08-09T10:00:20.000Z");
    expect(result).toEqual(doneChild);
  });

  it("does not clobber an existing failed row (late or duplicate SubagentStart delivery)", () => {
    const failedChild: Session = {
      id: "agent-123",
      parentSessionId: "parent-1",
      owner: "Explore",
      title: null,
      status: "failed",
      startedAt: "2026-08-09T10:00:00.000Z",
      endedAt: "2026-08-09T10:00:17.000Z",
      cwd: "/tmp/project",
      model: null,
      recap: null,
      failReason: null,
      lastActivitySummary: "Spawned Explore subagent",
    };
    const result = synthesizeSubagentStart(failedChild, startPayload(), "2026-08-09T10:00:20.000Z");
    expect(result).toEqual(failedChild);
  });

  it("does not clobber an existing running row (duplicate SubagentStart delivery)", () => {
    const runningChild: Session = {
      id: "agent-123",
      parentSessionId: "parent-1",
      owner: "Explore",
      title: "Find TODO occurrences",
      status: "running",
      startedAt: "2026-08-09T10:00:00.000Z",
      endedAt: null,
      cwd: "/tmp/project",
      model: null,
      recap: null,
      failReason: null,
      lastActivitySummary: "Running Explore subagent",
    };
    const result = synthesizeSubagentStart(runningChild, startPayload(), "2026-08-09T10:00:05.000Z");
    expect(result).toEqual(runningChild);
  });
});

describe("synthesizeSubagentStop", () => {
  const runningChild: Session = {
    id: "agent-123",
    parentSessionId: "parent-1",
    owner: "Explore",
    title: null,
    status: "running",
    startedAt: "2026-08-09T10:00:00.000Z",
    endedAt: null,
    cwd: "/tmp/project",
    model: null,
    recap: null,
    failReason: null,
    lastActivitySummary: "Running Explore subagent",
  };

  function stopPayload(overrides: Partial<SubagentStopPayload> = {}): SubagentStopPayload {
    return {
      hook_event_name: "SubagentStop",
      session_id: "parent-1",
      agent_id: "agent-123",
      agent_type: "Explore",
      ...overrides,
    };
  }

  it("transitions a running child to done", () => {
    const updated = synthesizeSubagentStop(runningChild, stopPayload(), "2026-08-09T10:00:17.000Z");
    expect(updated).toEqual({
      ...runningChild,
      status: "done",
      endedAt: "2026-08-09T10:00:17.000Z",
      lastActivitySummary: "Subagent finished",
    });
  });

  it("never regresses an already-failed child back to done", () => {
    const failedChild: Session = { ...runningChild, status: "failed", endedAt: "2026-08-09T10:00:10.000Z" };
    const updated = synthesizeSubagentStop(failedChild, stopPayload(), "2026-08-09T10:00:17.000Z");
    expect(updated).toEqual(failedChild);
  });

  it("returns null when agent_id is missing", () => {
    expect(synthesizeSubagentStop(runningChild, stopPayload({ agent_id: undefined }), "2026-08-09T10:00:17.000Z")).toBeNull();
  });

  it("returns null when agent_type is empty (background-job false positive filter)", () => {
    expect(synthesizeSubagentStop(runningChild, stopPayload({ agent_type: "" }), "2026-08-09T10:00:17.000Z")).toBeNull();
  });
});

describe("mergeSubagentTitle", () => {
  const doneChild: Session = {
    id: "agent-123",
    parentSessionId: "parent-1",
    owner: "Explore",
    title: null,
    status: "done",
    startedAt: "2026-08-09T10:00:00.000Z",
    endedAt: "2026-08-09T10:00:17.000Z",
    cwd: "/tmp/project",
    model: null,
    recap: null,
    failReason: null,
    lastActivitySummary: "Subagent finished",
  };

  function toolUsePayload(overrides: Partial<PostToolUsePayload> = {}): PostToolUsePayload {
    return {
      hook_event_name: "PostToolUse",
      session_id: "parent-1",
      cwd: "/tmp/project",
      tool_name: "Agent",
      tool_input: { subagent_type: "Explore", description: "Find TODO occurrences" },
      tool_response: { agentId: "agent-123" },
      ...overrides,
    };
  }

  it("sets the title when the existing row has none yet", () => {
    const merged = mergeSubagentTitle(doneChild, toolUsePayload(), "2026-08-09T10:00:18.000Z");
    expect(merged.title).toBe("Find TODO occurrences");
  });

  it("keeps the existing title rather than overwriting it", () => {
    const alreadyTitled = { ...doneChild, title: "Original title" };
    const merged = mergeSubagentTitle(alreadyTitled, toolUsePayload(), "2026-08-09T10:00:18.000Z");
    expect(merged.title).toBe("Original title");
  });

  it("leaves status alone when there is no tool_response error", () => {
    const merged = mergeSubagentTitle(doneChild, toolUsePayload(), "2026-08-09T10:00:18.000Z");
    expect(merged.status).toBe("done");
    expect(merged.endedAt).toBe(doneChild.endedAt);
  });

  it("escalates status to failed and updates endedAt when tool_response has an error", () => {
    const merged = mergeSubagentTitle(
      doneChild,
      toolUsePayload({ tool_response: { agentId: "agent-123", error: "boom" } }),
      "2026-08-09T10:00:18.000Z"
    );
    expect(merged.status).toBe("failed");
    expect(merged.endedAt).toBe("2026-08-09T10:00:18.000Z");
    expect(merged.failReason).toBe("boom");
  });

  it("does not change endedAt when already failed and an error is present again", () => {
    const alreadyFailed = { ...doneChild, status: "failed" as const, endedAt: "2026-08-09T10:00:17.000Z" };
    const merged = mergeSubagentTitle(
      alreadyFailed,
      toolUsePayload({ tool_response: { agentId: "agent-123", error: "boom" } }),
      "2026-08-09T10:00:18.000Z"
    );
    expect(merged.endedAt).toBe("2026-08-09T10:00:17.000Z");
  });

  it("sets lastActivitySummary from the merging PostToolUse call", () => {
    const merged = mergeSubagentTitle(doneChild, toolUsePayload(), "2026-08-09T10:00:18.000Z");
    expect(merged.lastActivitySummary).toBe("Spawned Explore subagent");
  });
});
