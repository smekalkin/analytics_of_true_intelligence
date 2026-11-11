'use client';

import { FiltersBar } from '@/components/filters-bar';
import { EmptyState, ErrorState, Spinner } from '@/components/states';
import { apiFetch, buildQuery } from '@/lib/api';
import { useFilters } from '@/lib/filters';
import { formatDate, formatDateTime, formatShortDate } from '@/lib/format';
import { Branch, SyncJob, SyncResult, SyncStatus } from '@/lib/types';
import { useApi } from '@/lib/use-api';
import { useEffect, useState } from 'react';

const MAX_SYNC_DAYS = 93;
const STATUS: Record<SyncStatus, { label: string; cls: string }> = {
  running: { label: 'Выполняется', cls: 'status-in_progress' },
  succeeded: { label: 'Успешно', cls: 'status-resolved' },
  failed: { label: 'Ошибка', cls: 'status-failed' },
};

function newKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function Counts({ job }: { job: SyncJob }) {
  const items: [string, number | null][] = [
    ['Получено дней', job.fetched],
    ['Добавлено', job.inserted],
    ['Обновлено', job.updated],
    ['Без изменений', job.unchanged],
    ['Попыток запроса', job.attempts],
  ];
  return (
    <dl className="mini-metrics">
      {items.map(([label, v]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function SyncPage() {
  const { filters } = useFilters();
  const branches = useApi<Branch[]>(`/branches${buildQuery({ companyId: filters.companyId })}`);
  const jobs = useApi<SyncJob[]>(`/sync/jobs${buildQuery({ companyId: filters.companyId, branchId: filters.branchId, limit: 20 })}`);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<(SyncResult & { key: string; body: object }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Результат относится к конкретному филиалу — при смене филиала не показываем чужой
  useEffect(() => {
    setResult(null);
    setError(null);
  }, [filters.branchId]);

  const branch = branches.data?.find((b) => b.id === filters.branchId) ?? null;
  const days = Math.round((Date.parse(filters.to) - Date.parse(filters.from)) / 86_400_000) + 1;
  const today = new Date().toISOString().slice(0, 10);
  const problem = !filters.branchId
    ? 'Выберите филиал в фильтре выше'
    : branch && !branch.externalId
      ? 'Филиал не подключён к геосервису'
      : days > MAX_SYNC_DAYS
        ? `За один запрос можно загрузить не более ${MAX_SYNC_DAYS} дней`
        : filters.to > today
          ? 'Нельзя загрузить данные за будущие даты'
          : null;

  async function send(body: object, key: string) {
    setRunning(true);
    setError(null);
    try {
      const res = await apiFetch<SyncResult>('/sync', { method: 'POST', body, headers: { 'Idempotency-Key': key } });
      setResult({ ...res, key, body });
    } catch (err) {
      setError((err as Error).message);
      setResult(null);
    } finally {
      setRunning(false);
      jobs.reload();
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Импорт данных</h1>
          <p className="muted">Загрузка ежедневной статистики филиала из внешнего API геосервиса</p>
        </div>
      </header>

      <FiltersBar />

      <section className="card">
        <div className="card-head">
          <h2>Загрузка статистики</h2>
          {branch?.externalId && <code className="muted">ID в геосервисе: {branch.externalId}</code>}
        </div>
        <p className="muted explain">
          Повторная загрузка того же периода безопасна: данные записываются по ключу «филиал + дата», дубли не появляются, а
          изменённые в источнике значения обновляются. Каждый запрос отправляется с заголовком <code>Idempotency-Key</code>:
          его повтор (например, после обрыва связи) вернёт сохранённый результат без повторного обращения к API. Временные
          сбои внешнего API (429/5xx) переживаются автоматическими повторами.
        </p>
        <div className="actions sync-actions">
          <button
            className="btn"
            disabled={running || !!problem}
            onClick={() => send({ branchId: filters.branchId, from: filters.from, to: filters.to }, newKey())}
          >
            {running ? 'Загрузка…' : `Загрузить за ${formatDate(filters.from)} — ${formatDate(filters.to)}`}
          </button>
          {problem && <span className="muted">{problem}</span>}
        </div>

        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}

        {result && (
          <div className={`sync-result ${result.job.status}`} aria-live="polite">
            <div className="card-head">
              <div className="sync-result-title">
                <span className={`badge ${STATUS[result.job.status].cls}`}>{STATUS[result.job.status].label}</span>
                {result.replayed && <span className="badge badge-accent">Повтор по ключу: внешний API не вызывался</span>}
                <span className="muted">
                  #{result.job.id} · {result.job.branchName} · {formatDate(result.job.from)} — {formatDate(result.job.to)}
                </span>
              </div>
              <button className="btn btn-secondary" disabled={running} onClick={() => send(result.body, result.key)} title="Демонстрация идемпотентности">
                Отправить повторно с тем же ключом
              </button>
            </div>
            <Counts job={result.job} />
            <p className="muted key-line">
              Idempotency-Key: <code>{result.key}</code>
            </p>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>История синхронизаций</h2>
          <button className="btn btn-ghost" onClick={jobs.reload} disabled={jobs.loading}>
            {jobs.loading ? 'Обновление…' : 'Обновить'}
          </button>
        </div>
        {jobs.error ? (
          <ErrorState message={jobs.error} onRetry={jobs.reload} />
        ) : !jobs.data ? (
          <Spinner />
        ) : jobs.data.length === 0 ? (
          <EmptyState>Синхронизаций ещё не было</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table static stackable-wide">
              <thead>
                <tr>
                  <th>Филиал</th>
                  <th>Запущена</th>
                  <th>Период</th>
                  <th>Статус</th>
                  <th className="num">Попыток</th>
                  <th className="num">Добавлено</th>
                  <th className="num">Обновлено</th>
                  <th className="num">Без изм.</th>
                  <th>Кто</th>
                </tr>
              </thead>
              <tbody>
                {jobs.data.map((j) => (
                  <tr key={j.id}>
                    <td className="stack-full">{j.branchName}</td>
                    <td data-label="Запущена">{formatDateTime(j.startedAt)}</td>
                    <td className="cell-sub" data-label="Период" title={`Задача #${j.id}`}>
                      {formatShortDate(j.from)} — {formatShortDate(j.to)}
                    </td>
                    <td data-label="Статус">
                      <span className={`badge ${STATUS[j.status].cls}`} title={j.error ?? undefined}>
                        {STATUS[j.status].label}
                      </span>
                      {j.error && <div className="cell-sub cell-error">{j.error}</div>}
                    </td>
                    <td className="num" data-label="Попыток">{j.attempts}</td>
                    <td className="num" data-label="Добавлено">{j.inserted ?? '—'}</td>
                    <td className="num" data-label="Обновлено">{j.updated ?? '—'}</td>
                    <td className="num" data-label="Без изменений">{j.unchanged ?? '—'}</td>
                    <td className="cell-sub" data-label="Кто">{j.requestedBy ?? 'система'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
