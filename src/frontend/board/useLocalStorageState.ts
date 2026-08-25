import { useEffect, useState } from "react";

/**
 * useState backed by localStorage under `key`, JSON-serialized. Reads the stored value
 * synchronously on first render (no flash of default). Falls back to `defaultValue` if
 * the key is absent, unparsable, or localStorage is unavailable (e.g. SSR, privacy mode) —
 * failures are swallowed, not thrown, since this is a persistence nicety, not a
 * correctness-critical path.
 */
export function useLocalStorageState<T>(
  key: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readStored(key, defaultValue));

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore write failures (quota, privacy mode, non-browser env)
    }
  }, [key, value]);

  return [value, setValue];
}

function readStored<T>(key: string, defaultValue: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? defaultValue : (JSON.parse(raw) as T);
  } catch {
    return defaultValue;
  }
}
