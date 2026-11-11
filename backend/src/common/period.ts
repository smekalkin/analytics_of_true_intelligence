import { BadRequestException } from '@nestjs/common';

export const MAX_PERIOD_DAYS = 366;
export const DEFAULT_PERIOD_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface Period {
  from: string;
  to: string;
  days: number;
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Допустимый диапазон дат: защищает от бессмысленных запросов вроде 0001-01-01 (в PostgreSQL нет года 0). */
export const MIN_DATE = '2000-01-01';
export const MAX_DATE = '2100-12-31';

export function parseIsoDate(value: string): Date {
  if (!ISO_DATE_RE.test(value)) throw new BadRequestException(`Некорректная дата: ${value}`);
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || toIsoDate(d) !== value) {
    throw new BadRequestException(`Некорректная дата: ${value}`);
  }
  if (value < MIN_DATE || value > MAX_DATE) {
    throw new BadRequestException(`Дата должна быть в диапазоне ${MIN_DATE} — ${MAX_DATE}`);
  }
  return d;
}

export function addDays(value: string, days: number): string {
  return toIsoDate(new Date(parseIsoDate(value).getTime() + days * DAY_MS));
}

export function todayUtc(): string {
  return toIsoDate(new Date());
}

/** Нормализует период: по умолчанию — последние 30 дней, включая сегодня. */
export function resolvePeriod(from?: string, to?: string): Period {
  const resolvedTo = to ?? (from ? addDays(from, DEFAULT_PERIOD_DAYS - 1) : todayUtc());
  const resolvedFrom = from ?? addDays(resolvedTo, -(DEFAULT_PERIOD_DAYS - 1));
  const days = Math.round((parseIsoDate(resolvedTo).getTime() - parseIsoDate(resolvedFrom).getTime()) / DAY_MS) + 1;
  if (days < 1) throw new BadRequestException('Дата начала периода позже даты окончания');
  if (days > MAX_PERIOD_DAYS) throw new BadRequestException(`Период не может превышать ${MAX_PERIOD_DAYS} дней`);
  return { from: resolvedFrom, to: resolvedTo, days };
}

/** Предыдущий период такой же длины — для расчёта динамики. */
export function previousPeriod(p: Period): Period {
  const to = addDays(p.from, -1);
  return { from: addDays(to, -(p.days - 1)), to, days: p.days };
}
