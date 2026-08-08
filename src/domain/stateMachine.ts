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
  [key: string]: unknown;
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
      return "done";
    default:
      return currentStatus ?? "running";
  }
}
