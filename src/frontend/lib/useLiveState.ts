import { useEffect, useRef, useState } from "react";
import type { SessionDto, Transport } from "./transport/Transport.js";

export function useLiveState(transport: Transport): { sessions: SessionDto[] } {
  const [sessions, setSessions] = useState<SessionDto[]>([]);
  const latestRequestId = useRef(0);

  useEffect(() => {
    let cancelled = false;

    function fetchState() {
      latestRequestId.current += 1;
      const requestId = latestRequestId.current;
      transport.getState().then((state) => {
        if (!cancelled && requestId === latestRequestId.current) {
          setSessions(state.sessions);
        }
      });
    }

    fetchState();

    const unsubscribe = transport.subscribe(() => {
      fetchState();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [transport]);

  return { sessions };
}
