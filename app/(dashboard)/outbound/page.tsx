import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { parseFilters, PAGE_SIZE, type SearchParams } from '@/lib/filters';
import { fmtAgo, fmtDate, fmtInt } from '@/lib/format';
import { hrefWith } from '@/lib/url';
import { freshness } from '@/lib/health';
import { UNCLASSIFIED } from '@/lib/buckets';
import {
  getOutboundCompanies, getOutboundJob, getOutboundJobs, getOutboundSummary, OUTBOUND_STAGE_LABEL, OUTBOUND_STATUS,
} from '@/lib/queries/outbound';
import { KpiRow, KpiTile } from '@/components/kpi/kpi';
import { Panel, SectionHeader } from '@/components/charts/panel';
import { BarList } from '@/components/charts/bar-list';
import { SegmentBar } from '@/components/charts/segment-bar';
import { SplitTable } from '@/components/charts/split-table';
import { getJdCoverage } from '@/lib/queries/pipeline';
import { TrendChart } from '@/components/charts/trend-chart';
import { StatusChip, type ChipTone } from '@/components/charts/status-chip';
import { Banner, FreshnessChip } from '@/components/shell/freshness';
import { DataAsOf } from '@/components/shell/data-as-of';
import { ExportButton, FilterPills, Pager, RowLink, SearchBox } from '@/components/table/table-controls';
import { DetailGrid, DetailSheet } from '@/components/table/detail-sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const dynamic = 'force-dynamic';

const PATH = '/outbound';
const STATUS_COLOR: Record<string, string> = { fresh: 'var(--ord-5)', live: 'var(--ord-4)', aging: 'var(--ord-2)', stale: 'var(--ord-1)' };
const STATUS_TONE: Record<string, ChipTone> = { fresh: 'good', live: 'info', aging: 'warn', stale: 'neutral' };
const STATUS_LABEL = Object.fromEntries(OUTBOUND_STATUS.map(s => [s.key, s.label]));

