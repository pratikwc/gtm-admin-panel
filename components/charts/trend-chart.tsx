'use client';

import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { addDays, addWeeks, format, parseISO, startOfISOWeek, startOfDay } from 'date-fns';
import type { TrendPoint } from '@/lib/queries/types';
import { EmptyState } from './panel';

/**
 * Single-series trend in the brand hue. Missing days/weeks are filled with
 * zero so pipeline gaps (e.g. scans switched off) are visible, not hidden.
 */
export function TrendChart({
  data,
  grain,
  from,
  label,
  height = 240,
}: {
  data: TrendPoint[];
  grain: 'day' | 'week';
  /** ISO start of the selected period; null for all time. */
  from: string | null;
  label: string;
  height?: number;
}) {
  const points = useMemo(() => fill(data, grain, from), [data, grain, from]);
  if (!points.length || points.every(p => p.value === 0)) {
    return <EmptyState>No {label.toLowerCase()} in this period.</EmptyState>;
  }
  const fmt = grain === 'day' ? 'd MMM' : "d MMM ''yy";

  return (
    <div style={{ height }} className="-ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--viz-brand)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--viz-brand)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
          <XAxis
            dataKey="t"
            tickFormatter={t => format(parseISO(t), fmt)}
            tick={{ fill: 'var(--viz-axis)', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--viz-grid)' }}
            minTickGap={28}
          />
          <YAxis
            width={44}
            allowDecimals={false}
            tick={{ fill: 'var(--viz-axis)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={v => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(v))}
          />
          <Tooltip
            cursor={{ stroke: 'var(--viz-axis)', strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as TrendPoint;
              return (
                <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                  <div className="text-muted-foreground">
                    {grain === 'week' ? 'Week of ' : ''}
                    {format(parseISO(p.t), 'EEE d MMM yyyy')}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[var(--viz-brand)]" />
                    <span className="tabular font-semibold">{p.value.toLocaleString()}</span>
                    <span className="text-muted-foreground">{label.toLowerCase()}</span>
                  </div>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--viz-brand)"
            strokeWidth={2}
            fill="url(#trendFill)"
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function fill(data: TrendPoint[], grain: 'day' | 'week', from: string | null): TrendPoint[] {
  if (!data.length && !from) return [];
  const map = new Map(data.map(d => [d.t, d.value]));
  const norm = (d: Date) => (grain === 'day' ? startOfDay(d) : startOfISOWeek(d));
  const step = (d: Date) => (grain === 'day' ? addDays(d, 1) : addWeeks(d, 1));
  const first = from ? norm(new Date(from)) : norm(parseISO(data[0].t));
  const last = norm(new Date());
  const out: TrendPoint[] = [];
  for (let d = first; d <= last && out.length < 2000; d = step(d)) {
    const key = format(d, 'yyyy-MM-dd');
    out.push({ t: key, value: map.get(key) ?? 0 });
  }
  return out;
}
