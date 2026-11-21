import Link from 'next/link';
import { ArrowRight, ChevronRight, ExternalLink } from 'lucide-react';
import { parseFilters, PAGE_SIZE, type SearchParams } from '@/lib/filters';
import { fmtAgo, fmtDate, fmtInt, fmtPct } from '@/lib/format';
import { hrefWith } from '@/lib/url';
import {
  BREAKDOWNS, FUNNEL, funnelStep, LIFECYCLE, NOT_SET, UNKNOWN_COUNTRY, rate,
  type BreakdownKey, type CompanyRow, type FunnelKey, type FunnelRow,
} from '@/lib/marketing';
import { getCompanyDetail, getDataSpace, getSyncStatus } from '@/lib/queries/dataspace';
import { getOpportunities } from '@/lib/queries/opportunities';
import { OpportunityPanel } from '@/components/charts/opportunity-panel';
import { Panel, SectionHeader } from '@/components/charts/panel';
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

/** One colour per step, getting stronger as companies move along. */
const STEP_COLOR: Record<FunnelKey, string> = {
  data: 'var(--viz-track)',
  researched: 'var(--ord-2)',
  reached: 'var(--ord-4)',
  converted: 'var(--status-good)',
};
const STEP_TONE: Record<FunnelKey, ChipTone> = { data: 'neutral', researched: 'info', reached: 'info', converted: 'good' };
const STATUS_LABEL = Object.fromEntries(FUNNEL.map(s => [s.key, s.status])) as Record<FunnelKey, string>;
const STAGE_LABEL: Record<string, string> = Object.fromEntries(LIFECYCLE.map(s => [s.key, s.label]));
const MUTED = ['Other', UNKNOWN_COUNTRY, NOT_SET, 'Unclassified'];

