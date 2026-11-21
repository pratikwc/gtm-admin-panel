import 'server-only';
import { env } from './env';

/**
 * Read-only HubSpot CRM client. Only GETs and the search POST (which reads)
 * are used; nothing here writes to HubSpot.
 */

const BASE = 'https://api.hubapi.com';

export class HubspotError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** HubSpot allows ~5 search requests per second per account; stay under it. */
const MAX_CONCURRENT = 4;
let active = 0;
const queue: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>(r => queue.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    queue.shift()?.();
  }
}

export async function hubspot<T>(path: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await slot(() =>
      fetch(`${BASE}${path}`, {
        method: init.method ?? 'GET',
        headers: { Authorization: `Bearer ${env.hubspotToken()}`, 'Content-Type': 'application/json' },
        body: init.body ? JSON.stringify(init.body) : undefined,
        cache: 'no-store',
        signal: AbortSignal.timeout(20_000),
      }),
    );
    if (res.ok) return (await res.json()) as T;
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 400 * 2 ** attempt;
      await sleep(wait);
      continue;
    }
    const text = await res.text().catch(() => '');
    let message = text.slice(0, 300);
    try {
      message = (JSON.parse(text) as { message?: string }).message ?? message;
    } catch {}
    throw new HubspotError(res.status, `HubSpot ${res.status}: ${message}`);
  }
}

export interface HsFilter {
  propertyName: string;
  operator: 'EQ' | 'NEQ' | 'GT' | 'GTE' | 'LT' | 'LTE' | 'HAS_PROPERTY' | 'NOT_HAS_PROPERTY' | 'IN';
  value?: string;
  values?: string[];
}
export type HsRecord = { id: string; properties: Record<string, string | null> };
type SearchResponse = { total: number; results: HsRecord[]; paging?: { next?: { after: string } } };

/** Count records matching one AND-group of filters. */
export async function hsCount(object: 'companies' | 'contacts', filters: HsFilter[]): Promise<number> {
  const r = await hubspot<SearchResponse>(`/crm/v3/objects/${object}/search`, {
    method: 'POST',
    body: { filterGroups: [{ filters }], limit: 1, properties: ['hs_object_id'] },
  });
  return r.total;
}

/**
 * Every record matching `filters` (an AND-group; pass several groups for OR).
 * Search caps paging at 10,000 results, so this walks by object id instead
 * ("id > last seen"), in parallel id slices to keep the full read fast.
 */
export async function hsSearchAll(
  object: 'companies' | 'contacts',
  filterGroups: HsFilter[][],
  properties: string[],
  slices = 6,
): Promise<HsRecord[]> {
  const edge = async (direction: 'ASCENDING' | 'DESCENDING') => {
    const r = await hubspot<SearchResponse>(`/crm/v3/objects/${object}/search`, {
      method: 'POST',
      body: { filterGroups: filterGroups.map(filters => ({ filters })), sorts: [{ propertyName: 'hs_object_id', direction }], limit: 1, properties: ['hs_object_id'] },
    });
    return r.results[0] ? BigInt(r.results[0].id) : null;
  };
  const [lo, hi] = await Promise.all([edge('ASCENDING'), edge('DESCENDING')]);
  if (lo == null || hi == null) return [];

  const span = hi - lo + 1n;
  const n = BigInt(Math.max(1, slices));
  const bounds = Array.from({ length: Number(n) + 1 }, (_, i) => lo + (span * BigInt(i)) / n);

  const walk = async (from: bigint, to: bigint) => {
    const out: HsRecord[] = [];
    let after = from - 1n;
    for (;;) {
      const r = await hubspot<SearchResponse>(`/crm/v3/objects/${object}/search`, {
        method: 'POST',
        body: {
          // Each OR-group gets the id window added so the slices don't overlap.
          filterGroups: filterGroups.map(filters => ({
            filters: [
              ...filters,
              { propertyName: 'hs_object_id', operator: 'GT', value: after.toString() },
              { propertyName: 'hs_object_id', operator: 'LT', value: to.toString() },
            ],
          })),
          sorts: [{ propertyName: 'hs_object_id', direction: 'ASCENDING' }],
          properties,
          limit: 200,
        },
      });
      out.push(...r.results);
      if (r.results.length < 200) return out;
      after = BigInt(r.results[r.results.length - 1].id);
    }
  };

  const parts = await Promise.all(bounds.slice(0, -1).map((b, i) => walk(b, i === bounds.length - 2 ? hi + 1n : bounds[i + 1])));
  return parts.flat();
}

export async function hsGet(object: 'companies' | 'contacts', id: string, properties: string[]): Promise<HsRecord | null> {
  try {
    return await hubspot<HsRecord>(`/crm/v3/objects/${object}/${encodeURIComponent(id)}?properties=${properties.join(',')}`);
  } catch (e) {
    if (e instanceof HubspotError && e.status === 404) return null;
    throw e;
  }
}

/** The account's portal id, for "Open in HubSpot" links. */
export async function hsPortalId(): Promise<string | null> {
  if (env.hubspotPortalId()) return env.hubspotPortalId();
  try {
    const r = await hubspot<{ portalId: number }>('/account-info/v3/details');
    return String(r.portalId);
  } catch {
    return null;
  }
}
