import 'server-only';
import { gtm } from '@/lib/db/gtm';
import { jd } from '@/lib/db/jd';
import { cached } from '@/lib/cache';
import { env } from '@/lib/env';
import { countryCaseSql } from '@/lib/buckets';

/** JD jobs have no market column: the country is parsed from the location, as on the JD published tab. */
const JD_MARKET = `($1::text IS NULL OR ${countryCaseSql('location')} = $1)`;
const GTM_MARKET = `($1::text IS NULL OR scan_market = $1)`;

export { freshness, type Health } from '@/lib/health';

export interface PipelineSnapshot {
  /** `of` names the stage this one is a share of (stages aren't all strict subsets). */
  funnel: { key: string; label: string; value: number; hint: string; href: string; of?: string }[];
  lastScanAt: string | null;
  lastSyncAt: string | null;
  latestJdUpdate: string | null;
  latestApplicationAt: string | null;
  drift: {
    gtmLiveMissingInJd: number;
    jdActiveGtmStale: number;
    jdActiveTotal: number;
    gtmLive: number;
  };
}

/**
 * Cross-database view of the whole pipeline. The two Supabase projects can't
 * join each other, so we pull the id sets (a few tens of thousands of ids)
 * and diff them here.
 */
async function snapshot(fromIso: string | null, market: string | null = null): Promise<PipelineSnapshot> {
  // Scraped, matched and synced count what happened in the period; live and fresh are where things stand today.
  const [[g], gtmLive, [scan], [j], jdActive, [apps]] = await Promise.all([
    gtm<{ total: number; matched: number }>(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE company_hs_id IS NOT NULL)::int AS matched FROM jobs
        WHERE ${GTM_MARKET} AND ($2::timestamptz IS NULL OR first_seen >= $2::timestamptz)`,
      [market, fromIso],
    ),
    gtm<{ id: string }>(`SELECT job_id::text AS id FROM jobs WHERE last_seen > now() - interval '60 days' AND ${GTM_MARKET}`, [market]),
    gtm<{ at: string | null }>(`SELECT max(started_at)::text AS at FROM job_scan_runs`),
    jd<{ synced: number; fresh: number; last_sync: string | null; latest_update: string | null }>(
      `SELECT (SELECT count(*) FROM jobs WHERE source_id IS NOT NULL AND ${JD_MARKET} AND ($2::timestamptz IS NULL OR created_at >= $2::timestamptz))::int AS synced,
              (SELECT count(*) FROM jobs WHERE is_active AND source_id IS NOT NULL AND posted_date > current_date - 60 AND ${JD_MARKET})::int AS fresh,
              (SELECT last_jobs_synced_at::text FROM gtm_sync_state LIMIT 1) AS last_sync,
              (SELECT max(updated_at)::text FROM jobs WHERE source_id IS NOT NULL) AS latest_update`,
      [market, fromIso],
    ),
    jd<{ id: string }>(`SELECT source_id AS id FROM jobs WHERE is_active AND source_id IS NOT NULL AND ${JD_MARKET}`, [market]),
    jd<{ n: number; latest: string | null }>(
      `SELECT count(*) FILTER (WHERE $1::timestamptz IS NULL OR created_at >= $1::timestamptz)::int AS n,
              max(created_at)::text AS latest FROM chat_interactions`,
      [fromIso],
    ),
  ]);

  const liveSet = new Set(gtmLive.map(r => r.id));
  const jdActiveSet = new Set(jdActive.map(r => r.id));
  let gtmLiveMissingInJd = 0;
  for (const id of liveSet) if (!jdActiveSet.has(id)) gtmLiveMissingInJd++;
  let jdActiveGtmStale = 0;
  for (const id of jdActiveSet) if (!liveSet.has(id)) jdActiveGtmStale++;

  return {
    funnel: [
      { key: 'scraped', label: 'Scraped', value: g.total, hint: fromIso ? 'new LinkedIn jobs found in the period' : 'LinkedIn jobs in GTM', href: '/outbound' },
      { key: 'matched', label: 'Matched', value: g.matched, hint: 'linked to a company we track', href: '/outbound', of: 'scraped' },
      { key: 'live', label: 'Live in GTM', value: liveSet.size, hint: 'now: seen in the last 60 days', href: '/outbound', of: fromIso ? undefined : 'scraped' },
      { key: 'synced', label: 'Synced to JD', value: j.synced, hint: fromIso ? 'copied into Jobs Duniya in the period' : 'ever copied into Jobs Duniya', href: '/published', of: 'scraped' },
      { key: 'fresh', label: 'Fresh on JD', value: j.fresh, hint: 'now: active and posted ≤ 60 days', href: '/published?status=active_fresh', of: fromIso ? undefined : 'synced' },
      { key: 'apps', label: 'Applications', value: apps.n, hint: market ? 'form submissions in the period (all markets)' : 'form submissions in the period', href: '/applications' },
    ],
    lastScanAt: scan.at,
    lastSyncAt: j.last_sync,
    latestJdUpdate: j.latest_update,
    latestApplicationAt: apps.latest,
    drift: {
      gtmLiveMissingInJd,
      jdActiveGtmStale,
      jdActiveTotal: jdActiveSet.size,
      gtmLive: liveSet.size,
    },
  };
}

const snapshotCached = cached('pipeline-snapshot-v3', 'pipeline', snapshot);
export function getPipelineSnapshot(fromIso: string | null, market: string | null = null) {
  return snapshotCached(fromIso, market);
}

export interface ApiStatus {
  ok: boolean;
  /** HTTP status from the Jobs Duniya Supabase REST API (402 = quota restriction). */
  status: number | null;
  message: string | null;
}

/**
 * The public Jobs Duniya site talks to Supabase over its REST API (search,
 * the application form, resume uploads). The panel reads Postgres directly,
 * so it keeps working when that API is down; this probe makes such an
 * outage visible.
 */
async function jdApiStatus(): Promise<ApiStatus> {
  try {
    const res = await fetch(`${env.jdUrl()}/rest/v1/gtm_sync_state?select=updated_at&limit=1`, {
      headers: { apikey: env.jdServiceKey(), Authorization: `Bearer ${env.jdServiceKey()}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return { ok: true, status: res.status, message: null };
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    return { ok: false, status: res.status, message: body?.message ?? res.statusText };
  } catch (e) {
    return { ok: false, status: null, message: (e as Error).message };
  }
}

const apiStatusCached = cached('jd-api-status-v1', 'pipeline', jdApiStatus);
export function getJdApiStatus() {
  return apiStatusCached();
}

export interface JdCoverageRow {
  key: 'fresh' | 'live' | 'aging' | 'stale';
  gtm: number;
  /** On Jobs Duniya and flagged active (shown on the site). */
  jdActive: number;
  /** On Jobs Duniya but flagged inactive (hidden from the site). */
  jdInactive: number;
  /** Never copied into Jobs Duniya. */
  missing: number;
}

export interface JdCoverage {
  rows: JdCoverageRow[];
  lastJobsSyncedAt: string | null;
  /** First-seen date of the newest GTM job that is on JD. */
  newestSyncedFirstSeen: string | null;
}

/**
 * Every GTM job, by how recently the scraper saw it, against its state on
 * Jobs Duniya. JD's rule is "active while GTM saw it in the last 60 days",
 * so Fresh/Live/Aging should be active on JD and Stale should be inactive.
 */
async function coverage(market: string | null): Promise<JdCoverage> {
  const [g, j, [sync]] = await Promise.all([
    gtm<{ id: string; b: JdCoverageRow['key']; first_seen: string }>(
      `SELECT job_id::text AS id, first_seen::text,
              CASE WHEN last_seen > now() - interval '7 days' THEN 'fresh'
                   WHEN last_seen > now() - interval '30 days' THEN 'live'
                   WHEN last_seen > now() - interval '60 days' THEN 'aging'
                   ELSE 'stale' END AS b
         FROM jobs WHERE ($1::text IS NULL OR scan_market = $1)`,
      [market],
    ),
    jd<{ id: string; is_active: boolean }>(`SELECT source_id AS id, is_active FROM jobs WHERE source_id IS NOT NULL`),
    jd<{ at: string | null }>(`SELECT last_jobs_synced_at::text AS at FROM gtm_sync_state LIMIT 1`).then(r => (r.length ? r : [{ at: null }])),
  ]);
  const onJd = new Map(j.map(r => [r.id, r.is_active]));
  const keys: JdCoverageRow['key'][] = ['fresh', 'live', 'aging', 'stale'];
  const rows = new Map(keys.map(k => [k, { key: k, gtm: 0, jdActive: 0, jdInactive: 0, missing: 0 }]));
  let newest: string | null = null;
  for (const r of g) {
    const row = rows.get(r.b)!;
    row.gtm++;
    const active = onJd.get(r.id);
    if (active === undefined) row.missing++;
    else {
      if (active) row.jdActive++;
      else row.jdInactive++;
      if (!newest || r.first_seen > newest) newest = r.first_seen;
    }
  }
  return { rows: keys.map(k => rows.get(k)!), lastJobsSyncedAt: sync.at, newestSyncedFirstSeen: newest };
}

const coverageCached = cached('jd-coverage-v1', 'pipeline', coverage);
export function getJdCoverage(market: string | null) {
  return coverageCached(market);
}
