import { describe, expect, it } from "vitest";
import { synthesizeSubagentSession, type PostToolUsePayload } from "./subagentSynthesis.js";

function payload(overrides: Partial<PostToolUsePayload>): PostToolUsePayload {
  return {
    hook_event_name: "PostToolUse",
    session_id: "parent-1",
    cwd: "/tmp/project",
    tool_name: "Agent",
    tool_input: { subagent_type: "Explore" },
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
      status: "done",
      startedAt: "2026-08-08T10:00:05.000Z",
      endedAt: "2026-08-08T10:00:05.000Z",
      cwd: "/tmp/project",
      model: null,
      recap: null,
    });
  });

  it("synthesizes a failed child session when tool_response carries an error", () => {
    const child = synthesizeSubagentSession(
      payload({ tool_response: { agentId: "agent-456", error: "timed out" } }),
      "2026-08-08T10:00:05.000Z"
    );
    expect(child?.status).toBe("failed");
  });

  it("defaults owner to \"unknown\" when subagent_type is missing", () => {
    const child = synthesizeSubagentSession(payload({ tool_input: {} }), "2026-08-08T10:00:05.000Z");
    expect(child?.owner).toBe("unknown");
  });

  it("recognizes tool_name \"Task\" as well as \"Agent\"", () => {
    expect(synthesizeSubagentSession(payload({ tool_name: "Task" }), "2026-08-08T10:00:05.000Z")).not.toBeNull();
  });
});
