import { ExternalLink } from 'lucide-react';
import { parseFilters, PAGE_SIZE, type SearchParams } from '@/lib/filters';
import { fmtAgo, fmtDate, fmtInt, fmtPct } from '@/lib/format';
import { hrefWith } from '@/lib/url';
import { env } from '@/lib/env';
import { freshness } from '@/lib/health';
import { getPublishedJob, getPublishedJobs, getPublishedSummary, PUBLISHED_STATUS } from '@/lib/queries/published';
import { getPipelineSnapshot } from '@/lib/queries/pipeline';
import { KpiRow, KpiTile } from '@/components/kpi/kpi';
import { Panel, SectionHeader } from '@/components/charts/panel';
import { BarList } from '@/components/charts/bar-list';
import { SegmentBar } from '@/components/charts/segment-bar';
import { SplitTable } from '@/components/charts/split-table';
import { TrendChart } from '@/components/charts/trend-chart';
import { StatusChip, type ChipTone } from '@/components/charts/status-chip';
import { Banner, FreshnessChip } from '@/components/shell/freshness';
import { DataAsOf } from '@/components/shell/data-as-of';
import { JdApiBanner } from '@/components/shell/api-banner';
import { ExportButton, FilterPills, Pager, RowLink, SearchBox } from '@/components/table/table-controls';
import { DetailGrid, DetailSheet } from '@/components/table/detail-sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const dynamic = 'force-dynamic';

const PATH = '/published';
const STATUS_COLOR: Record<string, string> = {
  active_fresh: 'var(--status-good)',
  active_stale: 'var(--status-serious)',
  expired: 'var(--status-neutral)',
  demo: 'var(--viz-track)',
};
const PUBLISHED_TONE: Record<string, ChipTone> = { active_fresh: 'good', active_stale: 'serious', expired: 'neutral', demo: 'neutral' };
const PUBLISHED_LABEL = Object.fromEntries(PUBLISHED_STATUS.map(s => [s.key, s.label]));

