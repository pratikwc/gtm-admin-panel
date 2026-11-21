import Link from 'next/link';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { parseFilters, PAGE_SIZE, type SearchParams } from '@/lib/filters';
import { fmtAgo, fmtDate, fmtInt, fmtPct } from '@/lib/format';
import { hrefWith } from '@/lib/url';
import { LIFECYCLE, NOT_SET, OUTREACH, UNKNOWN_COUNTRY, type CompanyRow, type LifecycleKey, type OutreachKey } from '@/lib/marketing';
import { getCompanyDetail, getDataSpace, getSyncStatus } from '@/lib/queries/dataspace';
import { KpiRow, KpiTile } from '@/components/kpi/kpi';
import { Panel, SectionHeader } from '@/components/charts/panel';
import { BarList } from '@/components/charts/bar-list';
import { SegmentBar } from '@/components/charts/segment-bar';
import { TrendChart } from '@/components/charts/trend-chart';
import { StatusChip, type ChipTone } from '@/components/charts/status-chip';
import { FreshnessChip } from '@/components/shell/freshness';
import { DataAsOf } from '@/components/shell/data-as-of';
import { SourceBanner } from '@/components/shell/source-banner';
import { ExportButton, FilterPills, Pager, RowLink, SearchBox } from '@/components/table/table-controls';
import { DetailGrid, DetailSheet } from '@/components/table/detail-sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PATH = '/data';
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v.slice(0, 60) : null);

const OUTREACH_COLOR: Record<OutreachKey, string> = {
  not_researched: 'var(--status-neutral)',
  researched: 'var(--ord-2)',
  in_sequence: 'var(--ord-3)',
  opened: 'var(--ord-4)',
  replied: 'var(--status-good)',
  bounced: 'var(--status-critical)',
};
const OUTREACH_TONE: Record<OutreachKey, ChipTone> = {
  not_researched: 'neutral', researched: 'info', in_sequence: 'info', opened: 'info', replied: 'good', bounced: 'bad',
};
const STAGE_TONE: Record<LifecycleKey, ChipTone> = { target: 'neutral', lead: 'info', opportunity: 'warn', customer: 'good', churned: 'bad', other: 'neutral' };
const STAGE_LABEL: Record<string, string> = Object.fromEntries([...LIFECYCLE.map(s => [s.key, s.label]), ['other', 'Other']]);
const OUTREACH_LABEL: Record<string, string> = Object.fromEntries(OUTREACH.map(s => [s.key, s.label]));

