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

export interface SubagentStartPayload {
  hook_event_name: "SubagentStart";
  session_id: string;
  cwd: string;
  agent_id?: string;
  agent_type?: string;
}

export function synthesizeSubagentStart(existing: Session | undefined, payload: SubagentStartPayload, receivedAt: string): Session | null {
  if (!payload.agent_id || !payload.agent_type) return null;
  if (existing && (existing.status === "done" || existing.status === "failed")) return existing;
  return {
    id: payload.agent_id,
    parentSessionId: payload.session_id,
    owner: payload.agent_type,
    title: null,
    status: "running",
    startedAt: receivedAt,
    endedAt: null,
    cwd: payload.cwd,
    model: null,
    recap: null,
  };
}

export interface SubagentStopPayload {
  hook_event_name: "SubagentStop";
  session_id: string;
  agent_id?: string;
  agent_type?: string;
}

export function synthesizeSubagentStop(existing: Session, payload: SubagentStopPayload, receivedAt: string): Session | null {
  if (!payload.agent_id || !payload.agent_type) return null;
  if (existing.status === "failed") return existing;
  return {
    ...existing,
    status: "done",
    endedAt: receivedAt,
  };
}

export function mergeSubagentTitle(existing: Session, payload: PostToolUsePayload, receivedAt: string): Session {
  const failed = Boolean(payload.tool_response?.error);
  return {
    ...existing,
    title: existing.title ?? (payload.tool_input.description || null),
    status: failed ? "failed" : existing.status,
    endedAt: failed && existing.status !== "failed" ? receivedAt : existing.endedAt,
  };
}
