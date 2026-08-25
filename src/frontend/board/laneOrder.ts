import type { SessionDto, SessionStatus } from "../lib/transport/Transport.js";
import { groupSessions } from "./groupSessions.js";

export type LaneSort = "activity" | "name" | "sessions";

export interface Lane {
  cwd: string;
  label: string;
  total: number;
  byStatus: Record<SessionStatus, SessionDto[]>;
  childrenByParent: Map<string, SessionDto[]>;
}

export function cwdLabel(cwd: string): string {
  return cwd.replace(/\/+$/, "").split("/").pop() || cwd;
}

export function laneWeight(byStatus: Record<SessionStatus, SessionDto[]>): number {
  return (
    byStatus.running.length * 100 +
    byStatus.waiting.length * 50 +
    byStatus.queued.length * 10 +
    byStatus.failed.length * 5
  );
}

function groupByStatus(sessions: SessionDto[]): Record<SessionStatus, SessionDto[]> {
  const result: Record<SessionStatus, SessionDto[]> = {
    queued: [],
    running: [],
    waiting: [],
    done: [],
    failed: [],
  };

  for (const session of sessions) {
    result[session.status].push(session);
  }

  return result;
}

function sortLanes(lanes: Lane[], sort: LaneSort): Lane[] {
  const copy = [...lanes];

  if (sort === "activity") {
    copy.sort((a, b) => {
      const weightA = laneWeight(a.byStatus);
      const weightB = laneWeight(b.byStatus);

      if (weightA !== weightB) {
        return weightB - weightA; // descending by weight
      }

      // Tie-break by most recent startedAt
      const maxStartA = Math.max(
        ...a.byStatus.queued
          .concat(a.byStatus.running, a.byStatus.waiting, a.byStatus.done, a.byStatus.failed)
          .map((s) => new Date(s.startedAt).getTime())
      );
      const maxStartB = Math.max(
        ...b.byStatus.queued
          .concat(b.byStatus.running, b.byStatus.waiting, b.byStatus.done, b.byStatus.failed)
          .map((s) => new Date(s.startedAt).getTime())
      );

      return maxStartB - maxStartA; // descending, more recent first
    });
  } else if (sort === "name") {
    copy.sort((a, b) => a.label.localeCompare(b.label));
  } else if (sort === "sessions") {
    copy.sort((a, b) => b.total - a.total); // descending by total
  }

  return copy;
}

export function buildLanes(sessions: SessionDto[], sort: LaneSort): Lane[] {
  const { topLevel, childrenByParent } = groupSessions(sessions);
  const byCwd = new Map<string, SessionDto[]>();

  for (const s of topLevel) {
    const list = byCwd.get(s.cwd);
    if (list) {
      list.push(s);
    } else {
      byCwd.set(s.cwd, [s]);
    }
  }

  const lanes: Lane[] = Array.from(byCwd.entries()).map(([cwd, laneSessions]) => {
    const byStatus = groupByStatus(laneSessions);
    return {
      cwd,
      label: cwdLabel(cwd),
      total: laneSessions.length,
      byStatus,
      childrenByParent,
    };
  });

  return sortLanes(lanes, sort);
}
