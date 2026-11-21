import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { parseFilters, MARKETS, type SearchParams } from '@/lib/filters';
import { fmtAgo, fmtDate, fmtInt, fmtPct } from '@/lib/format';
import { hrefWith } from '@/lib/url';
import { CAMPAIGN_GROUPS, emailAudience, isoDay, mailboxHealth, rate, UNKNOWN_COUNTRY, type CampaignGroup, type OutcomeKey } from '@/lib/marketing';
import { getHubspotSnapshot } from '@/lib/queries/dataspace';
import { getCampaign, getEmailSummary, type CampaignRow } from '@/lib/queries/email';
import { KpiRow, KpiTile } from '@/components/kpi/kpi';
import { Panel } from '@/components/charts/panel';
import { SegmentBar } from '@/components/charts/segment-bar';
import { TrendChart } from '@/components/charts/trend-chart';
import { RateTable } from '@/components/charts/rate-table';
import { StatusChip, type ChipTone } from '@/components/charts/status-chip';
import { FreshnessChip } from '@/components/shell/freshness';
import { DataAsOf } from '@/components/shell/data-as-of';
import { SourceBanner } from '@/components/shell/source-banner';
import { ExportButton, FilterPills, RowLink } from '@/components/table/table-controls';
import { DetailGrid, DetailSheet } from '@/components/table/detail-sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PATH = '/reached';
const GROUP_COLOR: Record<CampaignGroup, string> = {
  active: 'var(--status-good)',
  paused: 'var(--status-warning)',
  completed: 'var(--ord-3)',
  draft: 'var(--status-neutral)',
  attention: 'var(--status-critical)',
};
const GROUP_TONE: Record<CampaignGroup, ChipTone> = { active: 'good', paused: 'warn', completed: 'info', draft: 'neutral', attention: 'bad' };
const OUTCOME_COLOR: Record<OutcomeKey, string> = {
  sent: 'var(--ord-2)',
  replied: 'var(--status-good)',
  bounced: 'var(--status-critical)',
  unsubscribed: 'var(--status-warning)',
};
const HEALTH_TONE = { good: 'good', warn: 'warn', bad: 'bad' } as const;
const HEALTH_WORD = { good: 'Healthy', warn: 'Check warmup', bad: 'Not sending' } as const;

