import { useEffect, useState } from "react";
import type { SessionDto, Transport } from "./transport/Transport.js";

export function useLiveState(transport: Transport): { sessions: SessionDto[] } {
  const [sessions, setSessions] = useState<SessionDto[]>([]);

  useEffect(() => {
    let cancelled = false;

    transport.getState().then((state) => {
      if (!cancelled) setSessions(state.sessions);
    });

    const unsubscribe = transport.subscribe(() => {
      transport.getState().then((state) => {
        if (!cancelled) setSessions(state.sessions);
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [transport]);

  return { sessions };
}
