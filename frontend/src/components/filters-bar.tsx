'use client';

import { buildQuery } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { presetRange, useFilters } from '@/lib/filters';
import { Branch, Company } from '@/lib/types';
import { useApi } from '@/lib/use-api';
import { useEffect, useState } from 'react';

const PRESETS = [7, 30, 90];

/** Правдоподобная полная дата: при наборе года с клавиатуры браузер отдаёт промежуточные 0002-…, 0020-… */
const isPlausibleDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= '2000-01-01' && v <= '2100-12-31';

/**
 * Поле даты с локальным состоянием: промежуточные значения при наборе с клавиатуры не уходят
 * в URL и не порождают запросы. Полная дата применяется сразу (в т.ч. выбор в календаре),
 * неполная — откатывается при потере фокуса.
 */
function DateInput({ value, min, max, onCommit }: { value: string; min?: string; max?: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      type="date"
      value={draft}
      min={min}
      max={max}
      onChange={(e) => {
        const v = e.target.value;
        setDraft(v);
        if (isPlausibleDate(v) && v !== value) onCommit(v);
      }}
      onBlur={() => {
        if (!isPlausibleDate(draft)) setDraft(value);
      }}
    />
  );
}

export function FiltersBar({ showPeriod = true }: { showPeriod?: boolean }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { filters, update } = useFilters();

  const companies = useApi<Company[]>(isAdmin ? '/companies' : null);
  const branches = useApi<Branch[]>(`/branches${buildQuery({ companyId: filters.companyId })}`);

  const activePreset = PRESETS.find((d) => {
    const r = presetRange(d);
    return r.from === filters.from && r.to === filters.to;
  });

  return (
    <div className="filters" role="group" aria-label="Фильтры">
      {isAdmin && (
        <label className="field">
          <span>Компания</span>
          <select
            aria-label="Компания"
            value={filters.companyId ?? ''}
            disabled={companies.loading && !companies.data}
            onChange={(e) => update({ companyId: e.target.value || null, branchId: null, page: null })}
          >
            <option value="">Все компании</option>
            {companies.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="field">
        <span>Филиал</span>
        <select
          aria-label="Филиал"
          value={filters.branchId ?? ''}
          disabled={branches.loading && !branches.data}
          onChange={(e) => update({ branchId: e.target.value || null, page: null })}
        >
          <option value="">Все филиалы{branches.data ? ` (${branches.data.length})` : ''}</option>
          {branches.data?.map((b) => (
            <option key={b.id} value={b.id}>
              {isAdmin && !filters.companyId ? `${b.companyName} · ${b.name}` : b.name}
            </option>
          ))}
        </select>
        {branches.error && <small className="field-error">{branches.error}</small>}
      </label>

      {showPeriod && (
        <>
          <div className="field">
            <span>Период</span>
            <div className="segmented" role="group" aria-label="Быстрый выбор периода">
              {PRESETS.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={activePreset === d ? 'active' : ''}
                  aria-pressed={activePreset === d}
                  onClick={() => update(presetRange(d))}
                >
                  {d} дн.
                </button>
              ))}
            </div>
          </div>
          <label className="field">
            <span>С</span>
            <DateInput value={filters.from} max={filters.to} onCommit={(v) => update({ from: v })} />
          </label>
          <label className="field">
            <span>По</span>
            <DateInput value={filters.to} min={filters.from} onCommit={(v) => update({ to: v })} />
          </label>
        </>
      )}
    </div>
  );
}
