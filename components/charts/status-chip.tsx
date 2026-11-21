import { cn } from '@/lib/utils';

export type ChipTone = 'good' | 'warn' | 'serious' | 'bad' | 'neutral' | 'info';

const TONE: Record<ChipTone, string> = {
  good: 'chip-good',
  warn: 'chip-warn',
  serious: 'chip-serious',
  bad: 'chip-bad',
  neutral: 'chip-neutral',
  info: 'bg-accent text-accent-foreground',
};

const DOT: Record<ChipTone, string> = {
  good: 'var(--status-good)',
  warn: 'var(--status-warning)',
  serious: 'var(--status-serious)',
  bad: 'var(--status-critical)',
  neutral: 'var(--status-neutral)',
  info: 'var(--viz-brand)',
};

/** Status label with a dot. Text always carries the meaning; colour only reinforces it. */
export function StatusChip({ tone, children, className }: { tone: ChipTone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', TONE[tone], className)}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: DOT[tone] }} aria-hidden />
      {children}
    </span>
  );
}
