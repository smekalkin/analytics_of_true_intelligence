'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { MetricKey } from './types';

export interface Filters {
  companyId: number | null;
  branchId: number | null;
  from: string;
  to: string;
  metric: MetricKey;
}

const METRIC_KEYS: MetricKey[] = ['views', 'websiteClicks', 'calls', 'routes', 'rating', 'reviewsCount'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Быстрые периоды заканчиваются вчерашним днём: данные за текущие сутки ещё неполные. */
export function presetRange(days: number): { from: string; to: string } {
  const to = new Date(Date.now() - 86_400_000);
  const from = new Date(to.getTime() - (days - 1) * 86_400_000);
  return { from: isoDate(from), to: isoDate(to) };
}

const toId = (v: string | null) => {
  const n = Number(v);
  return v && Number.isInteger(n) && n > 0 ? n : null;
};

/** Фильтры живут в URL — ими можно поделиться, они переживают перезагрузку и переход между разделами. */
export function useFilters() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters = useMemo<Filters>(() => {
    const def = presetRange(30);
    const from = sp.get('from');
    const to = sp.get('to');
    const metric = sp.get('metric') as MetricKey | null;
    return {
      companyId: toId(sp.get('companyId')),
      branchId: toId(sp.get('branchId')),
      from: from && DATE_RE.test(from) ? from : def.from,
      to: to && DATE_RE.test(to) ? to : def.to,
      metric: metric && METRIC_KEYS.includes(metric) ? metric : 'views',
    };
  }, [sp]);

  const update = useCallback(
    (patch: Partial<Record<string, string | number | null>>) => {
      // Берём актуальный адрес, а не снимок рендера: два быстрых клика не должны терять первый
      const next = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === '') next.delete(k);
        else next.set(k, String(v));
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [sp, router, pathname],
  );

  /** Строка запроса для ссылок между разделами (сохраняем компанию, филиал и период). */
  const carryQuery = useCallback(
    (extra: Record<string, string | number | null> = {}) => {
      const next = new URLSearchParams();
      for (const k of ['companyId', 'branchId', 'from', 'to']) {
        const v = sp.get(k);
        if (v) next.set(k, v);
      }
      for (const [k, v] of Object.entries(extra)) {
        if (v === null) next.delete(k);
        else next.set(k, String(v));
      }
      const qs = next.toString();
      return qs ? `?${qs}` : '';
    },
    [sp],
  );

  return { filters, update, carryQuery };
}