export default async function DataSpacePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const f = parseFilters(sp);
  const extra = { stage: one(sp.stage), source: one(sp.source), outreach: one(sp.outreach) };
  const companyId = one(sp.company);

  const [ds, sync, detail] = await Promise.all([
    getDataSpace(f, extra).catch((e: unknown) => ({ error: e })),
    getSyncStatus().then(r => r.data).catch(() => null),
    companyId ? getCompanyDetail(companyId).catch(() => null) : Promise.resolve(null),
  ]);

  const header = (
    <SectionHeader
      title="Data space"
      description="Every company we can reach out to. HubSpot is the main record: it holds our older data, and new companies found by the Supabase job scan are synced into it."
    >
      {'error' in ds ? null : <DataAsOf at={ds.fetchedAt} />}
    </SectionHeader>
  );
  if ('error' in ds) return (<>{header}<SourceBanner source="HubSpot" error={ds.error} /></>);

  const k = ds.kpis;
  const rows = ds.table;
  const page = rows.slice((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE);
  const toggle = (param: string, value: string, current: string | null) => hrefWith(PATH, sp, { [param]: current === value ? null : value }) + '#table';
  const hubspotUrl = (id: string) => (ds.portalId ? `https://app.hubspot.com/contacts/${ds.portalId}/record/0-2/${id}` : null);
  const funnel = ds.lifecycle.filter(s => s.key !== 'churned' && s.key !== 'other');
  const lifecycleTotal = ds.lifecycle.reduce((a, s) => a + s.value, 0);

  return (
    <>
      {header}

      <KpiRow>
        <KpiTile label="Target companies" kpi={k.target} />
        <KpiTile label="Outbound contacts" kpi={k.contacts} />
        <KpiTile label={f.from ? 'Added in period' : 'Added (all time)'} kpi={k.added} />
        <KpiTile label="Researched" kpi={k.researched} footer={`${fmtPct(k.researched.value && k.target.value ? k.researched.value / k.target.value : null)} of target`} />
        <KpiTile label="Reached out" kpi={k.reached} footer={`${fmtPct(k.reachedRate.value, 1)} of target`} />
        <KpiTile label="Customers" kpi={k.customers} tone="good" />
      </KpiRow>

      <Panel
        className="mt-4"
        title="Lifecycle"
        description="HubSpot lifecycle stage of target companies. This is where each company stands today, shown as a share of all target companies. Click a stage to list those companies."
      >
        <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {funnel.map((s, i) => {
            const share = lifecycleTotal ? s.value / lifecycleTotal : null;
            const active = extra.stage === s.key;
            return (
              <li key={s.key}>
                <Link
                  href={toggle('stage', s.key!, extra.stage)}
                  scroll={false}
                  className={`flex h-full flex-col rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-accent/40 ${active ? 'border-primary bg-accent/50' : 'bg-background/50'}`}
                >
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{i + 1}. {s.label}</span>
                  <span className="tabular mt-2 text-2xl font-semibold tracking-tight">{fmtInt(s.value)}</span>
                  <span className="tabular mt-auto pt-2 text-[11px] text-muted-foreground">
                    {share != null ? `${fmtPct(share, share < 0.1 ? 1 : 0)} of target companies` : '—'}
                  </span>
                </Link>
              </li>
            );
          })}
          <li>
            {(() => {
              const churned = ds.lifecycle.find(s => s.key === 'churned');
              return (
                <Link
                  href={toggle('stage', 'churned', extra.stage)}
                  scroll={false}
                  className={`flex h-full flex-col rounded-lg border border-dashed p-4 transition-colors hover:border-primary/50 ${extra.stage === 'churned' ? 'border-primary bg-accent/50' : ''}`}
                >
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Churned</span>
                  <span className="tabular mt-2 text-2xl font-semibold tracking-tight text-muted-foreground">{fmtInt(churned?.value ?? 0)}</span>
                  <span className="mt-auto pt-2 text-[11px] text-muted-foreground">Former customers</span>
                </Link>
              );
            })()}
          </li>
        </ol>
      </Panel>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Panel
          className="xl:col-span-3"
          title="Outreach readiness"
          description="How far each target company has got: research, then an Instantly sequence, then a response. Click a segment to list those companies."
          action={
            <Link href={`/reached${f.market ? `?market=${encodeURIComponent(f.market)}` : ''}`} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline">
              Reached out <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          <SegmentBar
            segments={ds.outreach.map(b => ({
              key: b.key!,
              label: b.label,
              value: b.value,
              color: OUTREACH_COLOR[b.key as OutreachKey],
              hint: OUTREACH.find(o => o.key === b.key)?.hint,
              href: toggle('outreach', b.key!, extra.outreach),
              active: extra.outreach === b.key,
            }))}
          />
        </Panel>
        <Panel className="xl:col-span-2" title="Supabase → HubSpot sync" description="Companies found by our Supabase job scan, and whether they have reached HubSpot yet.">
          {sync ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <SyncStat label="In Supabase" value={sync.total} />
                <SyncStat label="In HubSpot" value={sync.linked} />
                <SyncStat label="Waiting" value={sync.waiting} warn={sync.waiting > 0} />
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--viz-track)]">
                <div className="h-2 rounded-full bg-[var(--viz-brand)]" style={{ width: `${sync.total ? (sync.linked / sync.total) * 100 : 0}%` }} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{fmtInt(sync.new_30d)} new in Supabase in the last 30 days</span>
                <FreshnessChip label="Last added" at={sync.last_added} />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Supabase isn&rsquo;t reachable right now.</p>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Panel title="Where they come from" description="HubSpot lead source. A company can have more than one.">
          <BarList items={ds.sources} mutedLabels={[NOT_SET]} hrefFor={b => toggle('source', b.label, extra.source)} />
        </Panel>
        <Panel title="By market" description="Company country in HubSpot. Click to filter the whole page.">
          <BarList items={ds.markets} mutedLabels={['Other', UNKNOWN_COUNTRY]} hrefFor={b => (b.label === 'Other' || b.label === UNKNOWN_COUNTRY ? null : hrefWith(PATH, sp, { market: f.market === b.label ? null : b.label }))} />
        </Panel>
        <Panel title="By industry" description="WhiteCarrot industry bucket.">
          <BarList items={ds.industries} mutedLabels={['Other', NOT_SET]} />
        </Panel>
        <Panel title="By priority" description="Manual priority set on the company in HubSpot.">
          <BarList items={ds.priorities} mutedLabels={['Unclassified', NOT_SET]} />
        </Panel>
        <Panel className="md:col-span-2" title="New target companies" description={`Created in HubSpot, per ${f.days && f.days <= 90 ? 'day' : 'week'}.`}>
          <TrendChart data={ds.growth} grain={f.days && f.days <= 90 ? 'day' : 'week'} from={f.from?.toISOString() ?? null} label="New companies" height={200} />
        </Panel>
      </div>

      <section id="table" className="mt-6 scroll-mt-24 rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <h2 className="text-[15px] font-semibold">Target companies</h2>
          <span className="tabular text-sm text-muted-foreground">{fmtInt(rows.length)}</span>
          <SearchBox placeholder="Search company or domain" />
          {(extra.stage || extra.source) && (
            <div className="flex flex-wrap gap-1.5">
              {extra.stage && <ClearChip href={hrefWith(PATH, sp, { stage: null }) + '#table'}>Stage: {STAGE_LABEL[extra.stage] ?? extra.stage}</ClearChip>}
              {extra.source && <ClearChip href={hrefWith(PATH, sp, { source: null }) + '#table'}>Source: {extra.source}</ClearChip>}
            </div>
          )}
          <div className="ml-auto">
            <ExportButton dataset="data-companies" />
          </div>
        </div>
        <div className="border-b px-4 py-2.5">
          <FilterPills param="outreach" options={OUTREACH.map(o => ({ value: o.key, label: o.label }))} />
        </div>
        <CompaniesTable rows={page} />
        <Pager page={f.page} pageSize={PAGE_SIZE} total={rows.length} />
      </section>

      {detail && (
        <DetailSheet param="company" title={detail.row.name} subtitle={[detail.row.domain, detail.p.city, detail.p.country].filter(Boolean).join(' · ')}>
          <div className="mb-5 flex flex-wrap gap-2">
            <StatusChip tone={STAGE_TONE[detail.row.stage]}>{STAGE_LABEL[detail.row.stage]}</StatusChip>
            <StatusChip tone={OUTREACH_TONE[detail.row.outreach]}>{OUTREACH_LABEL[detail.row.outreach]}</StatusChip>
          </div>
          <DetailGrid
            items={[
              ['Market', detail.row.market],
              ['Source', detail.row.sources.join(', ')],
              ['Industry', detail.row.industry],
              ['Priority', detail.row.priority],
              ['Employees', detail.p.numberofemployees ? fmtInt(Number(detail.p.numberofemployees)) : null],
              ['Contacts in HubSpot', detail.p.num_associated_contacts],
              ['Last campaign', detail.p.instantly_last_campaign_name],
              ['Last contacted', detail.row.contacted ? `${fmtDate(detail.row.contacted)} (${fmtAgo(detail.row.contacted)})` : null],
              ['Last reply', detail.p.instantly_last_reply_at ? fmtDate(detail.p.instantly_last_reply_at, 'd MMM yyyy, HH:mm') : null],
              ['Added to HubSpot', fmtDate(detail.row.created)],
              ['Last updated', fmtDate(detail.p.hs_lastmodifieddate, 'd MMM yyyy, HH:mm')],
            ]}
          />
          <div className="mt-5 flex flex-wrap gap-4">
            {hubspotUrl(detail.id) && (
              <a href={hubspotUrl(detail.id)!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                Open in HubSpot <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            {detail.p.research_brief_link && (
              <a href={detail.p.research_brief_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                Research brief <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </DetailSheet>
      )}
    </>
  );
}

function SyncStat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`tabular mt-1 text-xl font-semibold`}>{fmtInt(value)}</div>
    </div>
  );
}

function ClearChip({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} scroll={false} className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground hover:bg-accent/70">
      {children} <span aria-hidden>×</span>
    </Link>
  );
}

function CompaniesTable({ rows }: { rows: CompanyRow[] }) {
  if (!rows.length) return <p className="px-4 py-10 text-center text-sm text-muted-foreground">No companies match these filters.</p>;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Company</TableHead>
            <TableHead>Market</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Outreach</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Industry</TableHead>
            <TableHead className="pr-4">Added</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(r => (
            <TableRow key={r.id}>
              <TableCell className="max-w-[280px] pl-4">
                <RowLink id={r.id} param="company" className="line-clamp-1">{r.name}</RowLink>
                <div className="truncate text-xs text-muted-foreground">{r.domain ?? '—'}</div>
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm">{r.market}</TableCell>
              <TableCell><StatusChip tone={STAGE_TONE[r.stage]}>{STAGE_LABEL[r.stage]}</StatusChip></TableCell>
              <TableCell><StatusChip tone={OUTREACH_TONE[r.outreach]}>{OUTREACH_LABEL[r.outreach]}</StatusChip></TableCell>
              <TableCell className="max-w-[180px] truncate text-sm text-muted-foreground">{r.sources.join(', ')}</TableCell>
              <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">{r.industry}</TableCell>
              <TableCell className="tabular whitespace-nowrap pr-4 text-sm">{fmtDate(r.created, 'd MMM yy')}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
