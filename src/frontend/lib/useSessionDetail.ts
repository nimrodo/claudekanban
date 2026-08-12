import { useEffect } from "react";
import type { SessionDetailResponse, StreamEvent, Transport } from "./transport/Transport.js";
import { useGuardedAsync } from "./useGuardedAsync.js";

export function useSessionDetail(
  transport: Transport,
  sessionId: string | null
): { detail: SessionDetailResponse | null; loading: boolean; error: string | null } {
  const { data, loading, error, refetch } = useGuardedAsync<SessionDetailResponse>(
    () => transport.getSessionDetail(sessionId as string),
    [transport, sessionId],
    { enabled: sessionId !== null }
  );

  useEffect(() => {
    if (!sessionId) return;
    return transport.subscribe((event: StreamEvent) => {
      if (event.type === "session-changed" && event.entityId === sessionId) {
        refetch();
      } else if (event.type === "resync") {
        refetch();
      }
    });
  }, [transport, sessionId, refetch]);

  return { detail: data, loading, error };
}
