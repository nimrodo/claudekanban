import type { Session } from "../store/sessionStore.js";

export interface PostToolUsePayload {
  hook_event_name: "PostToolUse";
  session_id: string;
  cwd: string;
  tool_name: string;
  tool_input: { subagent_type?: string; description?: string; [key: string]: unknown };
  tool_response?: { agentId?: string; error?: unknown; [key: string]: unknown };
}

export function synthesizeSubagentSession(payload: PostToolUsePayload, receivedAt: string): Session | null {
  if (payload.tool_name !== "Agent" && payload.tool_name !== "Task") return null;
  const agentId = payload.tool_response?.agentId;
  if (!agentId) return null;

  const failed = Boolean(payload.tool_response?.error);
  return {
    id: agentId,
    parentSessionId: payload.session_id,
    owner: payload.tool_input.subagent_type ?? "unknown",
    title: payload.tool_input.description || null,
    status: failed ? "failed" : "done",
    startedAt: receivedAt,
    endedAt: receivedAt,
    cwd: payload.cwd,
    model: null,
    recap: null,
  };
}