export default async function OutboundPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const f = parseFilters(sp);
  const tab = f.tab === 'companies' ? 'companies' : 'jobs';
  const jobId = typeof sp.job === 'string' ? sp.job : null;

  const [{ data: s, fetchedAt }, { data: cov }, table, detail] = await Promise.all([
    getOutboundSummary(f),
    getJdCoverage(f.market),
    tab === 'jobs' ? getOutboundJobs(f).then(r => r.data) : getOutboundCompanies(f).then(r => r.data),
    jobId ? getOutboundJob(jobId) : Promise.resolve(null),
  ]);
  const scanHealth = freshness(s.lastScan.startedAt);
  const recent = cov.rows.filter(r => r.key !== 'stale');
  const recentTotal = recent.reduce((a, r) => a + r.gtm, 0);
  const recentMissing = recent.reduce((a, r) => a + r.missing, 0);

  return (
    <>
      <SectionHeader
        title="Outbound Jobs Collection"
        description="LinkedIn jobs we scrape for the companies in our database. These jobs drive outbound email and are copied into Jobs Duniya."
      >
        <div className="flex flex-col items-end gap-1.5">
          <FreshnessChip label="Last scan" at={s.lastScan.startedAt} />
          <DataAsOf at={fetchedAt} />
        </div>
      </SectionHeader>

      {scanHealth === 'bad' && (
        <Banner title={`Job scans haven't run since ${fmtDate(s.lastScan.startedAt, 'd MMM')} (${fmtAgo(s.lastScan.startedAt)})`}>
          The location and company scans are switched off. No new jobs are coming in, and the &ldquo;live&rdquo; count will keep
          falling until scans resume.
        </Banner>
      )}

      <KpiRow>
        <KpiTile label="Total jobs" kpi={s.kpis.total} />
        <KpiTile label="Live jobs" kpi={s.kpis.live} />
        <KpiTile label="New in period" kpi={s.kpis.newInPeriod} />
        <KpiTile label="Match rate" kpi={s.kpis.matchRate} />
        <KpiTile label="Companies hiring" kpi={s.kpis.companiesLive} />
        <KpiTile
          label="Scan runs"
          kpi={{ value: s.runs.length, hint: 'most recent runs recorded in job_scan_runs' }}
          tone={scanHealth === 'bad' ? 'bad' : scanHealth === 'warn' ? 'warn' : 'default'}
          footer={`Last: ${s.lastScan.scan ?? '—'} · ${fmtAgo(s.lastScan.startedAt)}`}
        />
      </KpiRow>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Panel
          className="xl:col-span-3"
          title="Job status"
          scope={f.from ? 'Now' : null}
          description="Based on when the scraper last saw the job on LinkedIn. Click a bucket to filter the table."
        >
          <SegmentBar
            segments={s.status.map(b => ({
              key: b.key!,
              label: b.label,
              value: b.value,
              color: STATUS_COLOR[b.key!],
              hint: OUTBOUND_STATUS.find(x => x.key === b.key)?.hint,
              href: hrefWith(PATH, sp, { status: f.status === b.key ? null : b.key!, tab: null }) + '#table',
              active: f.status === b.key,
            }))}
          />
        </Panel>
        <Panel className="xl:col-span-2" title="New jobs found" description={`First seen by the scraper, per ${s.trendGrain}.`}>
          <TrendChart data={s.trend} grain={s.trendGrain} from={f.from?.toISOString() ?? null} label="New jobs" height={190} />
        </Panel>
      </div>

      <Panel
        className="mt-4"
        title="Is it on Jobs Duniya?"
        scope={f.from ? 'Now' : null}
        description="Every GTM job by when the scraper last saw it, against its state on Jobs Duniya. JD's rule: a job is active while GTM saw it in the last 60 days, so Fresh, Live and Aging should be active and Stale should be inactive."
      >
        {recentMissing > 0 && (
          <div className="mb-4 rounded-lg border border-[var(--status-warning)]/40 bg-[var(--status-warning)]/10 px-3 py-2 text-sm">
            <span className="font-medium">{fmtInt(recentMissing)} of {fmtInt(recentTotal)} jobs seen in the last 60 days aren&rsquo;t on Jobs Duniya.</span>{' '}
            <span className="text-muted-foreground">
              The JD sync has only copied jobs seen up to {fmtDate(cov.lastJobsSyncedAt)}; the newest synced job was first seen{' '}
              {fmtDate(cov.newestSyncedFirstSeen)}. Scans after that haven&rsquo;t reached the site.
            </span>
          </div>
        )}
        <SplitTable
          rowHeader="Last seen by scraper"
          columns={[
            { key: 'jdActive', label: 'Active on JD', color: 'var(--status-good)' },
            { key: 'jdInactive', label: 'Inactive on JD', color: 'var(--status-neutral)' },
            { key: 'missing', label: 'Not on JD', color: 'var(--status-warning)' },
          ]}
          rows={cov.rows.map(r => ({
            label: STATUS_LABEL[r.key],
            hint: OUTBOUND_STATUS.find(x => x.key === r.key)?.hint,
            values: { jdActive: r.jdActive, jdInactive: r.jdInactive, missing: r.missing },
          }))}
        />
      </Panel>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Panel title="By market" description={`${f.from ? 'Jobs seen in the period, by the' : 'The'} country the scan targeted. Click to filter the whole page.`}>
          <BarList items={s.markets} hrefFor={b => hrefWith(PATH, sp, { market: f.market === b.label ? null : b.label })} />
        </Panel>
        <Panel title="By job function" description="LinkedIn functions grouped into broad buckets.">
          <BarList items={s.functions} mutedLabels={[UNCLASSIFIED, 'Other']} />
        </Panel>
        <Panel title="By seniority" description="LinkedIn experience level.">
          <BarList items={s.seniority} mutedLabels={['Not Applicable']} />
        </Panel>
        <Panel title="By industry" description="Whitecarrot industry bucket of the hiring company.">
          <BarList items={s.industries} mutedLabels={['Unknown', 'Other']} />
        </Panel>
        <Panel title="Hiring companies by outbound stage" description={`Companies with a job seen ${f.from ? 'in the period' : 'in the last 30 days'}, by how far our outreach has got.`}>
          <BarList items={s.outboundStages} color="var(--series-1)" mutedLabels={['Not researched']} />
        </Panel>
        <Panel title="Recent scan runs" scope={f.market ? 'All markets' : null} description={`Jobs returned per run (new / re-seen / unmatched)${f.from ? ', in the period' : ''}.`} bodyClassName="px-0 pb-2">
          <ScanRuns runs={s.runs} />
        </Panel>
      </div>

      <section id="table" className="mt-6 scroll-mt-24 rounded-2xl border bg-card">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <div className="flex rounded-lg bg-muted p-1 text-sm">
            {(['jobs', 'companies'] as const).map(t => (
              <Link
                key={t}
                href={hrefWith(PATH, sp, { tab: t === 'jobs' ? null : t, status: null, q: null })}
                scroll={false}
                className={`rounded-md px-3 py-1 font-medium ${tab === t ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {t === 'jobs' ? 'Jobs' : 'Companies'}
              </Link>
            ))}
          </div>
          <SearchBox placeholder={tab === 'jobs' ? 'Search title or company' : 'Search company'} />
          <div className="ml-auto">
            <ExportButton dataset={tab === 'jobs' ? 'outbound-jobs' : 'outbound-companies'} />
          </div>
        </div>
        {tab === 'jobs' && (
          <div className="border-b px-4 py-2.5">
            <FilterPills options={OUTBOUND_STATUS.map(x => ({ value: x.key, label: x.label }))} />
          </div>
        )}
        {tab === 'jobs' ? <JobsTable data={table as Awaited<ReturnType<typeof getOutboundJobs>>['data']} /> : (
          <CompaniesTable data={table as Awaited<ReturnType<typeof getOutboundCompanies>>['data']} />
        )}
        <Pager page={f.page} pageSize={PAGE_SIZE} total={table.total} />
      </section>

      {detail && (
        <DetailSheet title={detail.job_title} subtitle={`${detail.company_name ?? 'Unknown company'} · ${detail.job_location ?? detail.scan_market ?? ''}`}>
          <div className="mb-5 flex flex-wrap gap-2">
            <StatusChip tone={STATUS_TONE[detail.status]}>{STATUS_LABEL[detail.status]}</StatusChip>
            {detail.company_outbound_status && (
              <StatusChip tone="info">{OUTBOUND_STAGE_LABEL[detail.company_outbound_status] ?? detail.company_outbound_status}</StatusChip>
            )}
          </div>
          <DetailGrid
            items={[
              ['Market', detail.scan_market],
              ['Function', detail.fn],
              ['Seniority', detail.experience_level],
              ['Contract / work type', [detail.contract_type, detail.work_type].filter(Boolean).join(' · ') || null],
              ['Salary', detail.salary],
              ['Posted', fmtDate(detail.posted_date)],
              ['First seen', fmtDate(detail.first_seen, 'd MMM yyyy, HH:mm')],
              ['Last seen', `${fmtDate(detail.last_seen, 'd MMM yyyy, HH:mm')} (${fmtAgo(detail.last_seen)})`],
              ['Times seen', fmtInt(detail.times_seen)],
              ['Applicants (LinkedIn)', detail.applications_count],
              ['Apply type', detail.apply_type],
              ['Found by', detail.source_scan],
              ['Company match', detail.match_method],
              ['Company industry', detail.company_industry],
              ['Company size', detail.company_employees ? `${fmtInt(detail.company_employees)} employees` : null],
              ['Recruiter', detail.recruiter_name],
              ['GTM job id', <code key="id" className="text-xs">{detail.job_id}</code>],
            ]}
          />
          {detail.linkedin_job_url && (
            <a href={detail.linkedin_job_url} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              Open on LinkedIn <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
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

function ScanRuns({ runs }: { runs: Awaited<ReturnType<typeof getOutboundSummary>>['data']['runs'] }) {
  if (!runs.length) return <p className="px-5 text-sm text-muted-foreground">No runs recorded.</p>;
  return (
    <div className="max-h-[320px] overflow-y-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-5">Run</TableHead>
            <TableHead className="text-right">New</TableHead>
            <TableHead className="text-right">Re-seen</TableHead>
            <TableHead className="pr-5 text-right">Unmatched</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.slice(0, 10).map(r => (
            <TableRow key={r.run_id}>
              <TableCell className="py-2 pl-5">
                <div className="text-[13px] font-medium">{fmtDate(r.started_at, 'd MMM, HH:mm')}</div>
                <div className="text-[11px] capitalize text-muted-foreground">{r.scan} scan</div>
              </TableCell>
              <TableCell className="tabular py-2 text-right">{fmtInt(r.jobs_new)}</TableCell>
              <TableCell className="tabular py-2 text-right">{fmtInt(r.jobs_reseen)}</TableCell>
              <TableCell className="tabular py-2 pr-5 text-right text-muted-foreground">{fmtInt(r.unmatched)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function JobsTable({ data }: { data: Awaited<ReturnType<typeof getOutboundJobs>>['data'] }) {
  if (!data.rows.length) return <p className="px-4 py-10 text-center text-sm text-muted-foreground">No jobs match these filters.</p>;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Job</TableHead>
            <TableHead>Market</TableHead>
            <TableHead>Function</TableHead>
            <TableHead>Seniority</TableHead>
            <TableHead>Posted</TableHead>
            <TableHead>Last seen</TableHead>
            <TableHead className="pr-4">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rows.map(r => (
            <TableRow key={r.job_id}>
              <TableCell className="max-w-[340px] pl-4">
                <RowLink id={r.job_id} className="line-clamp-1">{r.job_title}</RowLink>
                <div className="truncate text-xs text-muted-foreground">{r.company_name ?? 'Unknown company'}{!r.company_hs_id && ' · unmatched'}</div>
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm">{r.scan_market ?? '—'}</TableCell>
              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{r.fn}</TableCell>
              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{r.experience_level ?? '—'}</TableCell>
              <TableCell className="tabular whitespace-nowrap text-sm">{fmtDate(r.posted_date, 'd MMM yy')}</TableCell>
              <TableCell className="tabular whitespace-nowrap text-sm">{fmtAgo(r.last_seen)}</TableCell>
              <TableCell className="pr-4"><StatusChip tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusChip></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function CompaniesTable({ data }: { data: Awaited<ReturnType<typeof getOutboundCompanies>>['data'] }) {
  if (!data.rows.length) return <p className="px-4 py-10 text-center text-sm text-muted-foreground">No companies match these filters.</p>;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Company</TableHead>
            <TableHead>Industry</TableHead>
            <TableHead className="text-right">Live jobs (30d)</TableHead>
            <TableHead className="text-right">Jobs seen</TableHead>
            <TableHead>Latest job</TableHead>
            <TableHead className="pr-4">Outbound stage</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rows.map(r => (
            <TableRow key={r.company_hs_id}>
              <TableCell className="max-w-[260px] pl-4">
                <div className="truncate font-medium">{r.company_name ?? r.company_hs_id}</div>
                <div className="truncate text-xs text-muted-foreground">{r.country ?? '—'}</div>
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{r.industry ?? '—'}</TableCell>
              <TableCell className="tabular text-right font-medium">{fmtInt(r.live_jobs_30d)}</TableCell>
              <TableCell className="tabular text-right text-muted-foreground">{fmtInt(r.total_jobs_seen)}</TableCell>
              <TableCell className="max-w-[260px]">
                <div className="truncate text-sm">{r.latest_job_title ?? '—'}</div>
                <div className="text-xs text-muted-foreground">{fmtAgo(r.last_job_seen)}</div>
              </TableCell>
              <TableCell className="pr-4">
                <StatusChip tone={r.outbound_status === 'replied' ? 'good' : r.outbound_status === 'bounced' ? 'bad' : r.outbound_status && r.outbound_status !== 'not_researched' ? 'info' : 'neutral'}>
                  {OUTBOUND_STAGE_LABEL[r.outbound_status ?? 'not_researched'] ?? r.outbound_status}
                </StatusChip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
