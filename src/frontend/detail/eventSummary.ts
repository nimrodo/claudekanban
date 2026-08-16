import type { EventDto } from "../lib/transport/Transport.js";
import { summarizeEvent, classifyIconKind, type TimelineIconKind, type ActivityPayload } from "../../domain/activitySummary.js";

export type { TimelineIconKind };

export interface TimelineEntry {
  id: number;
  ts: string;
  type: string;
  summary: string;
  raw: unknown[];
  count: number;
  iconKind: TimelineIconKind;
}

function groupingKey(type: string, payload: ActivityPayload): string {
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
  iconKind: TimelineIconKind;
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
      const payload = (raw ?? {}) as ActivityPayload;
      return {
        id: event.id,
        ts: event.ts,
        type: event.type,
        summary: summarizeEvent(event.type, payload),
        raw,
        key: groupingKey(event.type, payload),
        iconKind: classifyIconKind(event.type, payload),
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
        iconKind: latest.iconKind,
      };
    })
    .sort((a, b) => b.id - a.id);
}
