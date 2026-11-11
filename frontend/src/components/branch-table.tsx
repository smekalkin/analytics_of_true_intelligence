'use client';

import { formatMetric, METRICS } from '@/lib/format';
import { BranchStats } from '@/lib/types';

interface Props {
  items: BranchStats[];
  showCompany: boolean;
  selectedId: number | null;
  onSelect: (branchId: number | null) => void;
}

/** Таблица по филиалам. В узком контейнере каждая строка превращается в карточку (см. .stackable в CSS). */
export function BranchTable({ items, showCompany, selectedId, onSelect }: Props) {
  return (
    <div className="table-wrap">
      <table className="table stackable">
        <thead>
          <tr>
            <th>Филиал</th>
            {METRICS.map((m) => (
              <th key={m.key} className="num">
                {m.short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((b) => {
            const selected = b.branchId === selectedId;
            const toggle = () => onSelect(selected ? null : b.branchId);
            return (
              <tr
                key={b.branchId}
                className={selected ? 'selected' : ''}
                onClick={toggle}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggle();
                  }
                }}
                aria-current={selected ? true : undefined}
                title={selected ? 'Показать все филиалы' : 'Показать статистику филиала'}
              >
                <td className="stack-full">
                  <div className="cell-title">{b.name}</div>
                  <div className="cell-sub">
                    {showCompany && `${b.companyName} · `}
                    {b.city}, {b.address}
                  </div>
                </td>
                {METRICS.map((m) => (
                  <td key={m.key} className="num" data-label={m.short}>
                    {formatMetric(m.key, b.totals[m.key])}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
