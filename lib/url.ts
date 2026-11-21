import type { SearchParams } from './filters';

/** Build an href from the current search params with some keys changed (null removes). */
export function hrefWith(pathname: string, sp: SearchParams, changes: Record<string, string | null>) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val != null) next.set(k, val);
  }
  for (const [k, v] of Object.entries(changes)) {
    if (v == null || v === '') next.delete(k);
    else next.set(k, v);
  }
  if (!('page' in changes)) next.delete('page');
  const s = next.toString();
  return s ? `${pathname}?${s}` : pathname;
}
