'use client';

import { BranchTable } from '@/components/branch-table';
import { FiltersBar } from '@/components/filters-bar';
import { KpiCard } from '@/components/kpi-card';
import { MetricChart } from '@/components/metric-chart';
import { EmptyState, ErrorState, Skeleton, Spinner } from '@/components/states';
import { buildQuery } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFilters } from '@/lib/filters';
import { formatDate, METRICS, pluralize } from '@/lib/format';
import { ByBranchResponse, SummaryResponse, TimeseriesResponse } from '@/lib/types';
import { useApi } from '@/lib/use-api';
import Link from 'next/link';

export default function DashboardPage() {
  const { user } = useAuth();
  const { filters, update, carryQuery } = useFilters();
  const scopeQuery = { companyId: filters.companyId, branchId: filters.branchId, from: filters.from, to: filters.to };

  const summary = useApi<SummaryResponse>(`/metrics/summary${buildQuery(scopeQuery)}`);
  const series = useApi<TimeseriesResponse>(`/metrics/timeseries${buildQuery({ ...scopeQuery, metric: filters.metric })}`);
  // Таблица всегда показывает все филиалы в выбранной компании — выбранный филиал подсвечивается
  const byBranch = useApi<ByBranchResponse>(
    `/metrics/by-branch${buildQuery({ companyId: filters.companyId, from: filters.from, to: filters.to })}`,
  );

  const metricMeta = METRICS.find((m) => m.key === filters.metric)!;
  const selectedBranch = byBranch.data?.items.find((b) => b.branchId === filters.branchId);
  const isAdmin = user?.role === 'admin';
  const noData = summary.data !== null && !summary.data.hasData;

  const scopeTitle = selectedBranch
    ? selectedBranch.name
    : filters.branchId
      ? 'Филиал'
      : summary.data
        ? `Все филиалы — ${summary.data.branchesCount} ${pluralize(summary.data.branchesCount, ['филиал', 'филиала', 'филиалов'])}`
        : 'Все филиалы';

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Дашборд</h1>
          <p className="muted">
            {scopeTitle}
            {summary.data && (
              <>
                {' · '}
                {formatDate(summary.data.period.from)} — {formatDate(summary.data.period.to)}
              </>
            )}
          </p>
        </div>
        {(summary.loading || series.loading || byBranch.loading) && summary.data && <span className="refreshing">Обновление…</span>}
      </header>

      <FiltersBar />

      {summary.error ? (
        <ErrorState message={summary.error} onRetry={summary.reload} />
      ) : noData ? (
        <EmptyState>
          <strong>За выбранный период данных нет</strong>
          <span>
            Выберите другой период{filters.branchId ? ' или филиал' : ''} либо загрузите статистику на странице{' '}
            <Link href={`/sync${carryQuery()}`}>«Импорт»</Link>.
          </span>
        </EmptyState>
      ) : (
        <section className="kpi-grid" aria-label="Ключевые показатели" aria-busy={summary.loading}>
          {METRICS.map((m) =>
            summary.data ? (
              <KpiCard
                key={m.key}
                metric={m.key}
                label={m.label}
                current={summary.data.current[m.key]}
                previous={summary.data.previousHasData ? summary.data.previous[m.key] : null}
                active={filters.metric === m.key}
                onSelect={() => update({ metric: m.key })}
              />
            ) : (
              <div key={m.key} className="kpi">
                <Skeleton width="60%" />
                <Skeleton height={30} width="40%" />
                <Skeleton width="70%" />
              </div>
            ),
          )}
        </section>
      )}

      {!noData && (
      <section className="card">
        <div className="card-head">
          <h2>Динамика: {metricMeta.label.toLowerCase()}</h2>
          <div className="segmented" role="group" aria-label="Показатель графика">
            {METRICS.map((m) => (
              <button
                key={m.key}
                aria-pressed={filters.metric === m.key}
                className={filters.metric === m.key ? 'active' : ''}
                onClick={() => update({ metric: m.key })}
              >
                {m.short}
              </button>
            ))}
          </div>
        </div>
        {series.error ? (
          <ErrorState message={series.error} onRetry={series.reload} />
        ) : series.data ? (
          <MetricChart metric={series.data.metric} label={METRICS.find((m) => m.key === series.data!.metric)!.label} points={series.data.points} />
        ) : (
          <div className="chart">
            <Spinner />
          </div>
        )}
      </section>
      )}

      <section className="card">
        <div className="card-head">
          <h2>По филиалам</h2>
          <span className="muted">Нажмите на строку, чтобы посмотреть статистику филиала</span>
        </div>
        {byBranch.error ? (
          <ErrorState message={byBranch.error} onRetry={byBranch.reload} />
        ) : byBranch.data ? (
          byBranch.data.items.length ? (
            <BranchTable
              items={byBranch.data.items}
              showCompany={isAdmin && !filters.companyId}
              selectedId={filters.branchId}
              onSelect={(id) => update({ branchId: id })}
            />
          ) : (
            <p className="muted">Нет филиалов</p>
          )
        ) : (
          <Spinner />
        )}
      </section>
    </div>
  );
}