export default async function OutboundEmailPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const f = parseFilters(sp);
  const campaignId = typeof sp.campaign === 'string' ? sp.campaign : null;
  const marketLabel = f.market ? MARKETS.find(m => m.value === f.market)?.label ?? f.market : null;

  const [email, hub, detail] = await Promise.all([
    getEmailSummary(f).catch((e: unknown) => ({ error: e })),
    getHubspotSnapshot().catch((e: unknown) => ({ error: e })),
    campaignId ? getCampaign(campaignId, f).catch(() => null) : Promise.resolve(null),
  ]);
  const em = 'error' in email ? null : email.data;
  const aud = 'error' in hub ? null : emailAudience(hub.data, { market: f.market, from: f.from ? isoDay(f.from) : null });
  const groupFilter = f.status && CAMPAIGN_GROUPS.some(g => g.key === f.status) ? (f.status as CampaignGroup) : null;
  const campaigns = em ? em.campaigns.filter(c => !groupFilter || c.group === groupFilter) : [];
  const fetchedAt = 'error' in email ? ('error' in hub ? null : hub.fetchedAt) : email.fetchedAt;

  return (
    <>
      <div className="-mt-2 mb-4 flex flex-wrap items-center justify-end gap-3">
        {em && <FreshnessChip label="Last email sent" at={em.lastSendDay} />}
        {fetchedAt && <DataAsOf at={fetchedAt} />}
      </div>

      {'error' in email && <SourceBanner source="Instantly" error={email.error} />}
      {'error' in hub && <SourceBanner source="HubSpot" error={hub.error} />}

      <KpiRow>
        <KpiTile label="Emails sent" kpi={em?.kpis.sent ?? { value: null }} />
        <KpiTile label="People reached" kpi={em?.kpis.contacted ?? { value: null }} />
        <KpiTile label="Reply rate" kpi={em?.kpis.replyRate ?? { value: null }} footer={em ? `${fmtInt(em.totals.replied)} replies` : undefined} />
        <KpiTile
          label="Bounce rate"
          kpi={em?.kpis.bounceRate ?? { value: null }}
          invert
          tone={em?.kpis.bounceRate.value == null ? 'default' : em.kpis.bounceRate.value > 0.05 ? 'bad' : em.kpis.bounceRate.value > 0.02 ? 'warn' : 'good'}
          footer={em ? `${fmtInt(em.totals.bounced)} bounced` : undefined}
        />
        <KpiTile label="Opportunities" kpi={em?.kpis.opportunities ?? { value: null }} />
        <KpiTile
          label="Companies reached"
          kpi={{ value: aud?.reachedCompanies ?? null, hint: 'Target companies in HubSpot with at least one contact emailed (all time).' }}
          footer={aud ? `${fmtPct(rate(aud.reachedCompanies, aud.targetCompanies), 1)} of ${fmtInt(aud.targetCompanies)} target` : undefined}
        />
      </KpiRow>
      {marketLabel && em && (
        <p className="mt-2 text-xs text-muted-foreground">
          Instantly reports totals for all markets. The market filter ({marketLabel}) applies to the region, audience and coverage panels below.
        </p>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Panel
          className="xl:col-span-2"
          title="Coverage"
          description="Share of our target companies we have emailed so far."
          action={
            <Link href={hrefWith('/data', sp, { status: null })} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline">
              Data space <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          {aud ? (
            <div>
              <div className="flex items-baseline gap-2">
                <span className="tabular text-3xl font-semibold tracking-tight">{fmtInt(aud.reachedCompanies)}</span>
                <span className="text-sm text-muted-foreground">of {fmtInt(aud.targetCompanies)} target companies</span>
              </div>
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-[var(--viz-track)]">
                <div className="h-2.5 rounded-full bg-[var(--viz-brand)]" style={{ width: `${Math.max(1, (rate(aud.reachedCompanies, aud.targetCompanies) ?? 0) * 100)}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {fmtInt(aud.targetCompanies - aud.reachedCompanies)} target companies have not been emailed yet.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Needs HubSpot.</p>
          )}
        </Panel>
        <Panel className="xl:col-span-3" title="Campaigns by status" description="Instantly campaign status. Click a status to filter the campaign list.">
          {em ? (
            <SegmentBar
              segments={CAMPAIGN_GROUPS.map(g => ({
                key: g.key,
                label: g.label,
                value: em.campaigns.filter(c => c.group === g.key).length,
                color: GROUP_COLOR[g.key],
                hint: g.hint,
                href: hrefWith(PATH, sp, { status: groupFilter === g.key ? null : g.key }) + '#campaigns',
                active: groupFilter === g.key,
              }))}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Needs Instantly.</p>
          )}
        </Panel>
      </div>

      {em && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Panel title="Emails sent" description={`All campaigns, per ${em.grain}.`}>
            <TrendChart data={em.sentTrend} grain={em.grain} from={f.from?.toISOString() ?? null} label="Emails sent" height={190} />
          </Panel>
          <Panel title="Replies" description={`Unique human replies, per ${em.grain}.`}>
            <TrendChart data={em.replyTrend} grain={em.grain} from={f.from?.toISOString() ?? null} label="Replies" height={190} />
          </Panel>
        </div>
      )}

      {aud && (
        <>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Panel
              title="By market"
              description="People emailed in the period, by country (contact's country, else their company's). Grey rates come from fewer than 20 people."
            >
              <RateTable
                rowHeader="Market"
                baseLabel="Emailed"
                hitLabel="Replied"
                extraLabel="Bounced"
                rateLabel="Reply rate"
                rows={aud.markets.map(r => ({
                  label: r.label,
                  base: r.reached,
                  hit: r.replied,
                  extra: r.bounced,
                  href: r.label === 'Other' || r.label === UNKNOWN_COUNTRY ? null : hrefWith(PATH, sp, { market: f.market === r.label ? null : r.label }),
                }))}
              />
            </Panel>
            <Panel title="By industry" description="Industry bucket of the contact's company. Shows which industries answer.">
              <RateTable
                rowHeader="Industry"
                baseLabel="Emailed"
                hitLabel="Replied"
                rateLabel="Reply rate"
                rows={aud.industries.map(r => ({ label: r.label, base: r.reached, hit: r.replied }))}
              />
            </Panel>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Panel title="What came back" description={`Latest status of the ${fmtInt(aud.contacts)} people emailed in the period.`}>
              <SegmentBar segments={aud.outcome.map(o => ({ key: o.key!, label: o.label, value: o.value, color: OUTCOME_COLOR[o.key as OutcomeKey] }))} />
              <div className="mt-6">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">By priority</div>
                <RateTable
                  rowHeader="Priority"
                  baseLabel="Emailed"
                  hitLabel="Replied"
                  rateLabel="Reply rate"
                  rows={aud.priorities.map(r => ({ label: r.label, base: r.reached, hit: r.replied }))}
                  max={5}
                />
              </div>
            </Panel>
            <Panel title="Sending mailboxes" description="Instantly accounts. People emailed counts each contact's latest mailbox in the period." bodyClassName="px-0 pb-2">
              {em ? <Mailboxes accounts={em.accounts} sends={aud.mailboxes} /> : <p className="px-5 text-sm text-muted-foreground">Needs Instantly.</p>}
            </Panel>
          </div>
        </>
      )}

      {em && (
        <section id="campaigns" className="mt-6 scroll-mt-24 rounded-xl border bg-card shadow-sm">
          <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
            <h2 className="text-[15px] font-semibold">Campaigns</h2>
            <span className="tabular text-sm text-muted-foreground">{fmtInt(campaigns.length)}</span>
            <div className="ml-auto">
              <ExportButton dataset="email-campaigns" />
            </div>
          </div>
          <div className="border-b px-4 py-2.5">
            <FilterPills options={CAMPAIGN_GROUPS.map(g => ({ value: g.key, label: g.label }))} />
          </div>
          <CampaignTable rows={campaigns} />
        </section>
      )}

      {detail && (
        <DetailSheet param="campaign" title={detail.row.name} subtitle={`Created ${fmtDate(detail.row.created)} · figures for the selected period`}>
          <div className="mb-5 flex flex-wrap gap-2">
            <StatusChip tone={GROUP_TONE[detail.row.group]}>{detail.row.statusLabel}</StatusChip>
          </div>
          <DetailGrid
            items={[
              ['Leads in campaign', fmtInt(detail.row.leads)],
              ['People reached', fmtInt(detail.row.contacted)],
              ['Emails sent', fmtInt(detail.row.sent)],
              ['Replies', `${fmtInt(detail.row.replied)} (${fmtPct(rate(detail.row.replied, detail.row.contacted), 1)})`],
              ['Bounced', `${fmtInt(detail.row.bounced)} (${fmtPct(rate(detail.row.bounced, detail.row.sent), 1)})`],
              ['Unsubscribed', fmtInt(detail.row.unsubscribed)],
              ['Opportunities', fmtInt(detail.row.opportunities)],
              ['Daily limit', detail.row.dailyLimit ? fmtInt(detail.row.dailyLimit) : null],
            ]}
          />
          <div className="mt-6">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Emails sent</div>
            <TrendChart data={detail.sentTrend} grain={detail.grain} from={f.from?.toISOString() ?? null} label="Emails sent" height={160} />
          </div>
          <div className="mt-6">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">By sequence step</div>
            {detail.steps.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-0">Step</TableHead>
                    <TableHead className="text-right">Sent</TableHead>
                    <TableHead className="text-right">Replies</TableHead>
                    <TableHead className="text-right">Auto-replies</TableHead>
                    <TableHead className="pr-0 text-right">Reply rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.steps.map(s => (
                    <TableRow key={`${s.step}-${s.variant}`}>
                      <TableCell className="pl-0 text-sm">Step {s.step + 1}{detail.steps.some(x => x.step === s.step && x.variant !== s.variant) ? ` · variant ${String.fromCharCode(65 + s.variant)}` : ''}</TableCell>
                      <TableCell className="tabular text-right">{fmtInt(s.sent)}</TableCell>
                      <TableCell className="tabular text-right">{fmtInt(s.replied)}</TableCell>
                      <TableCell className="tabular text-right text-muted-foreground">{fmtInt(s.auto)}</TableCell>
                      <TableCell className="tabular pr-0 text-right font-medium">{fmtPct(rate(s.replied, s.sent), 1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No step data for this period.</p>
            )}
          </div>
        </DetailSheet>
      )}
    </>
  );
}

function Mailboxes({ accounts, sends }: { accounts: { email: string; status: number; warmup_status: number; stat_warmup_score: number | null; daily_limit: number | null; setup_pending?: boolean }[]; sends: Map<string, number> }) {
  if (!accounts.length) return <p className="px-5 text-sm text-muted-foreground">No sending accounts.</p>;
  const rows = accounts
    .map(a => ({ ...a, health: mailboxHealth(a), emailed: sends.get(a.email) ?? 0 }))
    .sort((a, b) => (a.health === b.health ? b.emailed - a.emailed : a.health === 'bad' ? -1 : b.health === 'bad' ? 1 : a.health === 'warn' ? -1 : 1));
  const capacity = rows.filter(r => r.health !== 'bad').reduce((s, r) => s + (r.daily_limit ?? 0), 0);
  return (
    <>
      <p className="px-5 pb-3 text-xs text-muted-foreground">
        {fmtInt(rows.filter(r => r.health === 'good').length)} of {fmtInt(rows.length)} healthy · up to {fmtInt(capacity)} emails a day across sending mailboxes
      </p>
      <div className="max-h-[360px] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Mailbox</TableHead>
              <TableHead className="text-right">Warmup</TableHead>
              <TableHead className="text-right">Daily limit</TableHead>
              <TableHead className="text-right">Emailed</TableHead>
              <TableHead className="pr-5">Health</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.email}>
                <TableCell className="max-w-[220px] truncate py-2 pl-5 text-[13px]">{r.email}</TableCell>
                <TableCell className="tabular py-2 text-right text-[13px]">{r.stat_warmup_score ?? '—'}</TableCell>
                <TableCell className="tabular py-2 text-right text-[13px]">{fmtInt(r.daily_limit)}</TableCell>
                <TableCell className="tabular py-2 text-right text-[13px]">{fmtInt(r.emailed)}</TableCell>
                <TableCell className="py-2 pr-5"><StatusChip tone={HEALTH_TONE[r.health]}>{HEALTH_WORD[r.health]}</StatusChip></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function CampaignTable({ rows }: { rows: CampaignRow[] }) {
  if (!rows.length) return <p className="px-4 py-10 text-center text-sm text-muted-foreground">No campaigns match this filter.</p>;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Campaign</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Leads</TableHead>
            <TableHead className="text-right">Reached</TableHead>
            <TableHead className="text-right">Sent</TableHead>
            <TableHead className="text-right">Replies</TableHead>
            <TableHead className="text-right">Reply rate</TableHead>
            <TableHead className="text-right">Bounce rate</TableHead>
            <TableHead className="pr-4 text-right">Opportunities</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(r => {
            const bounce = rate(r.bounced, r.sent);
            return (
              <TableRow key={r.id}>
                <TableCell className="max-w-[300px] pl-4">
                  <RowLink id={r.id} param="campaign" className="line-clamp-1">{r.name}</RowLink>
                  <div className="text-xs text-muted-foreground">Created {fmtAgo(r.created)}</div>
                </TableCell>
                <TableCell><StatusChip tone={GROUP_TONE[r.group]}>{r.statusLabel}</StatusChip></TableCell>
                <TableCell className="tabular text-right">{fmtInt(r.leads)}</TableCell>
                <TableCell className="tabular text-right">{fmtInt(r.contacted)}</TableCell>
                <TableCell className="tabular text-right">{fmtInt(r.sent)}</TableCell>
                <TableCell className="tabular text-right">{fmtInt(r.replied)}</TableCell>
                <TableCell className="tabular text-right font-medium">{fmtPct(rate(r.replied, r.contacted), 1)}</TableCell>
                <TableCell className={`tabular text-right ${bounce != null && bounce > 0.02 ? 'font-medium text-[var(--status-critical)]' : ''}`}>{fmtPct(bounce, 1)}</TableCell>
                <TableCell className="tabular pr-4 text-right">{fmtInt(r.opportunities)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

