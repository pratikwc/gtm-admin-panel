export type Health = 'ok' | 'warn' | 'bad' | 'unknown';

/** Green under 26h, amber under 72h, red beyond. */
export function freshness(iso: string | null, now = Date.now()): Health {
  if (!iso) return 'unknown';
  const hours = (now - new Date(iso).getTime()) / 3_600_000;
  return hours < 26 ? 'ok' : hours < 72 ? 'warn' : 'bad';
}
