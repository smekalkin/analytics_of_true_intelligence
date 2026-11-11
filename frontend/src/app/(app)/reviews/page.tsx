'use client';

import { FiltersBar } from '@/components/filters-bar';
import { Stars } from '@/components/stars';
import { EmptyState, ErrorState, Spinner } from '@/components/states';
import { apiFetch, buildQuery } from '@/lib/api';
import { useFilters } from '@/lib/filters';
import { formatDateTime, formatInt, SOURCE_LABELS, STATUS_LABELS } from '@/lib/format';
import { Review, ReviewsResponse, ReviewStatus } from '@/lib/types';
import { useApi } from '@/lib/use-api';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const STATUSES: ReviewStatus[] = ['new', 'in_progress', 'resolved'];
const PAGE_SIZE = 10;

function ReviewCard({ review, onSaved }: { review: Review; onSaved: (r: Review) => void }) {
  const [status, setStatus] = useState<ReviewStatus>(review.status);
  const [reply, setReply] = useState(review.reply ?? '');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = status !== review.status || (reply.trim() || null) !== review.reply;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const saved = await apiFetch<Review>(`/reviews/${review.id}`, { method: 'PATCH', body: { status, reply: reply.trim() || null } });
      setEditing(false);
      onSaved(saved);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className={`card review ${review.rating <= 2 ? 'negative' : ''}`}>
      <header className="review-head">
        <div>
          <Stars value={review.rating} />
          <strong className="review-author">{review.authorName}</strong>
        </div>
        <span className={`badge status-${review.status}`}>{STATUS_LABELS[review.status]}</span>
      </header>
      <div className="review-meta muted">
        {review.branchName} · {SOURCE_LABELS[review.source]} · {formatDateTime(review.publishedAt)}
      </div>
      <p className="review-text">{review.text}</p>
      {review.reply && !editing && (
        <blockquote className="review-reply">
          <span className="muted">Ответ компании:</span> {review.reply}
        </blockquote>
      )}

      {editing ? (
        <div className="review-edit">
          <label className="field">
            <span>Статус</span>
            <select aria-label="Статус обработки" value={status} onChange={(e) => setStatus(e.target.value as ReviewStatus)} disabled={saving}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="field grow">
            <span>Ответ</span>
            <textarea rows={3} maxLength={2000} value={reply} onChange={(e) => setReply(e.target.value)} disabled={saving} placeholder="Текст ответа клиенту" />
          </label>
          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}
          <div className="actions">
            <button className="btn" onClick={save} disabled={saving || !dirty}>
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
            <button
              className="btn btn-ghost"
              disabled={saving}
              onClick={() => {
                setEditing(false);
                setStatus(review.status);
                setReply(review.reply ?? '');
                setError(null);
              }}
            >
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <div className="actions">
          <button className="btn btn-secondary" onClick={() => setEditing(true)}>
            Обработать
          </button>
        </div>
      )}
    </article>
  );
}

export default function ReviewsPage() {
  const { filters, update } = useFilters();
  const sp = useSearchParams();
  const status = STATUSES.find((s) => s === sp.get('status')) ?? null;
  const ratings = (sp.get('rating') ?? '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 5);
  const page = Math.min(100_000, Math.max(1, Math.floor(Number(sp.get('page'))) || 1));

  const reviews = useApi<ReviewsResponse>(
    `/reviews${buildQuery({ companyId: filters.companyId, branchId: filters.branchId, status, rating: ratings, page, limit: PAGE_SIZE })}`,
  );

  const toggleRating = (r: number) => {
    const next = ratings.includes(r) ? ratings.filter((x) => x !== r) : [...ratings, r].sort();
    update({ rating: next.join(',') || null, page: null });
  };

  const counts = reviews.data?.statusCounts;
  const allCount = counts ? counts.new + counts.in_progress + counts.resolved : null;
  const totalPages = reviews.data ? Math.max(1, Math.ceil(reviews.data.total / PAGE_SIZE)) : 1;

  // Страница опустела (например, последний отзыв на ней сменил статус и выпал из фильтра)
  // или номер в URL больше числа страниц — переходим на последнюю непустую
  useEffect(() => {
    if (reviews.data && !reviews.loading && reviews.data.items.length === 0 && reviews.data.total > 0 && page > totalPages) {
      update({ page: totalPages > 1 ? totalPages : null });
    }
  }, [reviews.data, reviews.loading, page, totalPages, update]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Отзывы</h1>
          <p className="muted">Все отзывы с геосервисов, обработка и ответы</p>
        </div>
        {reviews.loading && reviews.data && <span className="refreshing">Обновление…</span>}
      </header>

      <FiltersBar showPeriod={false} />

      <div className="filters">
        <div className="field">
          <span>Статус обработки</span>
          <div className="segmented" role="group" aria-label="Статус обработки">
            <button aria-pressed={!status} className={!status ? 'active' : ''} onClick={() => update({ status: null, page: null })}>
              Все{allCount !== null && <em>{formatInt(allCount)}</em>}
            </button>
            {STATUSES.map((s) => (
              <button key={s} aria-pressed={status === s} className={status === s ? 'active' : ''} onClick={() => update({ status: s, page: null })}>
                {STATUS_LABELS[s]}
                {counts && <em>{formatInt(counts[s])}</em>}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Рейтинг</span>
          <div className="segmented" role="group" aria-label="Фильтр по рейтингу">
            {[5, 4, 3, 2, 1].map((r) => (
              <button key={r} aria-pressed={ratings.includes(r)} className={ratings.includes(r) ? 'active' : ''} onClick={() => toggleRating(r)}>
                {r}★
              </button>
            ))}
          </div>
        </div>
        {(status || ratings.length > 0) && (
          <button className="btn btn-ghost align-end" onClick={() => update({ status: null, rating: null, page: null })}>
            Сбросить фильтры
          </button>
        )}
      </div>

      {reviews.error ? (
        <ErrorState message={reviews.error} onRetry={reviews.reload} />
      ) : !reviews.data ? (
        <Spinner />
      ) : reviews.data.items.length === 0 ? (
        <EmptyState>Отзывов по выбранным фильтрам нет</EmptyState>
      ) : (
        <>
          <p className="muted">Найдено: {formatInt(reviews.data.total)}</p>
          <div className="review-list" aria-busy={reviews.loading}>
            {reviews.data.items.map((r) => (
              <ReviewCard key={`${r.id}:${r.status}:${r.reply ?? ''}`} review={r} onSaved={reviews.reload} />
            ))}
          </div>
          {totalPages > 1 && (
            <nav className="pager" aria-label="Страницы">
              <button className="btn btn-secondary" disabled={page <= 1} onClick={() => update({ page: page - 1 > 1 ? page - 1 : null })}>
                ← Назад
              </button>
              <span className="muted">
                Страница {page} из {totalPages}
              </span>
              <button className="btn btn-secondary" disabled={page >= totalPages} onClick={() => update({ page: page + 1 })}>
                Вперёд →
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
