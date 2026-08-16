export type TimelineIconKind = "start" | "stop" | "tool" | "spawn" | "permission" | "notification" | "other";

export interface ActivityPayload {
  tool_name?: string;
  tool_input?: { subagent_type?: string; description?: string; [key: string]: unknown };
  notification_type?: string;
  agent_type?: string;
}

export function summarizeEvent(type: string, payload: ActivityPayload): string {
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
    case "SubagentStart": {
      const agentType = payload.agent_type;
      return agentType ? `Running ${agentType} subagent` : "Subagent started";
    }
    case "SubagentStop":
      return "Subagent finished";
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

export function classifyIconKind(type: string, payload: ActivityPayload): TimelineIconKind {
  switch (type) {
    case "SessionStart":
      return "start";
    case "Stop":
      return "stop";
    case "PostToolUse":
      return payload.tool_name === "Agent" || payload.tool_name === "Task" ? "spawn" : "tool";
    case "SubagentStart":
      return "spawn";
    case "SubagentStop":
      return "stop";
    case "PermissionRequest":
      return "permission";
    case "Notification":
      return "notification";
    default:
      return "other";
  }
}
