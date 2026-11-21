import 'server-only';
import { gtm } from '@/lib/db/gtm';
import { cached } from '@/lib/cache';
import { functionCaseSql } from '@/lib/buckets';
import { PAGE_SIZE, type Filters } from '@/lib/filters';
import type { Bucket, Kpi, TrendPoint } from './types';

/** Age of a GTM job by last_seen. Lines up with JD's 60-day active rule. */
export const OUTBOUND_STATUS = [
  { key: 'fresh', label: 'Fresh', hint: 'seen in the last 7 days' },
  { key: 'live', label: 'Live', hint: 'seen 8–30 days ago' },
  { key: 'aging', label: 'Aging', hint: 'seen 31–60 days ago' },
  { key: 'stale', label: 'Stale', hint: 'not seen for 60+ days' },
] as const;

const STATUS_SQL = `(CASE
  WHEN j.last_seen > now() - interval '7 days' THEN 'fresh'
  WHEN j.last_seen > now() - interval '30 days' THEN 'live'
  WHEN j.last_seen > now() - interval '60 days' THEN 'aging'
  ELSE 'stale' END)`;

const FUNCTION_SQL = functionCaseSql('j.job_function');

/** $1 = market (nullable). */
const MARKET_WHERE = `($1::text IS NULL OR j.scan_market = $1)`;

export interface OutboundSummary {
  kpis: {
    total: Kpi;
    live: Kpi;
    newInPeriod: Kpi;
    matchRate: Kpi;
    companiesLive: Kpi;
  };
  lastScan: { startedAt: string | null; scan: string | null; runId: string | null };
  status: Bucket[];
  markets: Bucket[];
  functions: Bucket[];
  seniority: Bucket[];
  sources: Bucket[];
  industries: Bucket[];
  outboundStages: Bucket[];
  trend: TrendPoint[];
  trendGrain: 'day' | 'week';
  runs: ScanRun[];
}

export interface ScanRun {
  run_id: string;
  scan: string;
  started_at: string;
  jobs_returned: number | null;
  jobs_new: number | null;
  jobs_reseen: number | null;
  unmatched: number | null;
  apify_status: string | null;
}

