import { IsIn, IsOptional } from 'class-validator';
import { PeriodQueryDto } from '../common/scope-query.dto';

export const METRIC_KEYS = ['views', 'websiteClicks', 'calls', 'routes', 'rating', 'reviewsCount'] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

/** Белый список: ключ API → колонка и агрегат. Подставляется в SQL только отсюда. */
export const METRIC_SQL: Record<MetricKey, { column: string; agg: 'SUM' | 'AVG' }> = {
  views: { column: 'views', agg: 'SUM' },
  websiteClicks: { column: 'website_clicks', agg: 'SUM' },
  calls: { column: 'calls', agg: 'SUM' },
  routes: { column: 'routes', agg: 'SUM' },
  rating: { column: 'rating', agg: 'AVG' },
  reviewsCount: { column: 'reviews_count', agg: 'SUM' },
};

export class TimeseriesQueryDto extends PeriodQueryDto {
  @IsOptional()
  @IsIn(METRIC_KEYS as unknown as string[], { message: `metric должен быть одним из: ${METRIC_KEYS.join(', ')}` })
  metric?: MetricKey;
}

export interface MetricTotals {
  views: number;
  websiteClicks: number;
  calls: number;
  routes: number;
  rating: number | null;
  reviewsCount: number;
}
