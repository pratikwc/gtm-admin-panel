import Link from 'next/link';
import { cn } from '@/lib/utils';
import { fmtInt, fmtPct } from '@/lib/format';

export interface Segment {
  key: string;
  label: string;
  value: number;
  color: string;
  hint?: string;
  href?: string;
  active?: boolean;
}

/**
 * Part-to-whole bar for status buckets. 2px surface gaps between segments,
 * and a legend that names every segment with its count, so identity never
 * depends on colour alone. Each legend entry filters the table below.
 */
export function SegmentBar({ segments, height = 14 }: { segments: Segment[]; height?: number }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <div>
      <div className="flex w-full gap-[2px] overflow-hidden rounded-md" style={{ height }} role="img"
        aria-label={segments.map(s => `${s.label} ${fmtInt(s.value)}`).join(', ')}>
        {total === 0 ? (
          <div className="h-full w-full bg-[var(--viz-track)]" />
        ) : (
          segments.filter(s => s.value > 0).map(s => (
            <div
              key={s.key}
              title={`${s.label}: ${fmtInt(s.value)} (${fmtPct(s.value / total, 1)})`}
              className="h-full first:rounded-l-md last:rounded-r-md"
              style={{ width: `${(s.value / total) * 100}%`, minWidth: 3, background: s.color }}
            />
          ))
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {segments.map(s => {
          const body = (
            <>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
                <span className="truncate">{s.label}</span>
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="tabular text-lg font-semibold">{fmtInt(s.value)}</span>
                <span className="tabular text-xs text-muted-foreground">{total ? fmtPct(s.value / total, 1) : '—'}</span>
              </div>
              {s.hint && <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{s.hint}</div>}
            </>
          );
          const cls = cn(
            'block rounded-lg border px-3 py-2 transition-colors',
            s.active ? 'border-primary bg-accent' : 'border-transparent hover:border-border hover:bg-muted/60',
          );
          return s.href ? (
            <Link key={s.key} href={s.href} scroll={false} className={cls} aria-current={s.active ? 'true' : undefined}>
              {body}
            </Link>
          ) : (
            <div key={s.key} className={cls}>{body}</div>
          );
        })}
      </div>
    </div>
  );
}
