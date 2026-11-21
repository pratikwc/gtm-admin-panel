import { FileText, Link2Off } from 'lucide-react';
import { parseFilters, PAGE_SIZE, type SearchParams } from '@/lib/filters';
import { DISPLAY_TZ_LABEL, fmtAgo, fmtDate } from '@/lib/format';
import { hrefWith } from '@/lib/url';
import { ROLE_RULES, UNCLASSIFIED, OTHER } from '@/lib/buckets';
import { APPLICATION_TZ, getApplications, getApplicationsSummary } from '@/lib/queries/applications';
import { KpiRow, KpiTile } from '@/components/kpi/kpi';
import { Panel, SectionHeader } from '@/components/charts/panel';
import { BarList } from '@/components/charts/bar-list';
import { TrendChart } from '@/components/charts/trend-chart';
import { Heatmap } from '@/components/charts/heatmap';
import { StatusChip } from '@/components/charts/status-chip';
import { FreshnessChip } from '@/components/shell/freshness';
import { DataAsOf } from '@/components/shell/data-as-of';
import { JdApiBanner } from '@/components/shell/api-banner';
import { ExportButton, FilterPills, Pager, SearchBox } from '@/components/table/table-controls';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const dynamic = 'force-dynamic';

const PATH = '/applications';

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const f = parseFilters(sp);
  const [{ data: s, fetchedAt }, table] = await Promise.all([getApplicationsSummary(f), getApplications(f)]);

  return (
    <>
      <SectionHeader
        title="JD Application Collection"
        description="Candidates who submitted the “Apply with Jd” / “Talk to Jd” form on Jobs Duniya, and the roles they want."
      >
        <div className="flex flex-col items-end gap-1.5">
          <FreshnessChip label="Latest submission" at={s.latestAt} />
          <DataAsOf at={fetchedAt} />
        </div>
      </SectionHeader>

      <JdApiBanner />

      <KpiRow>
        <KpiTile label="Submissions" kpi={s.kpis.submissions} />
        <KpiTile label="Today" kpi={s.kpis.today} />
        <KpiTile label="Unique candidates" kpi={s.kpis.unique} />
        <KpiTile label="With resume" kpi={s.kpis.resumeRate} />
        <KpiTile label="Repeat applicants" kpi={s.kpis.repeat} />
        <KpiTile label="All time" kpi={s.kpis.allTime} />
      </KpiRow>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Panel className="xl:col-span-3" title="Submissions over time" description={`Per ${s.trendGrain}, Gulf time.`}>
          <TrendChart data={s.trend} grain={s.trendGrain} from={f.from?.toISOString() ?? null} label="Submissions" height={230} />
        </Panel>
        <Panel className="xl:col-span-2" title="Where candidates come from" description="Source, campaign and the job they applied from.">
          <div className="flex h-full flex-col items-start gap-3 rounded-lg border border-dashed p-4">
            <Link2Off className="h-5 w-5 text-muted-foreground" />
            <div className="text-sm font-medium">Not captured yet</div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              The Jobs Duniya form doesn&apos;t store the job it was opened from, UTM tags, the referrer or whether it was
              &ldquo;Apply&rdquo; or &ldquo;Talk to Jd&rdquo;. Once those columns are added to <code>chat_interactions</code>, this
              panel will show source, campaign and top jobs automatically.
            </p>
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Panel title="Roles candidates want" description="“Role looking for”, grouped into buckets. Click to filter the table.">
          <BarList
            items={s.roles}
            mutedLabels={[OTHER, UNCLASSIFIED]}
            hrefFor={b => hrefWith(PATH, sp, { status: f.status === b.label ? null : b.label }) + '#table'}
          />
        </Panel>
        <Panel title="Top answers, as typed" description="The most common raw “role looking for” values.">
          <BarList items={s.rawPreferences} color="var(--series-1)" mutedLabels={[UNCLASSIFIED]} />
        </Panel>
        <Panel title="When candidates apply" description="Submissions by weekday and hour.">
          <Heatmap matrix={s.heatmap} tzLabel="Gulf time (UTC+4)" />
        </Panel>
      </div>

      <section id="table" className="mt-6 scroll-mt-24 rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <h2 className="text-[15px] font-semibold">Applicants</h2>
          <SearchBox placeholder="Search name, email or role" />
          <div className="ml-auto"><ExportButton dataset="applications" /></div>
        </div>
        <div className="border-b px-4 py-2.5">
          <FilterPills options={[...ROLE_RULES.map(([b]) => ({ value: b, label: b })), { value: OTHER, label: OTHER }]} />
        </div>
        {table.rows.length ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Candidate</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Role looking for</TableHead>
                  <TableHead>Resume</TableHead>
                  <TableHead className="pr-4">Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {table.rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="max-w-[260px] pl-4">
                      <div className="truncate font-medium">{r.name || '—'}</div>
                      <div className="truncate text-xs text-muted-foreground">{r.email ?? '—'}</div>
                    </TableCell>
                    <TableCell className="tabular whitespace-nowrap text-sm text-muted-foreground">{r.phone ?? '—'}</TableCell>
                    <TableCell className="max-w-[260px]">
                      <div className="truncate text-sm" dir="auto">{r.job_preference || '—'}</div>
                      <StatusChip tone="neutral" className="mt-1">{r.role}</StatusChip>
                    </TableCell>
                    <TableCell>
                      {r.has_resume ? (
                        <a
                          href={`/api/resume/${r.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                        >
                          <FileText className="h-4 w-4" /> Open
                        </a>
                      ) : (
                        <span className="text-sm text-muted-foreground">None</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap pr-4 text-sm">
                      <div className="tabular">{fmtDate(r.created_at, 'd MMM yyyy, HH:mm')}</div>
                      <div className="text-xs text-muted-foreground">{fmtAgo(r.created_at)}</div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">No applications match these filters.</p>
        )}
        <Pager page={f.page} pageSize={PAGE_SIZE} total={table.total} />
      </section>
      <p className="mt-3 text-xs text-muted-foreground">
        Personal data. Table times are in {DISPLAY_TZ_LABEL}; the charts use Gulf time ({APPLICATION_TZ}). Resume links are
        signed and expire after 10 minutes.
      </p>
    </>
  );
}
