import 'server-only';
import { jd } from '@/lib/db/jd';
import { cached } from '@/lib/cache';
import { countryCaseSql } from '@/lib/buckets';
import { ROLES } from '@/lib/roles';
import { PAGE_SIZE, type Filters } from '@/lib/filters';
import type { Bucket, Kpi, TrendPoint } from './types';

/**
 * Effective status of a Jobs Duniya job. The stored `is_active` flag only
 * changes when the sync cron runs, so we also look at the dates: a job that
 * is flagged active but was posted 60+ days ago is "Active · outdated".
 */
export const PUBLISHED_STATUS = [
  { key: 'active_fresh', label: 'Active · fresh', hint: 'shown on the site and posted in the last 60 days' },
  { key: 'active_stale', label: 'Active · outdated', hint: 'still shown on the site (GTM saw it in the last 60 days), but posted 60+ days ago' },
  { key: 'expired', label: 'Inactive', hint: 'hidden from the site (expired by the sync sweep)' },
  { key: 'demo', label: 'Demo', hint: 'hand-seeded demo rows (no GTM source)' },
] as const;

const STATUS_SQL = `(CASE
  WHEN j.source_id IS NULL THEN 'demo'
  WHEN NOT j.is_active THEN 'expired'
  WHEN j.posted_date > current_date - 60 THEN 'active_fresh'
  ELSE 'active_stale' END)`;

const COUNTRY_SQL = countryCaseSql('j.location');
const MARKET_WHERE = `($1::text IS NULL OR ${COUNTRY_SQL} = $1)`;
const REAL_ACTIVE = `j.is_active AND j.source_id IS NOT NULL`;

export interface PublishedSummary {
  kpis: {
    active: Kpi;
    fresh: Kpi;
    stale: Kpi;
    expired: Kpi;
    companies: Kpi;
    noCompany: Kpi;
    newInPeriod: Kpi;
  };
  sync: { lastJobsSyncedAt: string | null; lastCompaniesSyncedAt: string | null; latestJobUpdate: string | null; latestPosted: string | null };
  status: Bucket[];
  age: { label: string; active: number; inactive: number }[];
  countries: Bucket[];
  jobTypes: Bucket[];
  industries: Bucket[];
  topCompanies: Bucket[];
  roles: Bucket[];
  trend: TrendPoint[];
  trendGrain: 'day' | 'week';
}

