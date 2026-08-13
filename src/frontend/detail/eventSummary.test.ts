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

  it("orders entries newest-first by id", () => {
    const entries = buildTimeline([event({ id: 1 }), event({ id: 3 }), event({ id: 2 })]);
    expect(entries.map((e) => e.id)).toEqual([3, 2, 1]);
  });

  it("exposes the parsed payload as a single-element raw array, with count 1", () => {
    const [entry] = buildTimeline([event({ payload: JSON.stringify({ tool_name: "Bash" }) })]);
    expect(entry.raw).toEqual([{ tool_name: "Bash" }]);
    expect(entry.count).toBe(1);
  });
});