async function summary(market: string | null, fromIso: string | null, prevIso: string | null, days: number | null): Promise<OutboundSummary> {
  const grain: 'day' | 'week' = days && days <= 90 ? 'day' : 'week';
  const p = [market];

  const [k] = await gtm<{
    total: number; live: number; live_prev: number; matched: number; companies_live: number;
    new_period: number | null; new_prev: number | null;
  }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE j.last_seen > now() - interval '30 days')::int AS live,
            count(*) FILTER (WHERE j.last_seen > now() - interval '60 days' AND j.last_seen <= now() - interval '30 days')::int AS live_prev,
            count(*) FILTER (WHERE j.company_hs_id IS NOT NULL)::int AS matched,
            count(DISTINCT j.company_hs_id) FILTER (WHERE j.last_seen > now() - interval '30 days')::int AS companies_live,
            CASE WHEN $2::timestamptz IS NULL THEN NULL ELSE count(*) FILTER (WHERE j.first_seen >= $2::timestamptz)::int END AS new_period,
            CASE WHEN $3::timestamptz IS NULL THEN NULL ELSE count(*) FILTER (WHERE j.first_seen >= $3::timestamptz AND j.first_seen < $2::timestamptz)::int END AS new_prev
       FROM jobs j WHERE ${MARKET_WHERE}`,
    [market, fromIso, prevIso],
  );

  const group = (expr: string, extraJoin = '', limit = 12) =>
    gtm<{ label: string | null; value: number }>(
      `SELECT ${expr} AS label, count(*)::int AS value
         FROM jobs j ${extraJoin}
        WHERE ${MARKET_WHERE}
        GROUP BY 1 ORDER BY 2 DESC LIMIT ${limit}`,
      p,
    ).then(rows => rows.map(r => ({ label: r.label ?? 'Unknown', value: r.value })));

  const [status, markets, functions, seniority, sources, industries, outboundStages, trend, runs, lastScan] = await Promise.all([
    group(STATUS_SQL, '', 10),
    group('j.scan_market', '', 10),
    group(FUNCTION_SQL, '', 16),
    group(`coalesce(nullif(j.experience_level, ''), 'Not Applicable')`, '', 10),
    group('j.source_scan', '', 5),
    group(`coalesce(c.wc_industry_bucket, 'Unknown')`, 'LEFT JOIN companies c ON c.company_hs_id = j.company_hs_id', 12),
    // Ties jobs to the sales funnel: what stage is the hiring company at?
    gtm<{ label: string; value: number }>(
      `WITH live AS (
         SELECT DISTINCT j.company_hs_id FROM jobs j
          WHERE ${MARKET_WHERE} AND j.company_hs_id IS NOT NULL AND j.last_seen > now() - interval '30 days')
       SELECT coalesce(s.outbound_status, 'not_researched') AS label, count(*)::int AS value
         FROM live l LEFT JOIN company_outbound_status s ON s.company_hs_id = l.company_hs_id
        GROUP BY 1 ORDER BY 2 DESC`,
      p,
    ),
    gtm<{ t: string; new_jobs: number }>(
      `SELECT date_trunc('${grain}', j.first_seen)::date::text AS t, count(*)::int AS new_jobs
         FROM jobs j
        WHERE ${MARKET_WHERE} AND ($2::timestamptz IS NULL OR j.first_seen >= $2::timestamptz)
        GROUP BY 1 ORDER BY 1`,
      [market, fromIso],
    ),
    gtm<ScanRun>(
      `SELECT run_id, scan, started_at::text, jobs_returned, jobs_new, jobs_reseen, unmatched, apify_status
         FROM job_scan_runs ORDER BY started_at DESC LIMIT 15`,
    ),
    gtm<{ started_at: string | null; scan: string | null; run_id: string | null }>(
      `SELECT started_at::text, scan, run_id FROM job_scan_runs ORDER BY started_at DESC LIMIT 1`,
    ),
  ]);

  const statusOrder = OUTBOUND_STATUS.map(s => s.key) as string[];
  return {
    kpis: {
      total: { value: k.total },
      live: { value: k.live, previous: k.live_prev, hint: 'seen in the last 30 days' },
      newInPeriod: { value: k.new_period, previous: k.new_prev, hint: 'first seen in the selected period' },
      matchRate: { value: k.total ? k.matched / k.total : null, format: 'percent', hint: `${k.matched.toLocaleString()} matched to a company` },
      companiesLive: { value: k.companies_live, hint: 'with a job seen in the last 30 days' },
    },
    lastScan: {
      startedAt: lastScan[0]?.started_at ?? null,
      scan: lastScan[0]?.scan ?? null,
      runId: lastScan[0]?.run_id ?? null,
    },
    status: statusOrder.map(key => ({
      label: OUTBOUND_STATUS.find(s => s.key === key)!.label,
      key,
      value: status.find(s => s.label === key)?.value ?? 0,
    })),
    markets,
    functions,
    seniority,
    sources,
    industries,
    outboundStages: outboundStages.map(s => ({ ...s, key: s.label, label: OUTBOUND_STAGE_LABEL[s.label] ?? s.label })),
    trend: trend.map(r => ({ t: r.t, value: r.new_jobs })),
    trendGrain: grain,
    runs,
  };
}

export const OUTBOUND_STAGE_LABEL: Record<string, string> = {
  not_researched: 'Not researched',
  company_research_done: 'Company researched',
  research_completed: 'Contacts researched',
  added_to_instantly_sequence: 'In Instantly sequence',
  opened: 'Opened',
  bounced: 'Bounced',
  unsubscribed: 'Unsubscribed',
  replied: 'Replied',
};

const summaryCached = cached('outbound-summary-v1', 'outbound', summary);

export function getOutboundSummary(f: Filters) {
  return summaryCached(f.market, f.from?.toISOString() ?? null, f.prevFrom?.toISOString() ?? null, f.days);
}

export interface OutboundJobRow {
  job_id: string;
  job_title: string;
  company_name: string | null;
  company_hs_id: string | null;
  scan_market: string | null;
  fn: string;
  experience_level: string | null;
  posted_date: string | null;
  first_seen: string;
  last_seen: string;
  status: string;
  linkedin_job_url: string | null;
}

async function jobs(market: string | null, q: string, status: string | null, page: number) {
  const where = `${MARKET_WHERE}
    AND ($2::text = '' OR j.job_title ILIKE '%' || $2 || '%' OR j.company_name ILIKE '%' || $2 || '%')
    AND ($3::text IS NULL OR ${STATUS_SQL} = $3)`;
  const params = [market, q, status];
  const [rows, [{ n }]] = await Promise.all([
    gtm<OutboundJobRow>(
      `SELECT j.job_id::text, j.job_title, j.company_name, j.company_hs_id, j.scan_market,
              ${FUNCTION_SQL} AS fn, j.experience_level, j.posted_date::text, j.first_seen::text, j.last_seen::text,
              ${STATUS_SQL} AS status, j.linkedin_job_url
         FROM jobs j WHERE ${where}
        ORDER BY j.last_seen DESC NULLS LAST, j.job_id DESC
        LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
      params,
    ),
    gtm<{ n: number }>(`SELECT count(*)::int AS n FROM jobs j WHERE ${where}`, params),
  ]);
  return { rows, total: n };
}

const jobsCached = cached('outbound-jobs-v1', 'outbound', jobs);
export function getOutboundJobs(f: Filters) {
  const status = OUTBOUND_STATUS.some(s => s.key === f.status) ? f.status : null;
  return jobsCached(f.market, f.q, status, f.page);
}

export interface OutboundCompanyRow {
  company_hs_id: string;
  company_name: string | null;
  country: string | null;
  industry: string | null;
  live_jobs_30d: number;
  total_jobs_seen: number;
  latest_job_title: string | null;
  last_job_seen: string | null;
  outbound_status: string | null;
}

