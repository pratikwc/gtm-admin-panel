import 'server-only';
import { jd } from '@/lib/db/jd';
import { cached } from '@/lib/cache';
import { roleBucket, UNCLASSIFIED } from '@/lib/buckets';
import { PAGE_SIZE, type Filters } from '@/lib/filters';
import type { Bucket, Kpi, TrendPoint } from './types';

/** Applicants are mostly in the Gulf, so time-of-day is shown in Gulf time. */
export const APPLICATION_TZ = 'Asia/Dubai';

export interface ApplicationsSummary {
  kpis: { submissions: Kpi; today: Kpi; resumeRate: Kpi; unique: Kpi; repeat: Kpi; allTime: Kpi };
  trend: TrendPoint[];
  trendGrain: 'day' | 'week';
  roles: Bucket[];
  rawPreferences: Bucket[];
  /** 7 x 24 matrix, [weekday 0=Mon][hour] in Gulf time. */
  heatmap: number[][];
  latestAt: string | null;
}

interface AppAggRow {
  job_preference: string | null;
  has_resume: boolean;
  email_key: string | null;
  t: string;
  dow: number;
  hour: number;
  in_period: boolean;
  in_prev: boolean;
  today: boolean;
  repeat_email: boolean;
}

async function summary(fromIso: string | null, prevIso: string | null, days: number | null): Promise<ApplicationsSummary> {
  const grain: 'day' | 'week' = days && days <= 90 ? 'day' : 'week';
  // Small table (hundreds of rows): pull the light columns once and aggregate here,
  // because role bucketing of free text is easier and better tested in TypeScript.
  const rows = await jd<AppAggRow>(
    `WITH base AS (
       SELECT ci.*, lower(btrim(ci.email)) AS email_key,
              count(*) OVER (PARTITION BY lower(btrim(ci.email))) AS email_n
         FROM chat_interactions ci)
     SELECT job_preference,
            (coalesce(resume_url, resume_file_name) IS NOT NULL) AS has_resume,
            email_key,
            date_trunc('${grain}', created_at AT TIME ZONE '${APPLICATION_TZ}')::date::text AS t,
            (extract(isodow FROM created_at AT TIME ZONE '${APPLICATION_TZ}')::int - 1) AS dow,
            extract(hour FROM created_at AT TIME ZONE '${APPLICATION_TZ}')::int AS hour,
            ($1::timestamptz IS NULL OR created_at >= $1::timestamptz) AS in_period,
            ($2::timestamptz IS NOT NULL AND created_at >= $2::timestamptz AND created_at < $1::timestamptz) AS in_prev,
            ((created_at AT TIME ZONE '${APPLICATION_TZ}')::date = (now() AT TIME ZONE '${APPLICATION_TZ}')::date) AS today,
            (email_n > 1) AS repeat_email
       FROM base`,
    [fromIso, prevIso],
  );
  const [{ latest }] = await jd<{ latest: string | null }>(`SELECT max(created_at)::text AS latest FROM chat_interactions`);

  const period = rows.filter(r => r.in_period);
  const prev = rows.filter(r => r.in_prev);
  const uniq = (rs: AppAggRow[]) => new Set(rs.map(r => r.email_key).filter(Boolean)).size;
  const rate = (rs: AppAggRow[]) => (rs.length ? rs.filter(r => r.has_resume).length / rs.length : null);

  const count = (values: string[]) => {
    const m = new Map<string, number>();
    for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
    return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  };

  const trendMap = new Map<string, number>();
  for (const r of period) trendMap.set(r.t, (trendMap.get(r.t) ?? 0) + 1);

  const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
  for (const r of period) heatmap[r.dow][r.hour] += 1;

  return {
    kpis: {
      submissions: { value: period.length, previous: days ? prev.length : null, hint: 'form submissions in the period' },
      today: { value: rows.filter(r => r.today).length, hint: 'so far today (Gulf time)' },
      resumeRate: { value: rate(period), previous: days ? rate(prev) : null, format: 'percent', hint: 'submissions with a resume attached' },
      unique: { value: uniq(period), previous: days ? uniq(prev) : null, hint: 'distinct email addresses' },
      repeat: { value: uniq(period.filter(r => r.repeat_email)), hint: 'people who submitted more than once (all time)' },
      allTime: { value: rows.length, hint: 'every submission since launch' },
    },
    trend: [...trendMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([t, value]) => ({ t, value })),
    trendGrain: grain,
    roles: count(period.map(r => roleBucket(r.job_preference))).slice(0, 14),
    rawPreferences: count(
      period.map(r => (r.job_preference ?? '').toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim()).map(v => v || UNCLASSIFIED),
    ).slice(0, 12),
    heatmap,
    latestAt: latest,
  };
}

const summaryCached = cached('applications-summary-v2', 'applications', summary);
export function getApplicationsSummary(f: Filters) {
  return summaryCached(f.from?.toISOString() ?? null, f.prevFrom?.toISOString() ?? null, f.days);
}

export interface ApplicationRow {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  job_preference: string | null;
  role: string;
  has_resume: boolean;
  created_at: string;
}

/**
 * Applicant list. Not cached on purpose: it is personal data and should not
 * sit in the shared data cache. The table is small, so this stays fast.
 */
async function listApplications(f: Filters): Promise<ApplicationRow[]> {
  const rows = await jd<Omit<ApplicationRow, 'role'>>(
    `SELECT id::text, name, email, phone, job_preference,
            (coalesce(resume_url, resume_file_name) IS NOT NULL) AS has_resume, created_at::text
       FROM chat_interactions
      WHERE ($1::timestamptz IS NULL OR created_at >= $1::timestamptz)
        AND ($2::text = '' OR name ILIKE '%' || $2 || '%' OR email ILIKE '%' || $2 || '%' OR job_preference ILIKE '%' || $2 || '%')
      ORDER BY created_at DESC`,
    [f.from?.toISOString() ?? null, f.q],
  );
  const withRole = rows.map(r => ({ ...r, role: roleBucket(r.job_preference) }));
  return f.status ? withRole.filter(r => r.role === f.status) : withRole;
}

export async function getApplications(f: Filters): Promise<{ rows: ApplicationRow[]; total: number }> {
  const filtered = await listApplications(f);
  const start = (f.page - 1) * PAGE_SIZE;
  return { rows: filtered.slice(start, start + PAGE_SIZE), total: filtered.length };
}

export async function getApplicationResumePath(id: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await jd<{ path: string | null }>(
    // resume_url holds the object path inside the private `resumes` bucket.
    `SELECT resume_url AS path FROM chat_interactions WHERE id = $1::uuid`,
    [id],
  );
  return row?.path ?? null;
}


/** Full filtered applicant list for CSV export. */
export async function exportApplications(f: Filters) {
  const rows = await listApplications(f);
  return rows.map(({ id, name, email, phone, job_preference, role, has_resume, created_at }) => ({
    id, name, email, phone, role_looking_for: job_preference, role_bucket: role, has_resume, submitted_at: created_at,
  }));
}
