import type { SessionDto, StreamEvent } from "./transport/Transport.js";

export function applySessionEvent(sessions: SessionDto[], event: StreamEvent): SessionDto[] {
  switch (event.type) {
    case "session-changed": {
      if (!event.patch) return sessions;
      const patch = event.patch;
      const idx = sessions.findIndex((s) => s.id === patch.id);
      if (idx === -1) return [...sessions, patch];
      const next = [...sessions];
      next[idx] = patch;
      return next;
    }
    case "resync":
      return event.sessions;
  }
}
