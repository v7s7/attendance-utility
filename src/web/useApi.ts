import { useEffect, useState } from "react";

export interface ApiState<T> {
  data: T | undefined;
  error: Error | undefined;
  /** True on the first load and while reloading; old data stays visible meanwhile. */
  loading: boolean;
  reload: () => void;
}

/**
 * Load data for a page. `key` identifies the request (e.g. the URL); when it
 * changes the data is fetched again. Pass null to skip loading.
 */
export function useApi<T>(key: string | null, load: () => Promise<T>): ApiState<T> {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{ key: string; version: number; data?: T; error?: Error } | null>(null);

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    load().then(
      (data) => !cancelled && setResult({ key, version, data }),
      (error: Error) => !cancelled && setResult({ key, version, error }),
    );
    return () => {
      cancelled = true;
    };
    // `load` is a new function on every render; `key` and `version` decide when to fetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);

  const current = result?.key === key ? result : null;
  return {
    data: current?.data,
    error: current?.error,
    loading: key !== null && (!current || current.version !== version),
    reload: () => setVersion((v) => v + 1),
  };
}
