'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fmtInt, fmtPct } from '@/lib/format';
import type { MarketMapGeometry } from '@/lib/geo';
import type { FunnelRow } from '@/lib/marketing';
import { cn } from '@/lib/utils';

const METRICS = [
  { key: 'data', label: 'Data', of: null },
  { key: 'reached', label: 'Reached out', of: 'data' },
  { key: 'replied', label: 'Replied', of: 'reached' },
] as const;
type MetricKey = (typeof METRICS)[number]['key'];

const STEPS: { key: keyof Omit<FunnelRow, 'label'>; label: string; of?: keyof Omit<FunnelRow, 'label'> }[] = [
  { key: 'data', label: 'Data' },
  { key: 'researched', label: 'Researched', of: 'data' },
  { key: 'reached', label: 'Reached out', of: 'data' },
  { key: 'replied', label: 'Replied', of: 'reached' },
  { key: 'positive', label: 'Positive reply', of: 'replied' },
  { key: 'opportunity', label: 'Opportunity', of: 'positive' },
];

/** Brand hue mixed into the empty-track colour; sqrt so small markets still show. */
const shade = (v: number, max: number) =>
  v > 0 && max > 0 ? `color-mix(in srgb, var(--viz-brand) ${Math.round(15 + 85 * Math.sqrt(v / max))}%, var(--viz-track))` : 'var(--viz-track)';

/** Choropleth of our markets. Hover a country for its funnel, click to filter the page to it. */
export function MarketMap({
  geo,
  rows,
  hrefs,
  active,
}: {
  geo: MarketMapGeometry;
  rows: FunnelRow[];
  hrefs: Record<string, string>;
  active: string | null;
}) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [metric, setMetric] = useState<MetricKey>('data');
  const [hover, setHover] = useState<{ name: string; x: number; y: number } | null>(null);

  const byName = useMemo(() => new Map(rows.map(r => [r.label, r])), [rows]);
  const max = Math.max(...geo.shapes.map(s => byName.get(s.name)?.[metric] ?? 0), 0);
  const row = hover ? byName.get(hover.name) : undefined;

  const track = (name: string) => (e: React.MouseEvent) => {
    const r = box.current!.getBoundingClientRect();
    setHover({ name, x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const handlers = (name: string) => ({
    onMouseMove: track(name),
    onMouseLeave: () => setHover(null),
    onClick: () => hrefs[name] && router.push(hrefs[name], { scroll: false }),
    onKeyDown: (e: React.KeyboardEvent) => e.key === 'Enter' && hrefs[name] && router.push(hrefs[name], { scroll: false }),
    tabIndex: 0,
    role: 'button',
    'aria-label': `${name}: ${fmtInt(byName.get(name)?.[metric] ?? 0)} ${METRICS.find(m => m.key === metric)!.label.toLowerCase()}`,
    className: 'cursor-pointer outline-none transition-[fill,opacity] duration-150',
  });

  return (
    <div className="mb-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Shade by</span>
          <div className="flex gap-1 rounded-lg bg-muted p-0.5">
            {METRICS.map(m => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMetric(m.key)}
                className={cn(
                  'rounded-md px-2.5 py-1 font-medium transition-colors',
                  metric === m.key ? 'bg-background text-foreground shadow-sm' : 'hover:text-foreground',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="tabular">0</span>
          <span
            className="h-2 w-28 rounded-full"
            style={{ background: 'linear-gradient(90deg, var(--viz-track), color-mix(in srgb, var(--viz-brand) 40%, var(--viz-track)), var(--viz-brand))' }}
          />
          <span className="tabular">{fmtInt(max)}</span>
        </div>
      </div>

      <div ref={box} className="relative overflow-hidden rounded-xl border bg-[color-mix(in_srgb,var(--viz-track)_35%,hsl(var(--card)))]">
        <svg viewBox={`0 0 ${geo.width} ${geo.height}`} className="block h-auto w-full" role="img" aria-label="Map of our markets">
          <path d={geo.base} fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth={0.6} />
          {geo.shapes.map(s => {
            const v = byName.get(s.name)?.[metric] ?? 0;
            const on = hover?.name === s.name || active === s.name;
            return (
              <path
                key={s.name}
                d={s.d}
                fill={shade(v, max)}
                stroke={on ? 'hsl(var(--foreground))' : 'hsl(var(--card))'}
                strokeWidth={on ? 1.4 : 0.8}
                opacity={active && active !== s.name ? 0.45 : 1}
                {...handlers(s.name)}
              />
            );
          })}
          {/* Small markets get a dot so there's something to hover */}
          {geo.shapes.filter(s => s.small).map(s => {
            const v = byName.get(s.name)?.[metric] ?? 0;
            const on = hover?.name === s.name || active === s.name;
            return (
              <circle
                key={`dot-${s.name}`}
                cx={s.cx}
                cy={s.cy}
                r={on ? 8 : 6.5}
                fill={shade(Math.max(v, max * 0.02), max)}
                stroke={on ? 'hsl(var(--foreground))' : 'hsl(var(--card))'}
                strokeWidth={1.5}
                opacity={active && active !== s.name ? 0.45 : 1}
                {...handlers(s.name)}
              />
            );
          })}
        </svg>

        {hover && (
          <div
            className="pointer-events-none absolute z-10 w-56 rounded-xl border bg-popover p-3 text-xs shadow-lg"
            style={{
              left: Math.min(hover.x + 14, (box.current?.clientWidth ?? 0) - 236),
              top: Math.max(hover.y - 20, 8),
            }}
          >
            <div className="mb-2 font-display text-sm font-semibold">{hover.name}</div>
            {row ? (
              <dl className="space-y-1">
                {STEPS.map(st => {
                  const r = st.of && row[st.of] ? row[st.key] / row[st.of] : null;
                  return (
                    <div key={st.key} className="flex items-baseline justify-between gap-3">
                      <dt className="text-muted-foreground">{st.label}</dt>
                      <dd className="tabular font-medium">
                        {fmtInt(row[st.key])}
                        {r != null && <span className="ml-1 font-normal text-muted-foreground">{fmtPct(r, r < 0.1 ? 1 : 0)}</span>}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            ) : (
              <p className="text-muted-foreground">No target companies here yet.</p>
            )}
            <p className="mt-2 border-t pt-2 text-[11px] text-muted-foreground">{active === hover.name ? 'Click to clear the filter' : 'Click to filter the page to this market'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
