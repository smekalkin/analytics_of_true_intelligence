import { MetricKey, ReviewStatus } from './types';

const intFmt = new Intl.NumberFormat('ru-RU');
const ratingFmt = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const shortDateFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dateTimeFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const METRICS: { key: MetricKey; label: string; short: string }[] = [
  { key: 'views', label: 'Просмотры карточек', short: 'Просмотры' },
  { key: 'websiteClicks', label: 'Переходы на сайт', short: 'Переходы' },
  { key: 'calls', label: 'Звонки', short: 'Звонки' },
  { key: 'routes', label: 'Построенные маршруты', short: 'Маршруты' },
  { key: 'rating', label: 'Средний рейтинг', short: 'Рейтинг' },
  { key: 'reviewsCount', label: 'Новые отзывы', short: 'Отзывы' },
];

export const STATUS_LABELS: Record<ReviewStatus, string> = {
  new: 'Новый',
  in_progress: 'В работе',
  resolved: 'Обработан',
};

export const SOURCE_LABELS = { yandex: 'Яндекс Карты', '2gis': '2ГИС', google: 'Google Maps' } as const;

export function formatMetric(key: MetricKey, value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return key === 'rating' ? ratingFmt.format(value) : intFmt.format(value);
}

/** Изменение к предыдущему периоду: для рейтинга — в абсолютных пунктах, для счётчиков — в процентах. */
export function formatDelta(key: MetricKey, current: number | null, previous: number | null): { text: string; trend: 'up' | 'down' | 'flat' } | null {
  if (current === null || previous === null) return null;
  if (key === 'rating') {
    const d = Math.round((current - previous) * 100) / 100;
    return { text: `${d > 0 ? '+' : ''}${ratingFmt.format(d)}`, trend: d > 0 ? 'up' : d < 0 ? 'down' : 'flat' };
  }
  if (previous === 0) return current === 0 ? { text: '0%', trend: 'flat' } : null;
  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.round(pct * 10) / 10;
  return { text: `${pctFmt.format(rounded)}%`, trend: rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat' };
}

export const formatInt = (n: number) => intFmt.format(n);
export const formatDate = (iso: string) => dateFmt.format(new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso));
export const formatShortDate = (iso: string) => shortDateFmt.format(new Date(`${iso}T00:00:00Z`));
export const formatDateTime = (iso: string) => dateTimeFmt.format(new Date(iso));

export function pluralize(n: number, forms: [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return forms[1];
  return forms[2];
}
