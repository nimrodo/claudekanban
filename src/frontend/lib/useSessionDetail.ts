import { useEffect, useRef, useState } from "react";
import type { SessionDetailResponse, StreamEvent, Transport } from "./transport/Transport.js";

export function useSessionDetail(
  transport: Transport,
  sessionId: string | null
): { detail: SessionDetailResponse | null; loading: boolean } {
  const [detail, setDetail] = useState<SessionDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const latestRequestId = useRef(0);

  useEffect(() => {
    if (!sessionId) {
      setDetail(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setDetail(null);
    setLoading(true);

    function fetchDetail() {
      latestRequestId.current += 1;
      const requestId = latestRequestId.current;
      transport.getSessionDetail(sessionId as string).then((result) => {
        if (!cancelled && requestId === latestRequestId.current) {
          setDetail(result);
          setLoading(false);
        }
      });
    }

    fetchDetail();

    const unsubscribe = transport.subscribe((event: StreamEvent) => {
      if (event.entityId === sessionId) {
        fetchDetail();
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [transport, sessionId]);

  return { detail, loading };
}
