import { describe, expect, it } from "vitest";
import { deriveStatus, type HookPayload } from "./stateMachine.js";

function payload(overrides: Partial<HookPayload>): HookPayload {
  return { hook_event_name: "SessionStart", session_id: "sess-1", ...overrides };
}

describe("deriveStatus", () => {
  it("SessionStart on a new session yields running", () => {
    expect(deriveStatus(undefined, payload({ hook_event_name: "SessionStart" }))).toBe("running");
  });

  it("PermissionRequest yields waiting", () => {
    expect(deriveStatus("running", payload({ hook_event_name: "PermissionRequest" }))).toBe("waiting");
  });

  it("Notification with idle_prompt yields waiting", () => {
    expect(
      deriveStatus("running", payload({ hook_event_name: "Notification", notification_type: "idle_prompt" }))
    ).toBe("waiting");
  });

  it("Notification without idle_prompt leaves status unchanged", () => {
    expect(
      deriveStatus("running", payload({ hook_event_name: "Notification", notification_type: "auth_success" }))
    ).toBe("running");
  });

  it("PostToolUse after waiting returns to running", () => {
    expect(deriveStatus("waiting", payload({ hook_event_name: "PostToolUse" }))).toBe("running");
  });

  it("PostToolUse while running stays running", () => {
    expect(deriveStatus("running", payload({ hook_event_name: "PostToolUse" }))).toBe("running");
  });

  it("Stop without an error signal yields done", () => {
    expect(deriveStatus("running", payload({ hook_event_name: "Stop" }))).toBe("done");
  });

  it("Stop with is_error true yields failed", () => {
    expect(deriveStatus("running", payload({ hook_event_name: "Stop", is_error: true }))).toBe("failed");
  });

  it("unknown event preserves current status, defaulting to running if unset", () => {
    expect(deriveStatus(undefined, payload({ hook_event_name: "SomeFutureEvent" as HookPayload["hook_event_name"] }))).toBe(
      "running"
    );
    expect(deriveStatus("waiting", payload({ hook_event_name: "SomeFutureEvent" as HookPayload["hook_event_name"] }))).toBe(
      "waiting"
    );
  });
});
