import { formatDelta, formatMetric } from '@/lib/format';
import { MetricKey } from '@/lib/types';

interface Props {
  metric: MetricKey;
  label: string;
  current: number | null;
  previous: number | null;
  active?: boolean;
  onSelect?: () => void;
}

export function KpiCard({ metric, label, current, previous, active, onSelect }: Props) {
  const delta = formatDelta(metric, current, previous);
  return (
    <button type="button" className={`kpi ${active ? 'active' : ''}`} onClick={onSelect} aria-pressed={active}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">
        {formatMetric(metric, current)}
        {metric === 'rating' && current !== null && <span className="kpi-star"> ★</span>}
      </span>
      <span className={`kpi-delta ${delta?.trend ?? 'flat'}`} title="Изменение к предыдущему периоду такой же длины">
        {delta ? (
          <>
            {delta.trend === 'up' ? '▲' : delta.trend === 'down' ? '▼' : '•'} {delta.text}
            <span className="muted"> к пред. периоду</span>
          </>
        ) : (
          <span className="muted">нет данных для сравнения</span>
        )}
      </span>
    </button>
  );
}
