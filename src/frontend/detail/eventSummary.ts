import type { EventDto } from "../lib/transport/Transport.js";

export interface TimelineEntry {
  id: number;
  ts: string;
  type: string;
  summary: string;
  raw: unknown[];
  count: number;
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

function groupingKey(type: string, payload: ToolCallPayload): string {
  switch (type) {
    case "PostToolUse":
      return `${type}:${payload.tool_name ?? ""}`;
    case "Notification":
      return `${type}:${payload.notification_type ?? ""}`;
    default:
      return type;
  }
}

interface MappedEvent {
  id: number;
  ts: string;
  type: string;
  summary: string;
  raw: unknown;
  key: string;
}

interface Group {
  entries: MappedEvent[];
  key: string;
}

export function buildTimeline(events: EventDto[]): TimelineEntry[] {
  const mapped: MappedEvent[] = events
    .map((event) => {
      let raw: unknown = {};
      try {
        raw = JSON.parse(event.payload);
      } catch {
        raw = event.payload;
      }
      const payload = (raw ?? {}) as ToolCallPayload;
      return {
        id: event.id,
        ts: event.ts,
        type: event.type,
        summary: summarize(event.type, payload),
        raw,
        key: groupingKey(event.type, payload),
      };
    })
    .sort((a, b) => a.id - b.id);

  const groups: Group[] = [];
  for (const entry of mapped) {
    const last = groups[groups.length - 1];
    if (last && last.key === entry.key) {
      last.entries.push(entry);
    } else {
      groups.push({ key: entry.key, entries: [entry] });
    }
  }

  return groups
    .map(({ entries }): TimelineEntry => {
      const latest = entries[entries.length - 1];
      return {
        id: latest.id,
        ts: latest.ts,
        type: latest.type,
        summary: latest.summary,
        raw: entries.map((e) => e.raw),
        count: entries.length,
      };
    })
    .sort((a, b) => b.id - a.id);
}
