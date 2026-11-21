import Link from 'next/link';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { parseFilters, type SearchParams } from '@/lib/filters';
import { fmtAgo, fmtDate, fmtInt, fmtPct } from '@/lib/format';
import { freshness, type Health } from '@/lib/health';
import { getPipelineSnapshot } from '@/lib/queries/pipeline';
import { getHubspotSnapshot } from '@/lib/queries/dataspace';
import { isReached } from '@/lib/marketing';
import { Panel, SectionHeader } from '@/components/charts/panel';
import { StatusChip, type ChipTone } from '@/components/charts/status-chip';
import { DataAsOf } from '@/components/shell/data-as-of';
import { JdApiBanner } from '@/components/shell/api-banner';
import { SECTIONS } from '@/components/shell/nav';

export const dynamic = 'force-dynamic';

const TONE: Record<Health, ChipTone> = { ok: 'good', warn: 'warn', bad: 'bad', unknown: 'neutral' };
const WORD: Record<Health, string> = { ok: 'On schedule', warn: 'Late', bad: 'Stopped', unknown: 'No data' };

export default async function OverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const f = parseFilters(sp);
  const [{ data: p, fetchedAt }, hub] = await Promise.all([
    getPipelineSnapshot(f.from?.toISOString() ?? null),
    // Separate source: if HubSpot is down, the rest of Overview still renders.
    getHubspotSnapshot().then(r => r.data).catch(() => null),
  ]);
  const qs = new URLSearchParams();
  if (f.range !== '90d') qs.set('range', f.range);
  const keep = qs.size ? `?${qs}` : '';
  const top = Math.max(...p.funnel.slice(0, 5).map(s => s.value), 1);
  const syncAt = p.latestJdUpdate ?? p.lastSyncAt;

  const health: { label: string; detail: string; at: string | null; href: string }[] = [
    { label: 'GTM job scans', detail: 'Apify LinkedIn scrape (location + company scans)', at: p.lastScanAt, href: '/outbound' },
    { label: 'GTM → Jobs Duniya sync', detail: 'Vercel cron that copies jobs into JD', at: syncAt, href: '/published' },
    { label: 'Candidate submissions', detail: 'Jobs Duniya form', at: p.latestApplicationAt, href: '/applications' },
    ...(hub
      ? [
          {
            label: 'New companies in HubSpot',
            detail: 'Newest target company created (Supabase sync and manual adds)',
            at: hub.companies.reduce<string | null>((a, c) => (c.created && (!a || c.created > a) ? c.created : a), null),
            href: '/data',
          },
          {
            label: 'Outbound email',
            detail: 'Latest Instantly email recorded on a HubSpot contact',
            at: hub.contacts.reduce<string | null>((a, c) => (c.lastSent && (!a || c.lastSent > a) ? c.lastSent : a), null),
            href: '/reached',
          },
        ]
      : []),
  ];

  const marketing = hub
    ? [
        { key: 'target', label: 'Target companies', value: hub.companies.length, hint: 'Outbound records in HubSpot', href: '/data' },
        { key: 'reached', label: 'Reached out', value: hub.companies.filter(isReached).length, hint: 'At least one contact emailed', href: '/reached' },
        { key: 'replied', label: 'Replied', value: hub.companies.filter(c => c.outreach === 'replied').length, hint: 'A contact replied', href: '/reached' },
        { key: 'opportunity', label: 'Opportunity', value: hub.companies.filter(c => c.stage === 'opportunity').length, hint: 'HubSpot lifecycle stage', base: 0, href: '/data?stage=opportunity#table' },
        { key: 'customer', label: 'Customer', value: hub.companies.filter(c => c.stage === 'customer').length, hint: 'HubSpot lifecycle stage', base: 0, href: '/data?stage=customer#table' },
      ]
    : null;

  return (
    <>
      <SectionHeader
        title="Overview"
        description="Everything marketing runs, in one place: the companies we can reach, who we have reached, the jobs we scrape, and what Jobs Duniya publishes and brings in."
      >
        <DataAsOf at={fetchedAt} />
      </SectionHeader>

      <JdApiBanner />

      {marketing && (
        <Panel className="mb-4" title="Marketing funnel" description="Target companies in HubSpot and how far outreach has got with them (all time). Click a stage to open it.">
          <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {marketing.map((s, i) => {
              // Reached out and Replied are nested in the step before; lifecycle stages are not, so they compare to the total.
              const prev = i === 0 ? null : 'base' in s && s.base != null ? marketing[s.base] : marketing[i - 1];
              const conv = prev?.value ? s.value / prev.value : null;
              return (
                <li key={s.key}>
                  <Link href={s.href} className="group flex h-full flex-col rounded-lg border bg-background/50 p-4 transition-colors hover:border-primary/50 hover:bg-accent/40">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium uppercase tracking-wider">{i + 1}. {s.label}</span>
                      <ChevronRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    <div className="tabular mt-2 text-2xl font-semibold tracking-tight">{fmtInt(s.value)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{s.hint}</div>
                    <div className="tabular mt-auto pt-3 text-[11px] text-muted-foreground">
                      {conv != null && prev ? `${fmtPct(conv, conv < 0.1 ? 1 : 0)} of ${prev.label.toLowerCase()}` : 'Starting point'}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ol>
        </Panel>
      )}

      <Panel title="Jobs pipeline" description="From scraping to applications. Each stage shows its share of the stage it comes from. Click a stage to open it.">
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {p.funnel.map((s, i) => {
            const base = s.of ? p.funnel.find(x => x.key === s.of) : null;
            const conv = base?.value ? s.value / base.value : null;
            return (
              <li key={s.key}>
                <Link href={`${s.href}${s.href.includes('?') ? (keep ? `&${keep.slice(1)}` : '') : keep}`}
                  className="group flex h-full flex-col rounded-lg border bg-background/50 p-4 transition-colors hover:border-primary/50 hover:bg-accent/40">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium uppercase tracking-wider">{i + 1}. {s.label}</span>
                    <ChevronRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                  <div className="tabular mt-2 text-2xl font-semibold tracking-tight">{fmtInt(s.value)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{s.hint}</div>
                  <div className="mt-auto pt-3">
                    {i < 5 ? (
                      <div className="h-1.5 w-full rounded-full bg-[var(--viz-track)]">
                        <div className="h-1.5 rounded-full bg-[var(--viz-brand)]" style={{ width: `${Math.max(1.5, (s.value / top) * 100)}%` }} />
                      </div>
                    ) : (
                      <div className="h-1.5" />
                    )}
                    <div className="tabular mt-1.5 h-4 text-[11px] text-muted-foreground">
                      {conv != null && base ? `${fmtPct(conv, conv < 0.1 ? 1 : 0)} of ${base.label.toLowerCase()}` : ''}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Pipeline health" description="When each automated step last produced data. Green under 26h, amber under 3 days, red beyond.">
          <ul className="divide-y">
            {health.map(h => {
              const s = freshness(h.at);
              return (
                <li key={h.label} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <Link href={`${h.href}${keep}`} className="text-sm font-medium hover:text-primary">{h.label}</Link>
                    <div className="text-xs text-muted-foreground">{h.detail}</div>
                  </div>
                  <div className="text-right">
                    <StatusChip tone={TONE[s]}>{WORD[s]}</StatusChip>
                    <div className="mt-1 text-[11px] text-muted-foreground" title={fmtDate(h.at, 'd MMM yyyy, HH:mm')}>{fmtAgo(h.at)}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
        <Panel title="GTM ↔ JD drift" description="Jobs where the two databases disagree.">
          <div className="grid gap-3 sm:grid-cols-2">
            <DriftTile
              value={p.drift.gtmLiveMissingInJd}
              of={p.drift.gtmLive}
              label="Live in GTM, missing on JD"
              note="Recently scraped jobs the site isn't showing yet."
            />
            <DriftTile
              value={p.drift.jdActiveGtmStale}
              of={p.drift.jdActiveTotal}
              label="Active on JD, stale in GTM"
              note="Listings still live on the site that GTM hasn't seen for 60+ days."
            />
          </div>
          <Link href={`/published${keep}`} className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            See JD published <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {SECTIONS.map(s => {
          const Icon = s.icon;
          return (
            <Link key={s.href} href={`${s.href}${keep}`} className="group rounded-xl border bg-card p-5 shadow-sm transition-colors hover:border-primary/50">
              <Icon className="h-5 w-5 text-primary" />
              <div className="mt-3 font-semibold">{s.label}</div>
              <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
                Open <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          );
        })}
      </div>
    </>
  );
}

function DriftTile({ value, of, label, note }: { value: number; of: number; label: string; note: string }) {
  const share = of ? value / of : 0;
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="tabular text-2xl font-semibold">{fmtInt(value)}</span>
        <span className="tabular text-xs text-muted-foreground">of {fmtInt(of)} ({fmtPct(share, share < 0.1 ? 1 : 0)})</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}