export default async function PublishedPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const f = parseFilters(sp);
  const jobId = typeof sp.job === 'string' ? sp.job : null;
  const site = env.jdSiteUrl();

  const [{ data: s, fetchedAt }, { data: table }, { data: pipe }, detail] = await Promise.all([
    getPublishedSummary(f),
    getPublishedJobs(f),
    getPipelineSnapshot(f.from?.toISOString() ?? null),
    jobId ? getPublishedJob(jobId) : Promise.resolve(null),
  ]);

  const staleShare = s.kpis.active.value ? (s.kpis.stale.value ?? 0) / s.kpis.active.value : 0;
  const syncAt = s.sync.latestJobUpdate ?? s.sync.lastJobsSyncedAt;

  return (
    <>
      <SectionHeader
        title="JD Jobs Published"
        description="Jobs listed on Jobs Duniya. They are copied from the outbound database by a daily sync and stay active until GTM hasn't seen them for 60 days."
      >
        <div className="flex flex-col items-end gap-1.5">
          <FreshnessChip label="Last JD sync" at={syncAt} />
          <DataAsOf at={fetchedAt} />
        </div>
      </SectionHeader>

      <JdApiBanner />

      {staleShare > 0.25 && (
        <Banner tone={freshness(syncAt) === 'bad' ? 'bad' : 'warn'} title={`${fmtInt(s.kpis.stale.value)} jobs shown as active are older than 60 days (${fmtPct(staleShare)})`}>
          The Jobs Duniya sync last wrote a job {fmtAgo(syncAt)} ({fmtDate(syncAt)}). Until it runs again the site keeps listing these
          jobs, and when it does run, its 60-day sweep will deactivate most of them at once.
        </Banner>
      )}

      <KpiRow>
        <KpiTile label="Active on site" kpi={s.kpis.active} />
        <KpiTile label="Active · fresh" kpi={s.kpis.fresh} tone={staleShare > 0.5 ? 'bad' : 'default'} />
        <KpiTile label="Active · outdated" kpi={s.kpis.stale} invert tone={staleShare > 0.25 ? 'warn' : 'default'} />
        <KpiTile label="Inactive" kpi={s.kpis.expired} />
        <KpiTile label="Hiring companies" kpi={s.kpis.companies} />
        <KpiTile label="New in period" kpi={s.kpis.newInPeriod} />
      </KpiRow>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Panel
          className="xl:col-span-3"
          title="Listing status"
          scope={f.from ? 'Now' : null}
          description="Stored flag combined with the posting date. Click a status to filter the table."
        >
          <SegmentBar
            segments={s.status.map(b => ({
              key: b.key!,
              label: b.label,
              value: b.value,
              color: STATUS_COLOR[b.key!],
              hint: PUBLISHED_STATUS.find(x => x.key === b.key)?.hint,
              href: hrefWith(PATH, sp, { status: f.status === b.key ? null : b.key! }) + '#table',
              active: f.status === b.key,
            }))}
          />
        </Panel>
        <Panel className="xl:col-span-2" title="GTM ↔ JD reconciliation" scope={f.from ? "Now" : null} description="The two databases compared job by job, today.">
          <ul className="divide-y text-sm">
            <ReconRow
              label="Live in GTM, not active on JD"
              value={pipe.drift.gtmLiveMissingInJd}
              note={`of ${fmtInt(pipe.drift.gtmLive)} jobs GTM saw in the last 60 days`}
              tone={pipe.drift.gtmLiveMissingInJd > 0 ? 'warn' : 'good'}
            />
            <ReconRow
              label="Active on JD, stale in GTM"
              value={pipe.drift.jdActiveGtmStale}
              note={`of ${fmtInt(pipe.drift.jdActiveTotal)} active JD jobs — GTM hasn't seen them for 60+ days`}
              tone={pipe.drift.jdActiveGtmStale > 0 ? 'serious' : 'good'}
            />
            <ReconRow label="Active jobs with no company" value={s.kpis.noCompany.value ?? 0} note="shown on the site without a company page" tone="neutral" />
          </ul>
        </Panel>
      </div>

      <Panel
        className="mt-4"
        title="Active vs inactive by posting age"
        scope={f.from ? 'Now' : null}
        description="Every job synced from GTM, by how long ago it was posted. Active jobs are shown on the site; inactive ones are hidden. Jobs posted ≤ 60 days ago should be active, older ones inactive."
      >
        <SplitTable
          rowHeader="Posted"
          columns={[
            { key: 'active', label: 'Active (on site)', color: 'var(--status-good)' },
            { key: 'inactive', label: 'Inactive (hidden)', color: 'var(--status-neutral)' },
          ]}
          rows={s.age.map(a => ({ label: a.label, values: { active: a.active, inactive: a.inactive } }))}
        />
        <p className="mt-3 text-xs text-muted-foreground">Latest posting on the site: {fmtDate(s.sync.latestPosted)}.</p>
      </Panel>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Panel title="By country" description={`Live listings${f.from ? ' posted in the period' : ''}, by country parsed from the job location. Click to filter the page.`}>
          <BarList
            items={s.countries}
            mutedLabels={['Other', 'Unclassified']}
            hrefFor={b => (['Other', 'Unclassified'].includes(b.label) ? null : hrefWith(PATH, sp, { market: f.market === b.label ? null : b.label }))}
          />
        </Panel>
        <Panel title="By role" description="Same role buckets as the public landing pages. A job can match more than one.">
          <BarList items={s.roles} total={s.kpis.active.value ?? undefined} />
        </Panel>
        <Panel title="By industry" description="Industry of the hiring company.">
          <BarList items={s.industries} mutedLabels={['Unknown', 'Other']} />
        </Panel>
        <Panel title="Top hiring companies" description={f.from ? 'Most live listings posted in the period.' : 'Most live listings.'}>
          <BarList items={s.topCompanies} color="var(--series-1)" total={s.kpis.active.value ?? undefined} />
        </Panel>
        <Panel title="By job type">
          <BarList items={s.jobTypes} mutedLabels={['Not specified']} />
        </Panel>
      </div>

      <Panel className="mt-4" title="Jobs by posting date" description={`Synced jobs by the date the employer posted them, per ${s.trendGrain}.`}>
        <TrendChart data={s.trend} grain={s.trendGrain} from={f.from?.toISOString() ?? null} label="Jobs posted" height={220} />
      </Panel>

      <section id="table" className="mt-6 scroll-mt-24 rounded-2xl border bg-card">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <h2 className="font-display text-xl font-medium tracking-tight">Published jobs</h2>
          <SearchBox placeholder="Search title or company" />
          <div className="ml-auto"><ExportButton dataset="published-jobs" /></div>
        </div>
        <div className="border-b px-4 py-2.5">
          <FilterPills options={PUBLISHED_STATUS.map(x => ({ value: x.key, label: x.label }))} />
        </div>
        {table.rows.length ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Job</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Posted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-4 text-right">Site</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {table.rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="max-w-[360px] pl-4">
                      <RowLink id={r.id} className="line-clamp-1">{r.title}</RowLink>
                      <div className="truncate text-xs text-muted-foreground">{r.company_name ?? 'No company'} · {r.location ?? '—'}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{r.country}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{r.job_type ?? '—'}</TableCell>
                    <TableCell className="tabular whitespace-nowrap text-sm">{fmtDate(r.posted_date, 'd MMM yy')}</TableCell>
                    <TableCell><StatusChip tone={PUBLISHED_TONE[r.status]}>{PUBLISHED_LABEL[r.status]}</StatusChip></TableCell>
                    <TableCell className="pr-4 text-right">
                      <a href={`${site}/jobs/${r.id}/`} target="_blank" rel="noreferrer" className="inline-flex text-muted-foreground hover:text-primary" aria-label={`Open ${r.title} on Jobs Duniya`}>
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">No jobs match these filters.</p>
        )}
        <Pager page={f.page} pageSize={PAGE_SIZE} total={table.total} />
      </section>

      {detail && (
        <DetailSheet title={detail.title} subtitle={`${detail.company_name ?? 'No company'} · ${detail.location ?? ''}`}>
          <div className="mb-5"><StatusChip tone={PUBLISHED_TONE[detail.status]}>{PUBLISHED_LABEL[detail.status]}</StatusChip></div>
          <DetailGrid
            items={[
              ['Country', detail.country],
              ['Job type', detail.job_type],
              ['Salary', detail.salary_text],
              ['Posted', fmtDate(detail.posted_date)],
              ['Synced to JD', fmtDate(detail.created_at, 'd MMM yyyy, HH:mm')],
              ['Last updated', `${fmtDate(detail.updated_at, 'd MMM yyyy, HH:mm')} (${fmtAgo(detail.updated_at)})`],
              ['Active flag', detail.is_active ? 'Yes' : 'No'],
              ['Company industry', detail.company_industry],
              ['GTM job id', detail.source_id ? <code key="s" className="text-xs">{detail.source_id}</code> : 'Demo row'],
            ]}
          />
          <div className="mt-5 flex flex-wrap gap-4 text-sm font-medium">
            <a href={`${site}/jobs/${detail.id}/`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:underline">
              View on Jobs Duniya <ExternalLink className="h-3.5 w-3.5" />
            </a>
            {detail.application_redirect_url && (
              <a href={detail.application_redirect_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:underline">
                Original posting <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            {detail.source_id && (
              <a href={`/outbound?job=${detail.source_id}`} className="inline-flex items-center gap-1.5 text-primary hover:underline">
                Open in Outbound
              </a>
            )}
          </div>
          {detail.description && (
            <div className="mt-6">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</div>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{detail.description}…</p>
            </div>
          )}
        </DetailSheet>
      )}
    </>
  );
}

function ReconRow({ label, value, note, tone }: { label: string; value: number; note: string; tone: ChipTone }) {
  return (
    <li className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="font-medium">{label}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{note}</div>
      </div>
      <StatusChip tone={tone} className="tabular text-sm">{fmtInt(value)}</StatusChip>
    </li>
  );
}
