import { describe, expect, it } from "vitest";
import { buildTimeline } from "./eventSummary.js";
import type { EventDto } from "../lib/transport/Transport.js";

function event(overrides: Partial<EventDto>): EventDto {
  return {
    id: 1,
    sessionId: "sess-1",
    ts: "2026-08-08T10:00:00.000Z",
    type: "SessionStart",
    payload: "{}",
    ...overrides,
  };
}

describe("buildTimeline", () => {
  it("summarizes SessionStart", () => {
    const [entry] = buildTimeline([event({ type: "SessionStart", payload: "{}" })]);
    expect(entry.summary).toBe("Session started");
  });

  it("summarizes a plain PostToolUse call by tool name", () => {
    const [entry] = buildTimeline([
      event({ type: "PostToolUse", payload: JSON.stringify({ tool_name: "Bash" }) }),
    ]);
    expect(entry.summary).toBe("Called Bash");
  });

  it("summarizes a subagent-spawning PostToolUse call", () => {
    const [entry] = buildTimeline([
      event({
        type: "PostToolUse",
        payload: JSON.stringify({ tool_name: "Agent", tool_input: { subagent_type: "Explore" } }),
      }),
    ]);
    expect(entry.summary).toBe("Spawned Explore subagent");
  });

  it("summarizes PermissionRequest with the tool_input description when present", () => {
    const [entry] = buildTimeline([
      event({
        type: "PermissionRequest",
        payload: JSON.stringify({ tool_name: "Bash", tool_input: { command: "rm nimrod.txt", description: "Remove nimrod.txt" } }),
      }),
    ]);
    expect(entry.summary).toBe("Requested permission: Remove nimrod.txt");
  });

  it("summarizes PermissionRequest without a description by tool name", () => {
    const [entry] = buildTimeline([
      event({ type: "PermissionRequest", payload: JSON.stringify({ tool_name: "Bash" }) }),
    ]);
    expect(entry.summary).toBe("Requested permission to use Bash");
  });

  it("summarizes an idle_prompt Notification", () => {
    const [entry] = buildTimeline([
      event({ type: "Notification", payload: JSON.stringify({ notification_type: "idle_prompt" }) }),
    ]);
    expect(entry.summary).toBe("Waiting for input");
  });

  it("summarizes Stop", () => {
    const [entry] = buildTimeline([event({ type: "Stop", payload: "{}" })]);
    expect(entry.summary).toBe("Session finished");
  });

  it("falls back to the raw type for an unrecognized event type", () => {
    const [entry] = buildTimeline([event({ type: "SomethingNew", payload: "{}" })]);
    expect(entry.summary).toBe("SomethingNew");
  });

  it("collapses consecutive PostToolUse calls with the same tool_name into one entry", () => {
    const entries = buildTimeline([
      event({ id: 1, type: "PostToolUse", payload: JSON.stringify({ tool_name: "Bash" }) }),
      event({ id: 2, type: "PostToolUse", payload: JSON.stringify({ tool_name: "Bash" }) }),
      event({ id: 3, type: "PostToolUse", payload: JSON.stringify({ tool_name: "Bash" }) }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].count).toBe(3);
    expect(entries[0].id).toBe(3);
    expect(entries[0].raw).toEqual([
      { tool_name: "Bash" },
      { tool_name: "Bash" },
      { tool_name: "Bash" },
    ]);
  });

  it("does not collapse consecutive PostToolUse calls with different tool_name", () => {
    const entries = buildTimeline([
      event({ id: 1, type: "PostToolUse", payload: JSON.stringify({ tool_name: "Bash" }) }),
      event({ id: 2, type: "PostToolUse", payload: JSON.stringify({ tool_name: "Read" }) }),
    ]);
    expect(entries).toHaveLength(2);
  });

  it("does not collapse two same-tool calls separated by a different event", () => {
    const entries = buildTimeline([
      event({ id: 1, type: "PostToolUse", payload: JSON.stringify({ tool_name: "Bash" }) }),
      event({ id: 2, type: "Notification", payload: JSON.stringify({ notification_type: "idle_prompt" }) }),
      event({ id: 3, type: "PostToolUse", payload: JSON.stringify({ tool_name: "Bash" }) }),
    ]);
    expect(entries).toHaveLength(3);
  });

  it("orders entries newest-first by id", () => {
    const entries = buildTimeline([
      event({ id: 1, type: "SessionStart" }),
      event({ id: 3, type: "Stop" }),
      event({ id: 2, type: "PermissionRequest" }),
    ]);
    expect(entries.map((e) => e.id)).toEqual([3, 2, 1]);
  });

  it("classifies a subagent-spawning PostToolUse call as iconKind spawn, and a plain tool call as tool", () => {
    const [spawn] = buildTimeline([
      event({ type: "PostToolUse", payload: JSON.stringify({ tool_name: "Agent", tool_input: { subagent_type: "Explore" } }) }),
    ]);
    expect(spawn.iconKind).toBe("spawn");

    const [tool] = buildTimeline([
      event({ type: "PostToolUse", payload: JSON.stringify({ tool_name: "Bash" }) }),
    ]);
    expect(tool.iconKind).toBe("tool");
  });

  it("classifies SessionStart as start, Stop as stop, PermissionRequest as permission, Notification as notification, and unknown types as other", () => {
    expect(buildTimeline([event({ type: "SessionStart" })])[0].iconKind).toBe("start");
    expect(buildTimeline([event({ type: "Stop" })])[0].iconKind).toBe("stop");
    expect(buildTimeline([event({ type: "PermissionRequest" })])[0].iconKind).toBe("permission");
    expect(buildTimeline([event({ type: "Notification" })])[0].iconKind).toBe("notification");
    expect(buildTimeline([event({ type: "SomethingNew" })])[0].iconKind).toBe("other");
  });

  it("exposes the parsed payload as a single-element raw array, with count 1", () => {
    const [entry] = buildTimeline([event({ payload: JSON.stringify({ tool_name: "Bash" }) })]);
    expect(entry.raw).toEqual([{ tool_name: "Bash" }]);
    expect(entry.count).toBe(1);
  });
});
