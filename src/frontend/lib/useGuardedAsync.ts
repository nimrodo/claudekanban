import { useCallback, useEffect, useRef, useState } from "react";

export function useGuardedAsync<T>(
  fetchFn: () => Promise<T>,
  deps: unknown[],
  options: { enabled?: boolean } = {}
): { data: T | null; loading: boolean; error: string | null; refetch: () => void } {
  const enabled = options.enabled ?? true;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestRequestId = useRef(0);
  const fetchRef = useRef(fetchFn);
  fetchRef.current = fetchFn;

  const refetch = useCallback(() => {
    latestRequestId.current += 1;
    const requestId = latestRequestId.current;
    setLoading(true);
    setError(null);
    fetchRef
      .current()
      .then((result) => {
        if (requestId === latestRequestId.current) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (requestId === latestRequestId.current) {
          setError(err instanceof Error ? err.message : "Failed to load");
          setLoading(false);
        }
      });
  }, []);

  useEffect(() => {
    if (!enabled) {
      latestRequestId.current += 1;
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    refetch();
    return () => {
      // Bumping the request id on cleanup invalidates any in-flight fetch from this
      // render's deps, so a late-resolving promise (from an unmount or a dep change)
      // is ignored the same way a stale response would be.
      latestRequestId.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, refetch, ...deps]);

  return { data, loading, error, refetch };
}