export default async function DataSpacePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const f = parseFilters(sp);
  const extra = { step: one(sp.step), source: one(sp.source) };
  const by = (BREAKDOWNS.find(b => b.key === one(sp.by))?.key ?? 'market') as BreakdownKey;
  const companyId = one(sp.company);

  const [ds, sync, detail, opps] = await Promise.all([
    getDataSpace(f, extra).catch((e: unknown) => ({ error: e })),
    getSyncStatus().then(r => r.data).catch(() => null),
    companyId ? getCompanyDetail(companyId).catch(() => null) : Promise.resolve(null),
    getOpportunities(f).catch(() => null),
  ]);

  const header = (
    <SectionHeader
      title="Data space"
      description="How much data we have, how much of it is researched, how many companies we have reached out to, and how many converted. Counts are where things stand today."
    >
      {'error' in ds ? null : <DataAsOf at={ds.fetchedAt} />}
    </SectionHeader>
  );
  if ('error' in ds) return (<>{header}<SourceBanner source="HubSpot" error={ds.error} /></>);

  const t = ds.totals;
  const rows = ds.table;
  const page = rows.slice((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE);
  const tableHref = (patch: Record<string, string | null>) => hrefWith(PATH, sp, { ...patch, page: null }) + '#table';
  const hubspotUrl = (id: string) => (ds.portalId ? `https://app.hubspot.com/contacts/${ds.portalId}/record/0-2/${id}` : null);

  return (
    <>
      {header}

      <FunnelHero
        totals={t}
        contacts={ds.contacts}
        added={ds.added}
        addedPrev={ds.addedPrev}
        hrefFor={step => tableHref({ step: extra.step === step ? null : step })}
        active={extra.step}
      />

      <Panel
        className="mt-4"
        title={`Funnel by ${BREAKDOWNS.find(b => b.key === by)!.label.toLowerCase()}`}
        description="The same four steps, split up, so you can see where data is thin and where it converts."
        action={
          <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-0.5">
            {BREAKDOWNS.map(b => (
              <Link
                key={b.key}
                href={hrefWith(PATH, sp, { by: b.key === 'market' ? null : b.key })}
                scroll={false}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${by === b.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {b.label}
              </Link>
            ))}
          </div>
        }
      >
        <BreakdownTable
          rows={ds.breakdown[by]}
          hrefFor={r => {
            if (MUTED.includes(r.label)) return null;
            if (by === 'market') return hrefWith(PATH, sp, { market: f.market === r.label ? null : r.label });
            if (by === 'source') return tableHref({ source: extra.source === r.label ? null : r.label });
            return null;
          }}
        />
      </Panel>

      <OpportunityPanel className="mt-4" data={opps} portalId={ds.portalId} list />

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="New data"
          description={`Target companies added to HubSpot, per ${f.days && f.days <= 90 ? 'day' : 'week'}.`}
        >
          <TrendChart data={ds.growth} grain={f.days && f.days <= 90 ? 'day' : 'week'} from={f.from?.toISOString() ?? null} label="New companies" height={200} />
        </Panel>
        <Panel title="Supabase → HubSpot" description="Companies our job scan found in Supabase, and how many have reached HubSpot.">
          {sync ? (
            <div className="space-y-4">
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="tabular text-3xl font-semibold tracking-tight">{fmtPct(rate(sync.linked, sync.total))}</span>
                  <span className="tabular text-sm text-muted-foreground">{fmtInt(sync.linked)} of {fmtInt(sync.total)} synced</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--viz-track)]">
                  <div className="h-2 rounded-full bg-[var(--viz-brand)]" style={{ width: `${sync.total ? (sync.linked / sync.total) * 100 : 0}%` }} />
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Waiting to sync</dt>
                  <dd className="tabular mt-0.5 font-semibold">{fmtInt(sync.waiting)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">New in last 30 days</dt>
                  <dd className="tabular mt-0.5 font-semibold">{fmtInt(sync.new_30d)}</dd>
                </div>
              </dl>
              <FreshnessChip label="Last added" at={sync.last_added} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Supabase isn&rsquo;t reachable right now.</p>
          )}
        </Panel>
      </div>

      <section id="table" className="mt-6 scroll-mt-24 rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <h2 className="text-[15px] font-semibold">Companies</h2>
          <span className="tabular text-sm text-muted-foreground">{fmtInt(rows.length)}</span>
          <SearchBox placeholder="Search company or domain" />
          {extra.source && <ClearChip href={tableHref({ source: null })}>Source: {extra.source}</ClearChip>}
          <div className="ml-auto">
            <ExportButton dataset="data-companies" />
          </div>
        </div>
        <div className="border-b px-4 py-2.5">
          <FilterPills param="step" options={FUNNEL.map(s => ({ value: s.key, label: s.status }))} />
        </div>
        <CompaniesTable rows={page} />
        <Pager page={f.page} pageSize={PAGE_SIZE} total={rows.length} />
      </section>

      {detail && (
        <DetailSheet param="company" title={detail.row.name} subtitle={[detail.row.domain, detail.p.city, detail.p.country].filter(Boolean).join(' · ')}>
          <div className="mb-5 flex flex-wrap gap-2">
            <StatusChip tone={STEP_TONE[funnelStep(detail.row)]}>{STATUS_LABEL[funnelStep(detail.row)]}</StatusChip>
          </div>
          <DetailGrid
            items={[
              ['Market', detail.row.market],
              ['Source', detail.row.sources.join(', ')],
              ['Industry', detail.row.industry],
              ['Priority', detail.row.priority],
              ['HubSpot stage', STAGE_LABEL[detail.row.stage] ?? null],
              ['Employees', detail.p.numberofemployees ? fmtInt(Number(detail.p.numberofemployees)) : null],
              ['Contacts in HubSpot', detail.p.num_associated_contacts],
              ['Last campaign', detail.p.instantly_last_campaign_name],
              ['Last contacted', detail.row.contacted ? `${fmtDate(detail.row.contacted)} (${fmtAgo(detail.row.contacted)})` : null],
              ['Last reply', detail.p.instantly_last_reply_at ? fmtDate(detail.p.instantly_last_reply_at, 'd MMM yyyy, HH:mm') : null],
              ['Added to HubSpot', fmtDate(detail.row.created)],
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

/** The four steps side by side, each bar sized against all data, plus the one sentence that matters. */
function FunnelHero({
  totals, contacts, added, addedPrev, hrefFor, active,
}: {
  totals: FunnelRow;
  contacts: number | null;
  added: number | null;
  addedPrev: number | null;
  hrefFor: (step: FunnelKey) => string;
  active: string | null;
}) {
  const steps = FUNNEL.map((s, i) => {
    const value = totals[s.key];
    const prev = i > 0 ? FUNNEL[i - 1] : null;
    return { ...s, value, prev, stepRate: prev ? rate(value, totals[prev.key]) : null, share: rate(value, totals.data) };
  });

  // The weakest hand-off is the message: that's where effort pays off most.
  const weakest = steps.slice(1).reduce((a, b) => ((b.stepRate ?? 1) < (a.stepRate ?? 1) ? b : a));
  const stuck = weakest.prev ? totals[weakest.prev.key] - weakest.value : 0;
  const message = {
    data: '',
    researched: `${fmtInt(stuck)} companies (${fmtPct(rate(stuck, totals.data))}) have no research yet. Research is the biggest bottleneck.`,
    reached: `${fmtInt(stuck)} researched companies haven't been emailed yet. Getting them into a sequence is the biggest gap.`,
    converted: `Only ${fmtPct(weakest.stepRate, 1)} of the companies we reached have converted. Replies are the biggest gap.`,
  }[weakest.key];

  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <ol className="grid divide-y md:grid-cols-4 md:divide-x md:divide-y-0">
        {steps.map((s, i) => {
          const isActive = active === s.key;
          return (
            <li key={s.key} className="relative">
              {i > 0 && (
                <span className="absolute -left-3 top-1/2 z-10 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border bg-card text-muted-foreground md:flex" aria-hidden>
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              )}
              <Link
                href={hrefFor(s.key)}
                scroll={false}
                title={s.hint}
                className={`group flex h-full flex-col p-5 transition-colors hover:bg-accent/40 ${isActive ? 'bg-accent/50' : ''} ${i === 0 ? 'rounded-t-xl md:rounded-l-xl md:rounded-tr-none' : ''} ${i === steps.length - 1 ? 'rounded-b-xl md:rounded-r-xl md:rounded-bl-none' : ''}`}
              >
                <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <span className="tabular flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] text-foreground">{i + 1}</span>
                  {s.label}
                </span>
                <span className="tabular mt-3 text-4xl font-semibold tracking-tight">{fmtInt(s.value)}</span>
                <span className="mt-1 text-sm text-muted-foreground">
                  {s.key === 'data' ? (
                    <>
                      companies{contacts != null && <> · {fmtInt(contacts)} contacts</>}
                    </>
                  ) : (
                    <>
                      <span className="tabular font-medium text-foreground">{fmtPct(s.stepRate, (s.stepRate ?? 1) < 0.1 ? 1 : 0)}</span> of {s.prev!.label.toLowerCase()}
                    </>
                  )}
                </span>
                <span className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[var(--viz-track)]">
                  <span
                    className="block h-2 rounded-full"
                    style={{ width: `${Math.max((s.share ?? 0) * 100, s.value ? 1.5 : 0)}%`, background: s.key === 'data' ? 'var(--viz-brand)' : STEP_COLOR[s.key] }}
                  />
                </span>
                <span className="tabular mt-1.5 text-[11px] text-muted-foreground">
                  {s.key === 'data' ? (added != null ? `+${fmtInt(added)} added this period${addedPrev ? ` (${added >= addedPrev ? '+' : ''}${fmtPct((added - addedPrev) / addedPrev)})` : ''}` : 'All data') : `${fmtPct(s.share, (s.share ?? 1) < 0.1 ? 1 : 0)} of all data`}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      {message && (
        <p className="flex items-start gap-2 border-t px-5 py-3 text-sm">
          <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>{message}</span>
        </p>
      )}
    </section>
  );
}

/** Each row: the four step counts and a bar showing how that slice of data splits across the steps. */
function BreakdownTable({ rows, hrefFor }: { rows: FunnelRow[]; hrefFor: (r: FunnelRow) => string | null }) {
  if (!rows.length) return <p className="py-8 text-center text-sm text-muted-foreground">No data.</p>;
  const shown = rows.slice(0, 10);
  const segments = (r: FunnelRow) => [
    { key: 'converted' as const, value: r.converted },
    { key: 'reached' as const, value: r.reached - r.converted },
    { key: 'researched' as const, value: r.researched - r.reached },
    { key: 'data' as const, value: r.data - r.researched },
  ];
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {(['converted', 'reached', 'researched', 'data'] as const).map(k => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: STEP_COLOR[k] }} />
            {STATUS_LABEL[k]}
          </span>
        ))}
      </div>
      <div className="-mx-1 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-1" />
              <TableHead className="text-right">Data</TableHead>
              <TableHead className="text-right">Researched</TableHead>
              <TableHead className="text-right">Reached out</TableHead>
              <TableHead className="text-right">Converted</TableHead>
              <TableHead className="hidden w-[32%] pr-1 md:table-cell">Where it stands</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map(r => {
              const href = hrefFor(r);
              const muted = MUTED.includes(r.label);
              return (
                <TableRow key={r.label}>
                  <TableCell className={`max-w-[220px] truncate pl-1 text-sm font-medium ${muted ? 'text-muted-foreground' : ''}`}>
                    {href ? <Link href={href} scroll={false} className="hover:text-primary hover:underline">{r.label}</Link> : r.label}
                  </TableCell>
                  <TableCell className="tabular text-right text-sm font-semibold">{fmtInt(r.data)}</TableCell>
                  <Cell value={r.researched} of={r.data} />
                  <Cell value={r.reached} of={r.data} />
                  <Cell value={r.converted} of={r.reached} good />
                  <TableCell className="hidden pr-1 md:table-cell">
                    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--viz-track)]">
                      {segments(r).map(s => (s.value > 0 ? <span key={s.key} style={{ width: `${(s.value / r.data) * 100}%`, background: STEP_COLOR[s.key] }} /> : null))}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {rows.length > shown.length && <p className="mt-2 text-xs text-muted-foreground">Top 10 of {rows.length}, by amount of data.</p>}
      <p className="mt-2 text-xs text-muted-foreground">Researched and Reached out show the share of data; Converted shows the share of reached out.</p>
    </>
  );
}

function Cell({ value, of, good }: { value: number; of: number; good?: boolean }) {
  const r = rate(value, of);
  return (
    <TableCell className="tabular text-right text-sm">
      <span className={good && value > 0 ? 'font-medium text-[var(--status-good)]' : ''}>{fmtInt(value)}</span>
      <span className="ml-1.5 inline-block w-10 text-left text-xs text-muted-foreground">{r != null ? fmtPct(r, r < 0.1 && r > 0 ? 1 : 0) : ''}</span>
    </TableCell>
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
            <TableHead>Status</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Industry</TableHead>
            <TableHead className="pr-4">Added</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(r => {
            const step = funnelStep(r);
            return (
              <TableRow key={r.id}>
                <TableCell className="max-w-[280px] pl-4">
                  <RowLink id={r.id} param="company" className="line-clamp-1">{r.name}</RowLink>
                  <div className="truncate text-xs text-muted-foreground">{r.domain ?? '—'}</div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">{r.market}</TableCell>
                <TableCell><StatusChip tone={STEP_TONE[step]}>{STATUS_LABEL[step]}</StatusChip></TableCell>
                <TableCell className="max-w-[180px] truncate text-sm text-muted-foreground">{r.sources.join(', ')}</TableCell>
                <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">{r.industry}</TableCell>
                <TableCell className="tabular whitespace-nowrap pr-4 text-sm">{fmtDate(r.created, 'd MMM yy')}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
