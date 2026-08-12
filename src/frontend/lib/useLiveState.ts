import { useEffect, useState } from "react";
import type { SessionDto, Transport } from "./transport/Transport.js";
import { useGuardedAsync } from "./useGuardedAsync.js";
import { applySessionEvent } from "./applySessionEvent.js";

export function useLiveState(transport: Transport): { sessions: SessionDto[] } {
  const { data } = useGuardedAsync(() => transport.getState(), [transport]);
  const [sessions, setSessions] = useState<SessionDto[]>([]);

  useEffect(() => {
    if (data) setSessions(data.sessions);
  }, [data]);

  useEffect(() => {
    return transport.subscribe((event) => {
      setSessions((prev) => applySessionEvent(prev, event));
    });
  }, [transport]);

  return { sessions };
}