async function summary(market: string | null, fromIso: string | null, prevIso: string | null, days: number | null): Promise<PublishedSummary> {
  const grain: 'day' | 'week' = days && days <= 90 ? 'day' : 'week';
  const p = [market];

  const group = (expr: string, where = 'TRUE', join = '', limit = 12) =>
    jd<{ label: string | null; value: number }>(
      `SELECT ${expr} AS label, count(*)::int AS value FROM jobs j ${join}
        WHERE ${MARKET_WHERE} AND ${where} GROUP BY 1 ORDER BY 2 DESC LIMIT ${limit}`,
      p,
    ).then(rows => rows.map(r => ({ label: r.label ?? 'Unknown', value: r.value })));

  const [[k], [sync], status, age, countries, jobTypes, industries, topCompanies, roles, trend] = await Promise.all([
    jd<{
      active: number; fresh: number; stale: number; expired: number; companies: number; no_company: number;
      new_period: number | null; new_prev: number | null; latest_update: string | null; latest_posted: string | null;
    }>(
      `SELECT count(*) FILTER (WHERE ${REAL_ACTIVE})::int AS active,
              count(*) FILTER (WHERE ${REAL_ACTIVE} AND j.posted_date > current_date - 60)::int AS fresh,
              count(*) FILTER (WHERE ${REAL_ACTIVE} AND NOT (j.posted_date > current_date - 60))::int AS stale,
              count(*) FILTER (WHERE NOT j.is_active AND j.source_id IS NOT NULL)::int AS expired,
              count(DISTINCT j.company_id) FILTER (WHERE ${REAL_ACTIVE})::int AS companies,
              count(*) FILTER (WHERE ${REAL_ACTIVE} AND j.company_id IS NULL)::int AS no_company,
              CASE WHEN $2::timestamptz IS NULL THEN NULL ELSE count(*) FILTER (WHERE j.source_id IS NOT NULL AND j.created_at >= $2::timestamptz)::int END AS new_period,
              CASE WHEN $3::timestamptz IS NULL THEN NULL ELSE count(*) FILTER (WHERE j.source_id IS NOT NULL AND j.created_at >= $3::timestamptz AND j.created_at < $2::timestamptz)::int END AS new_prev,
              max(j.updated_at) FILTER (WHERE j.source_id IS NOT NULL)::text AS latest_update,
              max(j.posted_date) FILTER (WHERE ${REAL_ACTIVE})::text AS latest_posted
         FROM jobs j WHERE ${MARKET_WHERE}`,
      [market, fromIso, prevIso],
    ),
    jd<{ last_jobs_synced_at: string | null; last_companies_synced_at: string | null }>(
      `SELECT last_jobs_synced_at::text, last_companies_synced_at::text FROM gtm_sync_state LIMIT 1`,
    ).then(r => (r.length ? r : [{ last_jobs_synced_at: null, last_companies_synced_at: null }])),
    group(STATUS_SQL, 'TRUE', '', 10),
    jd<{ label: string; active: number; inactive: number }>(
      `SELECT CASE WHEN j.posted_date > current_date - 7 THEN '< 7 days' WHEN j.posted_date > current_date - 30 THEN '7–30 days'
                   WHEN j.posted_date > current_date - 60 THEN '30–60 days' WHEN j.posted_date > current_date - 90 THEN '60–90 days' ELSE '90+ days' END AS label,
              count(*) FILTER (WHERE j.is_active)::int AS active,
              count(*) FILTER (WHERE NOT j.is_active)::int AS inactive
         FROM jobs j WHERE j.source_id IS NOT NULL AND ${MARKET_WHERE}
        GROUP BY 1`,
      [market],
    ),
    group(COUNTRY_SQL, REAL_ACTIVE, '', 12),
    group(`coalesce(nullif(j.job_type, ''), 'Not specified')`, REAL_ACTIVE, '', 8),
    group(`coalesce(c.industry, 'Unknown')`, REAL_ACTIVE, 'LEFT JOIN companies c ON c.id = j.company_id', 12),
    group(`c.name`, `${REAL_ACTIVE} AND j.company_id IS NOT NULL`, 'JOIN companies c ON c.id = j.company_id', 10),
    jd<{ label: string; value: number }>(
      `WITH r AS (
         SELECT x->>'label' AS label, websearch_to_tsquery('english', x->>'query') AS q
           FROM jsonb_array_elements($2::jsonb) x)
       SELECT r.label, count(*)::int AS value
         FROM r CROSS JOIN LATERAL (
           SELECT 1 FROM jobs j
            WHERE to_tsvector('english', j.title) @@ r.q AND ${REAL_ACTIVE} AND ${MARKET_WHERE}) m
        GROUP BY 1 ORDER BY 2 DESC LIMIT 15`,
      [market, JSON.stringify(ROLES.map(r => ({ label: r.label, query: r.query })))],
    ),
    jd<{ t: string; value: number }>(
      `SELECT date_trunc('${grain}', j.posted_date)::date::text AS t, count(*)::int AS value
         FROM jobs j
        WHERE ${MARKET_WHERE} AND j.source_id IS NOT NULL AND ($2::timestamptz IS NULL OR j.posted_date >= $2::date)
        GROUP BY 1 ORDER BY 1`,
      [market, fromIso],
    ),
  ]);

  const ageOrder = ['< 7 days', '7–30 days', '30–60 days', '60–90 days', '90+ days'];
  return {
    kpis: {
      active: { value: k.active, hint: 'is_active and synced from GTM — what the site shows' },
      fresh: { value: k.fresh, hint: 'active and posted in the last 60 days' },
      stale: { value: k.stale, hint: 'still shown on the site, but posted 60+ days ago' },
      expired: { value: k.expired, hint: 'hidden from the site by the 60-day sweep' },
      companies: { value: k.companies, hint: 'with at least one active job' },
      noCompany: { value: k.no_company, hint: 'active jobs with no company linked' },
      newInPeriod: { value: k.new_period, previous: k.new_prev, hint: 'first synced into JD in the period' },
    },
    sync: {
      lastJobsSyncedAt: sync.last_jobs_synced_at,
      lastCompaniesSyncedAt: sync.last_companies_synced_at,
      latestJobUpdate: k.latest_update,
      latestPosted: k.latest_posted,
    },
    status: PUBLISHED_STATUS.map(s => ({ key: s.key, label: s.label, value: status.find(x => x.label === s.key)?.value ?? 0 })),
    age: ageOrder.map(label => {
      const a = age.find(x => x.label === label);
      return { label, active: a?.active ?? 0, inactive: a?.inactive ?? 0 };
    }),
    countries,
    jobTypes,
    industries,
    topCompanies,
    roles,
    trend,
    trendGrain: grain,
  };
}

