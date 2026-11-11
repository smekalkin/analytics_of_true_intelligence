/**
 * Имитация внешнего API геосервиса (вариант Б ТЗ). Отдельный HTTP-процесс без зависимостей.
 *
 *   GET /v1/locations/:locationId/daily-stats?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
 *   Заголовок: X-Api-Key
 *
 * Поведение, приближенное к реальным API:
 *  - данные детерминированы для пары (локация, дата) — повторный запрос даёт тот же ответ;
 *  - за текущий день данные неполные и растут в течение суток (повторная загрузка их обновляет);
 *  - случайные сбои 503 и 429 (с Retry-After) с заданной вероятностью и сетевые задержки;
 *  - собственные имена полей (impressions, phone_calls…) — backend делает маппинг.
 * Для тестов есть управление: failNext(), corruptNext(), счётчик запросов.
 */
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';

export interface MockGeoOptions {
  apiKey: string;
  /** вероятность случайного сбоя 503/429 на запрос, 0..1 */
  failureRate?: number;
  /** диапазон искусственной задержки ответа, мс */
  latencyMs?: [number, number];
  /** функция «текущего времени» — для детерминированных тестов */
  now?: () => Date;
}

export interface MockGeoDailyItem {
  date: string;
  impressions: number;
  website_clicks: number;
  phone_calls: number;
  route_requests: number;
  rating: number | null;
  new_reviews: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOCATION_RE = /^loc-\d{1,10}$/;
const MAX_RANGE_DAYS = 93;
const DAY_MS = 86_400_000;

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Доля прошедших суток: данные за текущий день неполные и растут до его окончания. */
export function dayFraction(date: string, now: Date): number {
  return date === now.toISOString().slice(0, 10) ? (now.getUTCHours() * 60 + now.getUTCMinutes() + 1) / 1440 : 1;
}

/** Детерминированная генерация дневной статистики локации. */
export function generateDay(locationId: string, date: string, dayFraction = 1): MockGeoDailyItem {
  const profile = rng(hash(locationId));
  const baseViews = 120 + Math.floor(profile() * 380);
  const baseRating = 3.8 + profile() * 1.1;
  const site = 0.03 + profile() * 0.06;
  const calls = 0.01 + profile() * 0.07;
  const routes = 0.05 + profile() * 0.08;

  const r = rng(hash(`${locationId}:${date}`));
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  const weekend = dow === 0 || dow === 6 ? 1.2 : 1;
  const views = Math.round(baseViews * weekend * (0.8 + r() * 0.4) * dayFraction);
  const part = (p: number) => Math.round(views * p * (0.8 + r() * 0.4));
  const dayIndex = Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
  const rating = Math.min(5, Math.max(1, baseRating + Math.sin(dayIndex / 20) * 0.08));

  return {
    date,
    impressions: views,
    website_clicks: part(site),
    phone_calls: part(calls),
    route_requests: part(routes),
    rating: Math.round(rating * 100) / 100,
    new_reviews: Math.round(views * 0.006 * r() * 2),
  };
}

export class MockGeoServer {
  private server: Server;
  private forcedFailures: number[] = [];
  private corruptNextCount = 0;
  /** количество обращений к daily-stats (включая неуспешные) */
  requestCount = 0;

  constructor(private readonly opts: MockGeoOptions) {
    this.server = createServer((req, res) => {
      this.handle(req, res).catch(() => this.send(res, 500, { error: 'internal_error' }));
    });
  }

  /** Следующие n запросов завершатся указанным статусом (для тестов ретраев). */
  failNext(n: number, status = 503) {
    for (let i = 0; i < n; i++) this.forcedFailures.push(status);
  }

  setLatency(minMs: number, maxMs = minMs) {
    this.opts.latencyMs = [minMs, maxMs];
  }

  /** Следующий успешный ответ будет содержать некорректные данные. */
  corruptNext() {
    this.corruptNextCount++;
  }

  async listen(port = 0, host = '127.0.0.1'): Promise<number> {
    await new Promise<void>((resolve) => this.server.listen(port, host, resolve));
    return (this.server.address() as AddressInfo).port;
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
    res.end(JSON.stringify(body));
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://mock');

    if (req.method === 'GET' && url.pathname === '/health') return this.send(res, 200, { status: 'ok' });

    const match = /^\/v1\/locations\/([^/]+)\/daily-stats$/.exec(url.pathname);
    if (req.method !== 'GET' || !match) return this.send(res, 404, { error: 'not_found' });

    this.requestCount++;
    const [min, max] = this.opts.latencyMs ?? [0, 0];
    if (max > 0) await new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));

    if (req.headers['x-api-key'] !== this.opts.apiKey) {
      return this.send(res, 401, { error: 'invalid_api_key' });
    }

    const forced = this.forcedFailures.shift();
    if (forced) return this.failure(res, forced);
    if (this.opts.failureRate && Math.random() < this.opts.failureRate) {
      return this.failure(res, Math.random() < 0.5 ? 503 : 429);
    }

    const locationId = decodeURIComponent(match[1]);
    if (!LOCATION_RE.test(locationId)) return this.send(res, 404, { error: 'location_not_found' });

    const from = url.searchParams.get('date_from') ?? '';
    const to = url.searchParams.get('date_to') ?? '';
    if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) {
      return this.send(res, 400, { error: 'invalid_date_range' });
    }
    const now = this.opts.now?.() ?? new Date();
    const today = now.toISOString().slice(0, 10);
    if (to > today) return this.send(res, 400, { error: 'date_in_future' });
    const days = (Date.parse(to) - Date.parse(from)) / DAY_MS + 1;
    if (days > MAX_RANGE_DAYS) return this.send(res, 400, { error: 'range_too_large', max_days: MAX_RANGE_DAYS });

    const items: MockGeoDailyItem[] = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(Date.parse(`${from}T00:00:00Z`) + i * DAY_MS).toISOString().slice(0, 10);
      items.push(generateDay(locationId, date, dayFraction(date, now)));
    }

    if (this.corruptNextCount > 0) {
      this.corruptNextCount--;
      items[items.length - 1] = { ...items[items.length - 1], impressions: -5 };
    }

    return this.send(res, 200, { location_id: locationId, date_from: from, date_to: to, items });
  }

  private failure(res: ServerResponse, status: number) {
    if (status === 429) return this.send(res, 429, { error: 'rate_limited' }, { 'Retry-After': '1' });
    return this.send(res, status, { error: 'service_unavailable' });
  }
}
