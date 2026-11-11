import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Строка статистики в нашей модели (после маппинга полей внешнего API). */
export interface ExternalDailyStat {
  date: string;
  views: number;
  websiteClicks: number;
  calls: number;
  routes: number;
  rating: number | null;
  reviewsCount: number;
}

export class GeoApiError extends Error {
  constructor(
    message: string,
    readonly attempts: number,
    /** true — сбой временный (сеть, 429, 5xx), повтор позже может помочь */
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'GeoApiError';
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 10_000_000;

/**
 * Проверяет ответ внешнего API и переводит его в нашу модель.
 * Любое отклонение от контракта — ошибка: лучше не записать ничего, чем записать мусор.
 */
export function parseDailyStats(body: unknown, from: string, to: string): ExternalDailyStat[] {
  const items = (body as { items?: unknown })?.items;
  if (!Array.isArray(items)) throw new Error('в ответе нет массива items');
  const seen = new Set<string>();
  return items.map((raw, i) => {
    const it = raw as Record<string, unknown>;
    const where = `items[${i}]`;
    if (typeof it?.date !== 'string' || !DATE_RE.test(it.date)) throw new Error(`${where}: некорректная дата`);
    if (it.date < from || it.date > to) throw new Error(`${where}: дата ${it.date} вне запрошенного периода`);
    if (seen.has(it.date)) throw new Error(`${where}: дата ${it.date} повторяется`);
    seen.add(it.date);
    for (const key of ['impressions', 'website_clicks', 'phone_calls', 'route_requests', 'new_reviews']) {
      if (!isCount(it[key])) throw new Error(`${where}: поле ${key} должно быть неотрицательным целым`);
    }
    const rating = it.rating;
    if (rating !== null && (typeof rating !== 'number' || rating < 1 || rating > 5)) {
      throw new Error(`${where}: rating вне диапазона 1..5`);
    }
    return {
      date: it.date,
      views: it.impressions as number,
      websiteClicks: it.website_clicks as number,
      calls: it.phone_calls as number,
      routes: it.route_requests as number,
      rating: rating === null ? null : Math.round((rating as number) * 100) / 100,
      reviewsCount: it.new_reviews as number,
    };
  });
}

/** HTTP-клиент внешнего геосервиса: таймаут, ретраи с экспоненциальной задержкой, учёт Retry-After. */
@Injectable()
export class GeoApiClient {
  private readonly logger = new Logger(GeoApiClient.name);

  constructor(private readonly config: ConfigService) {}

  private get baseUrl() {
    return this.config.get<string>('GEO_API_URL', 'http://localhost:4010');
  }
  private get apiKey() {
    return this.config.get<string>('GEO_API_KEY', 'mock-geo-key');
  }
  private get maxAttempts() {
    return Number(this.config.get('GEO_API_MAX_ATTEMPTS', 4));
  }
  private get timeoutMs() {
    return Number(this.config.get('GEO_API_TIMEOUT_MS', 5000));
  }
  private get baseDelayMs() {
    return Number(this.config.get('GEO_API_RETRY_BASE_MS', 300));
  }

  async fetchDailyStats(externalId: string, from: string, to: string): Promise<{ items: ExternalDailyStat[]; attempts: number }> {
    const url = `${this.baseUrl}/v1/locations/${encodeURIComponent(externalId)}/daily-stats?date_from=${from}&date_to=${to}`;
    let lastError = 'неизвестная ошибка';

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      let retryAfterMs: number | null = null;
      try {
        const res = await fetch(url, {
          headers: { 'X-Api-Key': this.apiKey, Accept: 'application/json' },
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (res.ok) {
          let body: unknown;
          try {
            body = await res.json();
          } catch {
            throw new GeoApiError('Внешний API вернул не JSON', attempt, false);
          }
          try {
            return { items: parseDailyStats(body, from, to), attempts: attempt };
          } catch (err) {
            throw new GeoApiError(`Некорректный ответ внешнего API: ${(err as Error).message}`, attempt, false);
          }
        }

        const retryable = res.status === 429 || res.status >= 500;
        lastError = `внешний API ответил ${res.status}`;
        if (!retryable) {
          const hint = res.status === 401 ? ' (неверный API-ключ)' : res.status === 404 ? ' (локация не найдена)' : '';
          throw new GeoApiError(`Внешний API отклонил запрос: HTTP ${res.status}${hint}`, attempt, false);
        }
        const ra = Number(res.headers.get('retry-after'));
        if (Number.isFinite(ra) && ra > 0) retryAfterMs = Math.min(ra * 1000, 10_000);
      } catch (err) {
        if (err instanceof GeoApiError) throw err;
        lastError = (err as Error).name === 'TimeoutError' ? `таймаут ${this.timeoutMs} мс` : `сеть: ${(err as Error).message}`;
      }

      if (attempt < this.maxAttempts) {
        const backoff = this.baseDelayMs * 2 ** (attempt - 1) * (0.75 + Math.random() * 0.5);
        const delay = retryAfterMs ?? backoff;
        this.logger.warn(`${externalId}: попытка ${attempt} не удалась (${lastError}), повтор через ${Math.round(delay)} мс`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw new GeoApiError(`Внешний API недоступен после ${this.maxAttempts} попыток: ${lastError}`, this.maxAttempts, true);
  }
}