const summaryCached = cached('published-summary-v3', 'published', summary);
export function getPublishedSummary(f: Filters) {
  return summaryCached(f.market, f.from?.toISOString() ?? null, f.prevFrom?.toISOString() ?? null, f.days);
}

export interface PublishedJobRow {
  id: string;
  title: string;
  company_name: string | null;
  location: string | null;
  country: string;
  job_type: string | null;
  posted_date: string | null;
  created_at: string;
  status: string;
  source_id: string | null;
}

async function jobs(market: string | null, q: string, status: string | null, page: number) {
  const where = `${MARKET_WHERE}
    AND ($2::text = '' OR j.title ILIKE '%' || $2 || '%' OR c.name ILIKE '%' || $2 || '%')
    AND ($3::text IS NULL OR ${STATUS_SQL} = $3)`;
  const from = `FROM jobs j LEFT JOIN companies c ON c.id = j.company_id`;
  const params = [market, q, status];
  const [rows, [{ n }]] = await Promise.all([
    jd<PublishedJobRow>(
      `SELECT j.id::text, j.title, c.name AS company_name, j.location, ${COUNTRY_SQL} AS country, j.job_type,
              j.posted_date::text, j.created_at::text, ${STATUS_SQL} AS status, j.source_id
         ${from} WHERE ${where}
        ORDER BY j.posted_date DESC NULLS LAST, j.created_at DESC
        LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
      params,
    ),
    jd<{ n: number }>(`SELECT count(*)::int AS n ${from} WHERE ${where}`, params),
  ]);
  return { rows, total: n };
}

const jobsCached = cached('published-jobs-v1', 'published', jobs);
export function getPublishedJobs(f: Filters) {
  const status = PUBLISHED_STATUS.some(s => s.key === f.status) ? f.status : null;
  return jobsCached(f.market, f.q, status, f.page);
}

export interface PublishedJobDetail extends PublishedJobRow {
  salary_text: string | null;
  application_redirect_url: string | null;
  updated_at: string;
  is_active: boolean;
  company_industry: string | null;
  company_slug: string | null;
  description: string | null;
}

export async function getPublishedJob(id: string): Promise<PublishedJobDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await jd<PublishedJobDetail>(
    `SELECT j.id::text, j.title, c.name AS company_name, j.location, ${COUNTRY_SQL} AS country, j.job_type,
            j.posted_date::text, j.created_at::text, ${STATUS_SQL} AS status, j.source_id,
            j.salary_text, j.application_redirect_url, j.updated_at::text, j.is_active,
            c.industry AS company_industry, c.slug AS company_slug, left(j.description, 1500) AS description
       FROM jobs j LEFT JOIN companies c ON c.id = j.company_id WHERE j.id = $1::uuid`,
    [id],
  );
  return rows[0] ?? null;
}

/** Full filtered list for CSV export (no pagination). */
export async function exportPublishedJobs(f: Filters) {
  const status = PUBLISHED_STATUS.some(s => s.key === f.status) ? f.status : null;
  return jd(
    `SELECT j.id::text AS id, j.title, c.name AS company, j.location, ${COUNTRY_SQL} AS country, j.job_type,
            j.posted_date::text AS posted, j.created_at::text AS synced_at, j.updated_at::text, j.is_active,
            ${STATUS_SQL} AS status, j.source_id AS gtm_job_id, j.application_redirect_url
       FROM jobs j LEFT JOIN companies c ON c.id = j.company_id
      WHERE ${MARKET_WHERE}
        AND ($2::text = '' OR j.title ILIKE '%' || $2 || '%' OR c.name ILIKE '%' || $2 || '%')
        AND ($3::text IS NULL OR ${STATUS_SQL} = $3)
      ORDER BY j.posted_date DESC NULLS LAST LIMIT 50000`,
    [f.market, f.q, status],
  );
}
