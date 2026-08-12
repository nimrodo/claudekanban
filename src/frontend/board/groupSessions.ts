import type { SessionDto } from "../lib/transport/Transport.js";

export interface GroupedSessions {
  topLevel: SessionDto[];
  childrenByParent: Map<string, SessionDto[]>;
}

export function groupSessions(sessions: SessionDto[]): GroupedSessions {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const topLevel = sessions.filter((s) => !s.parentSessionId || !byId.has(s.parentSessionId));

  const childrenByParent = new Map<string, SessionDto[]>();
  for (const s of sessions) {
    if (!s.parentSessionId || !byId.has(s.parentSessionId)) continue;
    const siblings = childrenByParent.get(s.parentSessionId);
    if (siblings) {
      siblings.push(s);
    } else {
      childrenByParent.set(s.parentSessionId, [s]);
    }
  }

  return { topLevel, childrenByParent };
}
