import { subDays } from 'date-fns';

export const RANGES = ['7d', '30d', '90d', 'all'] as const;
export type Range = (typeof RANGES)[number];
export const DEFAULT_RANGE: Range = '90d';

export const MARKETS = [
  { value: 'United Arab Emirates', label: 'UAE' },
  { value: 'Saudi Arabia', label: 'Saudi Arabia' },
  { value: 'Singapore', label: 'Singapore' },
  { value: 'Hong Kong', label: 'Hong Kong' },
  { value: 'India', label: 'India' },
  { value: 'Philippines', label: 'Philippines' },
  { value: 'Kuwait', label: 'Kuwait' },
  { value: 'Qatar', label: 'Qatar' },
  { value: 'Bahrain', label: 'Bahrain' },
  { value: 'Oman', label: 'Oman' },
] as const;

export type SearchParams = Record<string, string | string[] | undefined>;

export interface Filters {
  range: Range;
  days: number | null;
  /** Start of the selected period, or null for all time. */
  from: Date | null;
  /** Start of the previous period of equal length (for deltas), or null. */
  prevFrom: Date | null;
  market: string | null;
  q: string;
  page: number;
  status: string | null;
  tab: string | null;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseFilters(sp: SearchParams, now = new Date()): Filters {
  const rawRange = one(sp.range);
  const range: Range = (RANGES as readonly string[]).includes(rawRange ?? '') ? (rawRange as Range) : DEFAULT_RANGE;
  const days = range === 'all' ? null : Number.parseInt(range, 10);
  const rawMarket = one(sp.market);
  const market = MARKETS.some(m => m.value === rawMarket) ? rawMarket! : null;
  const page = Math.max(1, Number.parseInt(one(sp.page) ?? '1', 10) || 1);
  return {
    range,
    days,
    from: days ? subDays(now, days) : null,
    prevFrom: days ? subDays(now, days * 2) : null,
    market,
    q: (one(sp.q) ?? '').trim().slice(0, 100),
    page,
    status: one(sp.status)?.slice(0, 40) || null,
    tab: one(sp.tab)?.slice(0, 20) || null,
  };
}

export const PAGE_SIZE = 25;
