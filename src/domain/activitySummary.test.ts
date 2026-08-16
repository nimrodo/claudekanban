import { describe, expect, it } from "vitest";
import { summarizeEvent, classifyIconKind } from "./activitySummary.js";

describe("summarizeEvent", () => {
  it("summarizes SessionStart", () => {
    expect(summarizeEvent("SessionStart", {})).toBe("Session started");
  });

  it("summarizes a plain PostToolUse call by tool name", () => {
    expect(summarizeEvent("PostToolUse", { tool_name: "Bash" })).toBe("Called Bash");
  });

  it("summarizes a subagent-spawning PostToolUse call", () => {
    expect(
      summarizeEvent("PostToolUse", { tool_name: "Agent", tool_input: { subagent_type: "Explore" } })
    ).toBe("Spawned Explore subagent");
  });

  it("summarizes PermissionRequest with the tool_input description when present", () => {
    expect(
      summarizeEvent("PermissionRequest", {
        tool_name: "Bash",
        tool_input: { command: "rm nimrod.txt", description: "Remove nimrod.txt" },
      })
    ).toBe("Requested permission: Remove nimrod.txt");
  });

  it("summarizes PermissionRequest without a description by tool name", () => {
    expect(summarizeEvent("PermissionRequest", { tool_name: "Bash" })).toBe("Requested permission to use Bash");
  });

  it("summarizes an idle_prompt Notification", () => {
    expect(summarizeEvent("Notification", { notification_type: "idle_prompt" })).toBe("Waiting for input");
  });

  it("summarizes a non-idle_prompt Notification by its type", () => {
    expect(summarizeEvent("Notification", { notification_type: "something_else" })).toBe(
      "Notification: something_else"
    );
  });

  it("summarizes Stop", () => {
    expect(summarizeEvent("Stop", {})).toBe("Session finished");
  });

  it("summarizes SubagentStart with an agent_type", () => {
    expect(summarizeEvent("SubagentStart", { agent_type: "Explore" })).toBe("Running Explore subagent");
  });

  it("summarizes SubagentStart without an agent_type", () => {
    expect(summarizeEvent("SubagentStart", {})).toBe("Subagent started");
  });

  it("summarizes SubagentStop", () => {
    expect(summarizeEvent("SubagentStop", {})).toBe("Subagent finished");
  });

  it("falls back to the raw type for an unrecognized event type", () => {
    expect(summarizeEvent("SomeUnknownEvent", {})).toBe("SomeUnknownEvent");
  });
});

describe("classifyIconKind", () => {
  it("classifies SessionStart as start, Stop as stop", () => {
    expect(classifyIconKind("SessionStart", {})).toBe("start");
    expect(classifyIconKind("Stop", {})).toBe("stop");
  });

  it("classifies a subagent-spawning PostToolUse call as spawn, a plain one as tool", () => {
    expect(classifyIconKind("PostToolUse", { tool_name: "Agent" })).toBe("spawn");
    expect(classifyIconKind("PostToolUse", { tool_name: "Bash" })).toBe("tool");
  });

  it("classifies PermissionRequest as permission, Notification as notification, unknown as other", () => {
    expect(classifyIconKind("PermissionRequest", {})).toBe("permission");
    expect(classifyIconKind("Notification", {})).toBe("notification");
    expect(classifyIconKind("SomethingNew", {})).toBe("other");
  });

  it("classifies SubagentStart as spawn and SubagentStop as stop", () => {
    expect(classifyIconKind("SubagentStart", {})).toBe("spawn");
    expect(classifyIconKind("SubagentStop", {})).toBe("stop");
  });
});
