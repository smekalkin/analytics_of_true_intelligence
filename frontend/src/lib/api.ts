export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
const TOKEN_KEY = 'ti.accessToken';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage недоступен — сессия будет только до перезагрузки */
  }
}

let unauthorizedHandler: (() => void) | null = null;
/** AuthProvider регистрирует обработчик: при 401 сбрасываем сессию и уводим на /login. */
export function onUnauthorized(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

type QueryValue = string | number | null | undefined | (string | number)[];

export function buildQuery(params: Record<string, QueryValue>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) sp.set(key, value.join(','));
    } else sp.set(key, String(value));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...opts.headers,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    // Сюда же попадают ошибки CORS — браузер их не различает, поэтому не утверждаем, что «сервер лежит»
    throw new ApiError(0, 'Не удалось связаться с сервером. Проверьте подключение к сети и адрес API.');
  }

  if (!res.ok) {
    let message = `Ошибка запроса (${res.status})`;
    let fromServer = false;
    try {
      const data = await res.json();
      if (Array.isArray(data?.message)) message = data.message.join('; ');
      else if (typeof data?.message === 'string') message = data.message;
      fromServer = message !== `Ошибка запроса (${res.status})`;
    } catch {
      /* тело не JSON */
    }
    // 500 — внутренняя ошибка, детали наружу не показываем. 502/503 несут осмысленное сообщение
    // (например, «внешний API недоступен после 4 попыток») — его и показываем.
    if (res.status === 500 || (res.status > 500 && !fromServer)) message = 'Внутренняя ошибка сервера. Попробуйте позже.';
    if (res.status === 401 && token) {
      setToken(null);
      unauthorizedHandler?.();
    }
    throw new ApiError(res.status, message);
  }

  return (await res.json()) as T;
}
