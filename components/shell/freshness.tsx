import { AlertTriangle } from 'lucide-react';
import { fmtAgo, fmtDate } from '@/lib/format';
import { freshness, type Health } from '@/lib/health';
import { StatusChip, type ChipTone } from '@/components/charts/status-chip';

const TONE: Record<Health, ChipTone> = { ok: 'good', warn: 'warn', bad: 'bad', unknown: 'neutral' };
const WORD: Record<Health, string> = { ok: 'On schedule', warn: 'Late', bad: 'Stopped', unknown: 'Unknown' };

export function FreshnessChip({ label, at }: { label: string; at: string | null }) {
  const h = freshness(at);
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-sm" title={at ? fmtDate(at, 'd MMM yyyy, HH:mm') : 'No runs recorded'}>
      <span className="text-muted-foreground">{label}</span>
      <StatusChip tone={TONE[h]}>
        {WORD[h]} · {fmtAgo(at)}
      </StatusChip>
    </span>
  );
}

export function Banner({ tone = 'warn', title, children }: { tone?: 'warn' | 'bad'; title: string; children: React.ReactNode }) {
  return (
    <div role="status" className={`mb-6 flex gap-3 rounded-xl border px-4 py-3 ${tone === 'bad' ? 'chip-bad border-[color:var(--status-critical)]/30' : 'chip-warn border-transparent'}`}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="text-sm text-foreground">
        <div className="font-semibold">{title}</div>
        <div className="mt-0.5 text-foreground/80">{children}</div>
      </div>
    </div>
  );
}
