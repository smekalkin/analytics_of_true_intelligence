import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AccessScopeService, DataScope } from '../access/access-scope.service';
import { AuthUser } from '../auth/auth-user';
import { Period, previousPeriod, resolvePeriod } from '../common/period';
import { PeriodQueryDto } from '../common/scope-query.dto';
import { METRIC_SQL, MetricKey, MetricTotals, TimeseriesQueryDto } from './metrics.dto';

const TOTALS_SQL = `
  COALESCE(SUM(m.views), 0)::bigint          AS views,
  COALESCE(SUM(m.website_clicks), 0)::bigint AS website_clicks,
  COALESCE(SUM(m.calls), 0)::bigint          AS calls,
  COALESCE(SUM(m.routes), 0)::bigint         AS routes,
  ROUND(AVG(m.rating), 2)                    AS rating,
  COALESCE(SUM(m.reviews_count), 0)::bigint  AS reviews_count`;

/** Фильтр области видимости. $1/$2 — период, $3 — компания, $4 — филиал. */
const SCOPE_WHERE = `($3::int IS NULL OR b.company_id = $3) AND ($4::int IS NULL OR b.id = $4)`;

function mapTotals(r: Record<string, string | null>): MetricTotals {
  return {
    views: Number(r.views ?? 0),
    websiteClicks: Number(r.website_clicks ?? 0),
    calls: Number(r.calls ?? 0),
    routes: Number(r.routes ?? 0),
    rating: r.rating === null || r.rating === undefined ? null : Number(r.rating),
    reviewsCount: Number(r.reviews_count ?? 0),
  };
}

@Injectable()
export class MetricsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly access: AccessScopeService,
  ) {}

  /** Сводные показатели за период + тот же набор за предыдущий период такой же длины. */
  async summary(user: AuthUser, q: PeriodQueryDto) {
    const scope = await this.access.resolve(user, q);
    const period = resolvePeriod(q.from, q.to);
    const prev = previousPeriod(period);

    const [cur, prev2, [branches]] = await Promise.all([
      this.totals(scope, period),
      this.totals(scope, prev),
      this.ds.query(
        `SELECT COUNT(*)::int AS count FROM branches b WHERE ($1::int IS NULL OR b.company_id = $1) AND ($2::int IS NULL OR b.id = $2)`,
        [scope.companyId, scope.branchId],
      ),
    ]);

    return {
      scope,
      period,
      previousPeriod: prev,
      branchesCount: branches.count,
      current: cur.totals,
      previous: prev2.totals,
      // Есть ли вообще строки за период — чтобы UI отличал «нет данных» от честных нулей
      hasData: cur.rows > 0,
      previousHasData: prev2.rows > 0,
    };
  }

  /** Динамика одного показателя по дням; дни без данных возвращаются с 0 (или null для рейтинга). */
  async timeseries(user: AuthUser, q: TimeseriesQueryDto) {
    const scope = await this.access.resolve(user, q);
    const period = resolvePeriod(q.from, q.to);
    const metric: MetricKey = q.metric ?? 'views';
    const { column, agg } = METRIC_SQL[metric];

    const rows: { date: string; value: string | null }[] = await this.ds.query(
      `SELECT to_char(d.day, 'YYYY-MM-DD') AS date, a.value
         FROM generate_series($1::date, $2::date, interval '1 day') AS d(day)
         LEFT JOIN (
           SELECT m.date, ${agg}(m.${column}) AS value
             FROM daily_metrics m JOIN branches b ON b.id = m.branch_id
            WHERE m.date BETWEEN $1::date AND $2::date AND ${SCOPE_WHERE}
            GROUP BY m.date
         ) a ON a.date = d.day::date
        ORDER BY d.day`,
      [period.from, period.to, scope.companyId, scope.branchId],
    );

    const points = rows.map((r) => ({
      date: r.date,
      value: r.value === null ? (agg === 'AVG' ? null : 0) : agg === 'AVG' ? Math.round(Number(r.value) * 100) / 100 : Number(r.value),
    }));
    return { scope, period, metric, points };
  }

  /** Показатели в разрезе филиалов (все доступные филиалы, включая филиалы без данных). */
  async byBranch(user: AuthUser, q: PeriodQueryDto) {
    const scope = await this.access.resolve(user, q);
    const period = resolvePeriod(q.from, q.to);
    const rows = await this.ds.query(
      `SELECT b.id, b.name, b.city, b.address, b.company_id AS company_id, c.name AS company_name, ${TOTALS_SQL}
         FROM branches b
         JOIN companies c ON c.id = b.company_id
         LEFT JOIN daily_metrics m ON m.branch_id = b.id AND m.date BETWEEN $1::date AND $2::date
        WHERE ${SCOPE_WHERE}
        GROUP BY b.id, c.name
        ORDER BY c.name, b.name`,
      [period.from, period.to, scope.companyId, scope.branchId],
    );
    return {
      scope,
      period,
      items: rows.map((r: Record<string, any>) => ({
        branchId: r.id,
        name: r.name,
        city: r.city,
        address: r.address,
        companyId: r.company_id,
        companyName: r.company_name,
        totals: mapTotals(r),
      })),
    };
  }

  private async totals(scope: DataScope, period: Period): Promise<{ totals: MetricTotals; rows: number }> {
    const [row] = await this.ds.query(
      `SELECT ${TOTALS_SQL}, COUNT(m.id)::int AS rows
         FROM daily_metrics m JOIN branches b ON b.id = m.branch_id
        WHERE m.date BETWEEN $1::date AND $2::date AND ${SCOPE_WHERE}`,
      [period.from, period.to, scope.companyId, scope.branchId],
    );
    return { totals: mapTotals(row), rows: row.rows };
  }
}
