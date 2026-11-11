'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from './api';

export interface ApiState<T> {
  data: T | null;
  error: string | null;
  /** идёт запрос (в том числе повторный — при этом data содержит предыдущий результат) */
  loading: boolean;
  reload: () => void;
}

/**
 * GET-запрос к API с отменой устаревших запросов. `path = null` — запрос не выполняется.
 * Предыдущие данные сохраняются на время перезагрузки, чтобы интерфейс не «мигал».
 */
export function useApi<T>(path: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const [nonce, setNonce] = useState(0);
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (path === null) {
      setLoading(false);
      return;
    }
    if (lastPath.current !== path) setError(null);
    lastPath.current = path;

    const ctrl = new AbortController();
    setLoading(true);
    apiFetch<T>(path, { signal: ctrl.signal })
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err.message ?? 'Не удалось загрузить данные');
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [path, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload };
}
