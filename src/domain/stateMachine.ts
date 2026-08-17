import type { SessionStatus } from "../store/sessionStore.js";

export interface HookPayload {
  hook_event_name: string;
  session_id: string;
  cwd?: string;
  model?: string;
  tool_name?: string;
  tool_input?: { subagent_type?: string; [key: string]: unknown };
  tool_response?: { agentId?: string; error?: unknown; [key: string]: unknown };
  last_assistant_message?: string;
  notification_type?: string;
  // UserPromptSubmit's prompt-text field. Named `prompt`, confirmed via a live re-spike
  // (spike/findings.md, "UserPromptSubmit payload shape") — the official docs claim
  // `user_input`, but the live payload does not have that field.
  prompt?: string;
  // Unconfirmed: no capture in spike/findings.md's "Stop payload / recap" section has ever
  // shown an error/failure field on a Stop event. Named ahead of a live capture so only this
  // field needs updating once one is confirmed; until then stopFailed() is always false.
  is_error?: boolean;
  [key: string]: unknown;
}

function stopFailed(payload: HookPayload): boolean {
  return Boolean(payload.is_error);
}

export function deriveStatus(currentStatus: SessionStatus | undefined, payload: HookPayload): SessionStatus {
  switch (payload.hook_event_name) {
    case "SessionStart":
      return "running";
    case "PermissionRequest":
      return "waiting";
    case "Notification":
      return payload.notification_type === "idle_prompt" ? "waiting" : currentStatus ?? "running";
    case "PostToolUse":
      return "running";
    case "Stop":
      return stopFailed(payload) ? "failed" : "done";
    default:
      return currentStatus ?? "running";
  }
}
