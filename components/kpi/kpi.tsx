import { ArrowDownRight, ArrowUpRight, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { delta, fmtInt, fmtPct } from '@/lib/format';
import type { Kpi } from '@/lib/queries/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type Tone = 'default' | 'good' | 'warn' | 'bad';

const MIN_BASELINE = 20;

const toneRing: Record<Tone, string> = {
  default: '',
  good: 'before:bg-[var(--status-good)]',
  warn: 'before:bg-[var(--status-warning)]',
  bad: 'before:bg-[var(--status-critical)]',
};

export function KpiTile({
  label,
  kpi,
  tone = 'default',
  /** Set when a rise is bad news (e.g. stale jobs), so the delta colour flips. */
  invert = false,
  footer,
}: {
  label: string;
  kpi: Kpi;
  tone?: Tone;
  invert?: boolean;
  footer?: React.ReactNode;
}) {
  const value = kpi.format === 'percent' ? fmtPct(kpi.value, 1) : fmtInt(kpi.value);
  // A % change against a tiny baseline (e.g. the weeks before launch) is noise, so skip it.
  const d = kpi.format === 'percent' || (kpi.previous ?? 0) < MIN_BASELINE ? null : delta(kpi.value, kpi.previous);
  const pp = kpi.format === 'percent' && kpi.value != null && kpi.previous != null ? (kpi.value - kpi.previous) * 100 : null;
  const change = d != null ? d : pp != null ? pp / 100 : null;
  const up = change != null && change > 0;
  const good = change == null || change === 0 ? null : invert ? !up : up;

  return (
    <div
      className={cn(
        'relative overflow-hidden bg-card px-4 py-5 text-center',
        tone !== 'default' && 'before:absolute before:inset-x-0 before:top-0 before:h-1',
        toneRing[tone],
      )}
    >
      <div className="flex items-center justify-center gap-1.5 text-[13px] font-medium text-foreground/80">
        <span className="truncate">{label}</span>
        {kpi.hint && (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger aria-label={`About ${label}`} className="rounded text-muted-foreground/70 hover:text-foreground">
                <Info className="h-3.5 w-3.5" />
              </TooltipTrigger>
              <TooltipContent className="max-w-60 text-xs">{kpi.hint}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <div className="mt-2 flex items-baseline justify-center gap-2">
        <span className="tabular font-display text-[30px] font-bold leading-none tracking-tight">{value}</span>
        {change != null && change !== 0 && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium tabular',
              good ? 'chip-good' : 'chip-bad',
            )}
            title="Compared with the previous period of the same length"
          >
            {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {pp != null ? `${Math.abs(pp).toFixed(1)} pts` : fmtPct(Math.abs(change), Math.abs(change) < 0.1 ? 1 : 0)}
          </span>
        )}
      </div>
      {footer && <div className="mt-2 text-xs text-muted-foreground">{footer}</div>}
    </div>
  );
}

export function KpiRow({ children }: { children: React.ReactNode }) {
  // One card split by hairlines (the 1px gaps show the border colour through).
  return (
    <div className="overflow-hidden rounded-2xl border border-primary/25 bg-border">
      <div className="grid grid-cols-2 gap-px md:grid-cols-3 xl:grid-cols-6">{children}</div>
    </div>
  );
}
