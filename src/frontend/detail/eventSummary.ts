import type { EventDto } from "../lib/transport/Transport.js";

export interface TimelineEntry {
  id: number;
  ts: string;
  type: string;
  summary: string;
  raw: unknown;
}

interface ToolCallPayload {
  tool_name?: string;
  tool_input?: { subagent_type?: string; description?: string; [key: string]: unknown };
  notification_type?: string;
}

function summarize(type: string, payload: ToolCallPayload): string {
  switch (type) {
    case "SessionStart":
      return "Session started";
    case "PostToolUse": {
      const toolName = payload.tool_name ?? "a tool";
      if (toolName === "Agent" || toolName === "Task") {
        const subagentType = payload.tool_input?.subagent_type ?? "subagent";
        return `Spawned ${subagentType} subagent`;
      }
      return `Called ${toolName}`;
    }
    case "PermissionRequest": {
      const description = payload.tool_input?.description;
      const toolName = payload.tool_name ?? "a tool";
      return description ? `Requested permission: ${description}` : `Requested permission to use ${toolName}`;
    }
    case "Notification": {
      const notificationType = payload.notification_type;
      if (notificationType === "idle_prompt") return "Waiting for input";
      return notificationType ? `Notification: ${notificationType}` : "Notification";
    }
    case "Stop":
      return "Session finished";
    default:
      return type;
  }
}

export function buildTimeline(events: EventDto[]): TimelineEntry[] {
  return events
    .map((event) => {
      let raw: unknown = {};
      try {
        raw = JSON.parse(event.payload);
      } catch {
        raw = event.payload;
      }
      return {
        id: event.id,
        ts: event.ts,
        type: event.type,
        summary: summarize(event.type, (raw ?? {}) as ToolCallPayload),
        raw,
      };
    })
    .sort((a, b) => b.id - a.id);
}
