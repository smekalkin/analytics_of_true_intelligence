'use client';

import { formatMetric, formatShortDate } from '@/lib/format';
import { MetricKey } from '@/lib/types';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface Props {
  metric: MetricKey;
  label: string;
  points: { date: string; value: number | null }[];
}

export function MetricChart({ metric, label, points }: Props) {
  const isRating = metric === 'rating';
  return (
    <div className="chart" role="img" aria-label={`График: ${label}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatShortDate}
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            minTickGap={24}
          />
          <YAxis
            width={64}
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            domain={isRating ? ['dataMin - 0.05', 'dataMax + 0.05'] : [0, 'auto']}
            tickFormatter={(v: number) => (isRating ? v.toFixed(2) : new Intl.NumberFormat('ru-RU', { notation: 'compact' }).format(v))}
            allowDecimals={isRating}
          />
          <Tooltip
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}
            labelFormatter={(d: string) => formatShortDate(d)}
            formatter={(v: number) => [formatMetric(metric, v), label]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--accent)"
            strokeWidth={2}
            fill="url(#chartFill)"
            connectNulls
            isAnimationActive={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