async function companies(market: string | null, q: string, page: number) {
  const where = `($1::text IS NULL OR c.country = $1)
    AND ($2::text = '' OR s.company_name ILIKE '%' || $2 || '%')
    AND s.company_hs_id IS NOT NULL`;
  const from = `FROM jobs_company_summary s
    LEFT JOIN companies c ON c.company_hs_id = s.company_hs_id`;
  const params = [market, q];
  const [rows, [{ n }]] = await Promise.all([
    gtm<OutboundCompanyRow>(
      `SELECT s.company_hs_id, coalesce(c.name, s.company_name) AS company_name, c.country, c.wc_industry_bucket AS industry,
              s.live_jobs_30d::int, s.total_jobs_seen::int, s.latest_job_title, s.last_job_seen::text,
              (SELECT o.outbound_status FROM company_outbound_status o WHERE o.company_hs_id = s.company_hs_id) AS outbound_status
         ${from} WHERE ${where}
        ORDER BY s.live_jobs_30d DESC, s.total_jobs_seen DESC
        LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
      params,
    ),
    gtm<{ n: number }>(`SELECT count(*)::int AS n ${from} WHERE ${where}`, params),
  ]);
  return { rows, total: n };
}

const companiesCached = cached('outbound-companies-v1', 'outbound', companies);
export function getOutboundCompanies(f: Filters) {
  return companiesCached(f.market, f.q, f.page);
}

export interface OutboundJobDetail extends OutboundJobRow {
  job_location: string | null;
  contract_type: string | null;
  work_type: string | null;
  salary: string | null;
  apply_type: string | null;
  applications_count: string | null;
  times_seen: number | null;
  source_scan: string | null;
  match_method: string | null;
  recruiter_name: string | null;
  description: string | null;
  company_outbound_status: string | null;
  company_industry: string | null;
  company_employees: number | null;
}

export async function getOutboundJob(jobId: string): Promise<OutboundJobDetail | null> {
  if (!/^\d{1,20}$/.test(jobId)) return null;
  const rows = await gtm<OutboundJobDetail>(
    `SELECT j.job_id::text, j.job_title, j.company_name, j.company_hs_id, j.scan_market, ${FUNCTION_SQL} AS fn,
            j.experience_level, j.posted_date::text, j.first_seen::text, j.last_seen::text, ${STATUS_SQL} AS status,
            j.linkedin_job_url, j.job_location, j.contract_type, j.work_type, j.salary, j.apply_type,
            j.applications_count, j.times_seen, j.source_scan, j.match_method, j.recruiter_name,
            left(j.description, 1500) AS description,
            o.outbound_status AS company_outbound_status, c.wc_industry_bucket AS company_industry, c.employee_count AS company_employees
       FROM jobs j
       LEFT JOIN companies c ON c.company_hs_id = j.company_hs_id
       LEFT JOIN company_outbound_status o ON o.company_hs_id = j.company_hs_id
      WHERE j.job_id = $1::bigint`,
    [jobId],
  );
  return rows[0] ?? null;
}

const EXPORT_LIMIT = 50_000;

/** Full filtered list for CSV export (no pagination). */
export async function exportOutboundJobs(f: Filters) {
  const status = OUTBOUND_STATUS.some(s => s.key === f.status) ? f.status : null;
  return gtm(
    `SELECT j.job_id::text AS job_id, j.job_title AS title, j.company_name AS company, j.company_hs_id, j.scan_market AS market,
            ${FUNCTION_SQL} AS function_bucket, j.job_function AS linkedin_function, j.experience_level AS seniority,
            j.job_location AS location, j.posted_date::date::text AS posted, j.first_seen::text, j.last_seen::text,
            ${STATUS_SQL} AS status, j.source_scan, j.match_method, j.linkedin_job_url
       FROM jobs j
      WHERE ${MARKET_WHERE}
        AND ($2::text = '' OR j.job_title ILIKE '%' || $2 || '%' OR j.company_name ILIKE '%' || $2 || '%')
        AND ($3::text IS NULL OR ${STATUS_SQL} = $3)
      ORDER BY j.last_seen DESC NULLS LAST LIMIT ${EXPORT_LIMIT}`,
    [f.market, f.q, status],
  );
}

export async function exportOutboundCompanies(f: Filters) {
  return gtm(
    `SELECT s.company_hs_id, coalesce(c.name, s.company_name) AS company, c.country, c.wc_industry_bucket AS industry,
            s.live_jobs_30d, s.total_jobs_seen, s.latest_job_title, s.last_job_seen::text,
            (SELECT o.outbound_status FROM company_outbound_status o WHERE o.company_hs_id = s.company_hs_id) AS outbound_status
       FROM jobs_company_summary s LEFT JOIN companies c ON c.company_hs_id = s.company_hs_id
      WHERE ($1::text IS NULL OR c.country = $1) AND ($2::text = '' OR s.company_name ILIKE '%' || $2 || '%') AND s.company_hs_id IS NOT NULL
      ORDER BY s.live_jobs_30d DESC, s.total_jobs_seen DESC LIMIT ${EXPORT_LIMIT}`,
    [f.market, f.q],
  );
}
