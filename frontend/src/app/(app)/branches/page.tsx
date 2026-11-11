'use client';

import { FiltersBar } from '@/components/filters-bar';
import { EmptyState, ErrorState, Spinner } from '@/components/states';
import { buildQuery } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFilters } from '@/lib/filters';
import { formatDate, formatMetric, METRICS } from '@/lib/format';
import { BranchStats, MetricTotals } from '@/lib/types';
import { useApi } from '@/lib/use-api';
import { ByBranchResponse } from '@/lib/types';
import Link from 'next/link';
import { useMemo, useState } from 'react';

function aggregate(items: BranchStats[]): MetricTotals {
  const withRating = items.filter((i) => i.totals.rating !== null);
  return {
    views: items.reduce((s, i) => s + i.totals.views, 0),
    websiteClicks: items.reduce((s, i) => s + i.totals.websiteClicks, 0),
    calls: items.reduce((s, i) => s + i.totals.calls, 0),
    routes: items.reduce((s, i) => s + i.totals.routes, 0),
    reviewsCount: items.reduce((s, i) => s + i.totals.reviewsCount, 0),
    rating: withRating.length ? withRating.reduce((s, i) => s + (i.totals.rating ?? 0), 0) / withRating.length : null,
  };
}

function Metrics({ totals }: { totals: MetricTotals }) {
  return (
    <dl className="mini-metrics">
      {METRICS.map((m) => (
        <div key={m.key}>
          <dt>{m.short}</dt>
          <dd>{formatMetric(m.key, totals[m.key])}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function BranchesPage() {
  const { user } = useAuth();
  const { filters, update, carryQuery } = useFilters();
  const [search, setSearch] = useState('');
  const data = useApi<ByBranchResponse>(
    `/metrics/by-branch${buildQuery({ companyId: filters.companyId, branchId: filters.branchId, from: filters.from, to: filters.to })}`,
  );
  const selected = filters.branchId ? (data.data?.items.find((b) => b.branchId === filters.branchId) ?? null) : null;

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = data.data?.items ?? [];
    return q ? all.filter((b) => `${b.name} ${b.city} ${b.address} ${b.companyName}`.toLowerCase().includes(q)) : all;
  }, [data.data, search]);

  const groups = useMemo(() => {
    const map = new Map<string, BranchStats[]>();
    for (const b of items) map.set(b.companyName, [...(map.get(b.companyName) ?? []), b]);
    return [...map.entries()];
  }, [items]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Филиалы</h1>
          <p className="muted">
            {data.data ? `${formatDate(data.data.period.from)} — ${formatDate(data.data.period.to)}` : 'Загрузка…'}
          </p>
        </div>
        <input className="search" type="search" aria-label="Поиск филиала" placeholder="Поиск по названию или адресу" value={search} onChange={(e) => setSearch(e.target.value)} />
      </header>

      <FiltersBar />

      {data.error ? (
        <ErrorState message={data.error} onRetry={data.reload} />
      ) : !data.data ? (
        <Spinner />
      ) : (
        <>
          <section className="card highlight">
            <div className="card-head">
              {filters.branchId ? (
                <>
                  <h2>Выбран филиал: {selected?.name ?? '…'}</h2>
                  <div className="actions">
                    <button className="btn btn-secondary" onClick={() => update({ branchId: null })}>
                      Показать все филиалы
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h2>
                    Итого по {items.length === data.data.items.length ? 'всем доступным' : 'найденным'} филиалам: {items.length}
                  </h2>
                  <Link className="btn btn-secondary" href={`/dashboard${carryQuery({ branchId: null })}`}>
                    Сводный дашборд
                  </Link>
                </>
              )}
            </div>
            <Metrics totals={aggregate(items)} />
          </section>

          {items.length === 0 && <EmptyState>Ничего не найдено по запросу «{search}»</EmptyState>}

          {groups.map(([company, list]) => (
            <section key={company} className="branch-group">
              {user?.role === 'admin' && <h2 className="group-title">{company}</h2>}
              <div className="branch-grid">
                {list.map((b) => (
                  <article key={b.branchId} className="card branch-card">
                    <div>
                      <h3>{b.name}</h3>
                      <p className="muted">
                        {b.city}, {b.address}
                      </p>
                    </div>
                    <Metrics totals={b.totals} />
                    <div className="actions">
                      <Link className="btn" href={`/dashboard${carryQuery({ companyId: b.companyId, branchId: b.branchId })}`}>
                        Статистика
                      </Link>
                      <Link className="btn btn-secondary" href={`/reviews${carryQuery({ companyId: b.companyId, branchId: b.branchId })}`}>
                        Отзывы
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
