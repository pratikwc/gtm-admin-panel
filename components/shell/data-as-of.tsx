import { fmtDate } from '@/lib/format';

/** When the numbers on screen were read from the database (they are cached for 10 minutes). */
export function DataAsOf({ at }: { at: string }) {
  return (
    <span className="text-xs text-muted-foreground" title="Numbers are cached for 10 minutes. Press Refresh to re-read now.">
      Data as of {fmtDate(at, 'HH:mm')}
    </span>
  );
}
