import { format, formatDistanceToNowStrict, parseISO } from 'date-fns';

const nf = new Intl.NumberFormat('en-US');
const cf = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export const fmtInt = (n: number | null | undefined) => (n == null ? '—' : nf.format(n));
export const fmtCompact = (n: number | null | undefined) => (n == null ? '—' : n < 10_000 ? nf.format(n) : cf.format(n));
export const fmtPct = (n: number | null | undefined, digits = 0) =>
  n == null ? '—' : `${(n * 100).toFixed(digits)}%`;

function toDate(v: string | Date) {
  return typeof v === 'string' ? parseISO(v.includes('T') || v.length <= 10 ? v : v.replace(' ', 'T')) : v;
}

/** All times are shown in one timezone so server- and client-rendered values agree. */
export const DISPLAY_TZ = process.env.NEXT_PUBLIC_DISPLAY_TZ || 'Asia/Kolkata';
export const DISPLAY_TZ_LABEL = DISPLAY_TZ === 'Asia/Kolkata' ? 'IST' : DISPLAY_TZ;

/** Shift an instant so date-fns (which formats in local time) prints wall-clock time in DISPLAY_TZ. */
function inDisplayTz(d: Date) {
  return new Date(d.toLocaleString('en-US', { timeZone: DISPLAY_TZ }));
}

export function fmtDate(v: string | Date | null | undefined, pattern = 'd MMM yyyy') {
  if (!v) return '—';
  const d = toDate(v);
  if (Number.isNaN(d.getTime())) return '—';
  // Plain dates (yyyy-mm-dd) have no time component: don't shift them.
  return format(typeof v === 'string' && v.length <= 10 ? d : inDisplayTz(d), pattern);
}

export function fmtAgo(v: string | Date | null | undefined) {
  if (!v) return 'never';
  const d = toDate(v);
  return Number.isNaN(d.getTime()) ? '—' : `${formatDistanceToNowStrict(d)} ago`;
}

/** Percentage change, or null when there is no meaningful baseline. */
export function delta(current: number | null | undefined, previous: number | null | undefined) {
  if (current == null || previous == null || previous === 0) return null;
  return (current - previous) / previous;
}
