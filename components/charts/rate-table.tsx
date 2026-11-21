import Link from 'next/link';
import { fmtInt, fmtPct } from '@/lib/format';
import { EmptyState } from './panel';

export interface RateTableRow {
  label: string;
  base: number;
  hit: number;
  /** Optional third count shown in its own column (e.g. bounced). */
  extra?: number;
  href?: string | null;
}

/**
 * "Where does it work?" table: volume, outcome count and the rate between them,
 * with the rate drawn as a bar on one shared scale so rows compare at a glance.
 * Rates from tiny groups are greyed out so they aren't over-read.
 */
export function RateTable({
  rows,
  rowHeader,
  baseLabel,
  hitLabel,
  extraLabel,
  rateLabel = 'Rate',
  max = 8,
  minBase = 20,
}: {
  rows: RateTableRow[];
  rowHeader: string;
  baseLabel: string;
  hitLabel: string;
  extraLabel?: string;
  rateLabel?: string;
  max?: number;
  minBase?: number;
}) {
  const shown = rows.filter(r => r.base > 0).slice(0, max);
  if (!shown.length) return <EmptyState>No data for this filter.</EmptyState>;
  const top = Math.max(0.0001, ...shown.filter(r => r.base >= minBase).map(r => r.hit / r.base));
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="px-1 pb-2 text-left font-medium">{rowHeader}</th>
            <th className="px-2 pb-2 text-right font-medium">{baseLabel}</th>
            <th className="px-2 pb-2 text-right font-medium">{hitLabel}</th>
            {extraLabel && <th className="px-2 pb-2 text-right font-medium">{extraLabel}</th>}
            <th className="w-[34%] px-1 pb-2 text-left font-medium">{rateLabel}</th>
          </tr>
        </thead>
        <tbody>
          {shown.map(r => {
            const rate = r.base ? r.hit / r.base : 0;
            const small = r.base < minBase;
            const label = r.href ? <Link href={r.href} scroll={false} className="hover:text-primary">{r.label}</Link> : r.label;
            return (
              <tr key={r.label} className="border-b last:border-0">
                <td className="max-w-[200px] truncate px-1 py-2 font-medium">{label}</td>
                <td className="tabular px-2 py-2 text-right">{fmtInt(r.base)}</td>
                <td className={`tabular px-2 py-2 text-right ${r.hit ? '' : 'text-muted-foreground'}`}>{fmtInt(r.hit)}</td>
                {extraLabel && <td className={`tabular px-2 py-2 text-right ${r.extra ? '' : 'text-muted-foreground'}`}>{fmtInt(r.extra ?? 0)}</td>}
                <td className="px-1 py-2">
                  <div className="flex items-center gap-2" title={small ? `Only ${r.base} — too few to judge` : undefined}>
                    <div className="h-2 flex-1 rounded-full bg-[var(--viz-track)]">
                      <div
                        className="h-2 rounded-full"
                        style={{ width: rate ? `${Math.max(3, Math.min(100, (rate / top) * 100))}%` : 0, background: small ? 'var(--status-neutral)' : 'var(--viz-brand)' }}
                      />
                    </div>
                    <span className={`tabular w-12 text-right text-xs ${small ? 'text-muted-foreground' : 'font-medium'}`}>{fmtPct(rate, rate && rate < 0.1 ? 1 : 0)}</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
