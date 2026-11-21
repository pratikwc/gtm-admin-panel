import Link from 'next/link';
import { cn } from '@/lib/utils';
import { fmtInt, fmtPct } from '@/lib/format';
import type { Bucket } from '@/lib/queries/types';
import { EmptyState } from './panel';

/**
 * Horizontal bar list: the default form for "how many in each category".
 * Bars share one scale (the largest value), labels and values sit in text
 * ink beside the bar, and every row carries a native tooltip with the share.
 */
export function BarList({
  items,
  color = 'var(--viz-brand)',
  hrefFor,
  total,
  max = 10,
  emptyText = 'No data for this filter.',
  mutedLabels = [],
  showZero = false,
}: {
  items: Bucket[];
  color?: string;
  hrefFor?: (b: Bucket) => string | null;
  /** Denominator for the share column; defaults to the sum of items. */
  total?: number;
  max?: number;
  emptyText?: string;
  /** Labels drawn in a neutral colour (e.g. "Unclassified", "Unknown"). */
  mutedLabels?: string[];
  /** Keep zero rows (for ordered buckets where an empty bucket is meaningful). */
  showZero?: boolean;
}) {
  const shown = (showZero ? items : items.filter(i => i.value > 0)).slice(0, max);
  if (shown.every(i => i.value === 0) && !showZero) return <EmptyState>{emptyText}</EmptyState>;
  if (!shown.length) return <EmptyState>{emptyText}</EmptyState>;
  const top = Math.max(1, ...shown.map(i => i.value));
  const denom = total ?? items.reduce((s, i) => s + i.value, 0);

  return (
    <ul className="space-y-1">
      {shown.map(item => {
        const href = hrefFor?.(item) ?? null;
        const share = denom ? item.value / denom : 0;
        const muted = mutedLabels.includes(item.label);
        const row = (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md px-1.5 py-1 transition-colors group-hover:bg-muted/70">
            <div className="min-w-0">
              <div className="mb-1 truncate text-[13px]">{item.label}</div>
              <div className="h-2 w-full rounded-full bg-[var(--viz-track)]">
                <div
                  className="h-2 rounded-full"
                  style={{ width: item.value ? `${Math.max(2, (item.value / top) * 100)}%` : 0, background: muted ? 'var(--status-neutral)' : color }}
                />
              </div>
            </div>
            <div className="text-right">
              <div className="tabular text-[13px] font-medium">{fmtInt(item.value)}</div>
              <div className="tabular text-[11px] text-muted-foreground">{fmtPct(share, share < 0.1 ? 1 : 0)}</div>
            </div>
          </div>
        );
        const title = `${item.label}: ${fmtInt(item.value)} (${fmtPct(share, 1)})`;
        return (
          <li key={item.key ?? item.label} className="group" title={title}>
            {href ? (
              <Link href={href} scroll={false} className={cn('block rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring')}>
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ul>
  );
}
