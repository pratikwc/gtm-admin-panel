/**
 * Marketing data (HubSpot companies/contacts + Instantly) mapped to the
 * panel's vocabulary. Pure functions only, so they can be unit-tested.
 */
import { addDays, format, parseISO, startOfISOWeek } from 'date-fns';
import { countryBucket, UNCLASSIFIED } from './buckets';
import type { Bucket, Kpi, TrendPoint } from './queries/types';

// ---------------------------------------------------------------- vocabularies

/** HubSpot lifecycle stages, in funnel order. HubSpot's "lead" value is relabelled "Target Company" in this portal. */
export const LIFECYCLE = [
  { key: 'target', label: 'Target company', values: ['lead', 'subscriber', 'marketingqualifiedlead', 'salesqualifiedlead'] },
  { key: 'lead', label: 'Lead', values: ['1433831971'] },
  { key: 'opportunity', label: 'Opportunity', values: ['opportunity'] },
  { key: 'customer', label: 'Customer', values: ['customer', 'evangelist'] },
  { key: 'churned', label: 'Churned', values: ['1398383212'] },
] as const;
export type LifecycleKey = (typeof LIFECYCLE)[number]['key'] | 'other';

export function lifecycleKey(v: string | null | undefined): LifecycleKey {
  if (!v) return 'other';
  return LIFECYCLE.find(s => (s.values as readonly string[]).includes(v))?.key ?? 'other';
}

/** Company outreach progress (HubSpot `instantly_company_status`), in order. */
export const OUTREACH = [
  { key: 'not_researched', label: 'Not researched', hint: 'No research or contacts yet' },
  { key: 'researched', label: 'Researched', hint: 'Research done, not yet in a sequence' },
  { key: 'in_sequence', label: 'In sequence', hint: 'Added to an Instantly campaign, no reply yet' },
  { key: 'replied', label: 'Replied', hint: 'A contact replied' },
  { key: 'bounced', label: 'Bounced', hint: 'An email to a contact bounced' },
] as const;
export type OutreachKey = (typeof OUTREACH)[number]['key'];

export function outreachKey(v: string | null | undefined): OutreachKey {
  switch (v) {
    case 'company_research_done':
    case 'research_completed':
      return 'researched';
    case 'added_to_instantly_sequence':
    case 'opened': // opens aren't reliably tracked, so an open counts as still in sequence
      return 'in_sequence';
    case 'replied':
    case 'bounced':
      return v;
    default:
      return 'not_researched';
  }
}

const REACHED_OUTREACH: OutreachKey[] = ['in_sequence', 'replied', 'bounced'];
const RESEARCHED_OUTREACH: OutreachKey[] = ['researched', ...REACHED_OUTREACH];

/** HubSpot `lead_sources` values -> display labels. job-scan is our Supabase job scraper. */
const SOURCE_LABEL: Record<string, string> = {
  'Sales Navigator': 'Sales Navigator',
  'job-scan': 'Job scan (Supabase)',
  'Inbound (Website)': 'Inbound website',
  'manual-research': 'Manual research',
  'Abhi - Data': 'Abhi data',
};
export const sourceLabel = (v: string) => SOURCE_LABEL[v] ?? v;

const PRIORITY_LABEL: Record<string, string> = {
  p1_no_ats_uae_ha: 'P1 · No ATS · UAE',
  p4_ats_uae_hk_sg_ha: 'P4 · Has ATS · UAE / HK / SG',
  unclassified: 'Unclassified',
};
export const priorityLabel = (v: string | null | undefined) => (v ? PRIORITY_LABEL[v] ?? v : 'Not set');

export const NOT_SET = 'Not set';
export const UNKNOWN_COUNTRY = 'Unknown';

/** Free-text HubSpot country -> one of our market names (or Other / Unknown). */
export function marketOf(raw: string | null | undefined): string {
  const b = countryBucket(raw);
  return b === UNCLASSIFIED ? UNKNOWN_COUNTRY : b;
}

/** Instantly campaign status codes. */
export const CAMPAIGN_STATUS: Record<number, { label: string; group: CampaignGroup }> = {
  0: { label: 'Draft', group: 'draft' },
  1: { label: 'Active', group: 'active' },
  2: { label: 'Paused', group: 'paused' },
  3: { label: 'Completed', group: 'completed' },
  4: { label: 'Running subsequences', group: 'active' },
  [-1]: { label: 'Accounts unhealthy', group: 'attention' },
  [-2]: { label: 'Bounce protect', group: 'attention' },
  [-99]: { label: 'Suspended', group: 'attention' },
};
export type CampaignGroup = 'active' | 'paused' | 'completed' | 'draft' | 'attention';
export const CAMPAIGN_GROUPS: { key: CampaignGroup; label: string; hint: string }[] = [
  { key: 'active', label: 'Active', hint: 'Sending now' },
  { key: 'paused', label: 'Paused', hint: 'Stopped by us' },
  { key: 'completed', label: 'Completed', hint: 'Every lead finished the sequence' },
  { key: 'draft', label: 'Draft', hint: 'Not launched' },
  { key: 'attention', label: 'Needs attention', hint: 'Unhealthy accounts, bounce protection or suspended' },
];
export const campaignStatus = (code: number) => CAMPAIGN_STATUS[code] ?? { label: `Status ${code}`, group: 'attention' as const };

/** Contact-level email outcome (HubSpot `instantly_status`, unsubscribed wins). */
export const OUTCOME = [
  { key: 'sent', label: 'No reply yet' },
  { key: 'replied', label: 'Replied' },
  { key: 'bounced', label: 'Bounced' },
  { key: 'unsubscribed', label: 'Unsubscribed' },
] as const;
export type OutcomeKey = (typeof OUTCOME)[number]['key'];

export function outcomeKey(status: string | null | undefined, unsubscribed: boolean): OutcomeKey {
  if (unsubscribed) return 'unsubscribed';
  if (status === 'replied') return 'replied';
  if (status === 'bounced') return 'bounced';
  return 'sent';
}

/** Mailbox health from Instantly account fields. */
export function mailboxHealth(a: { status: number; warmup_status: number; stat_warmup_score: number | null; setup_pending?: boolean }): 'good' | 'warn' | 'bad' {
  if (a.status !== 1 || a.setup_pending) return 'bad';
  if (a.warmup_status !== 1 || (a.stat_warmup_score ?? 0) < 80) return 'warn';
  return 'good';
}

// ---------------------------------------------------------------- helpers

export const rate = (n: number, d: number): number | null => (d > 0 ? n / d : null);

export function count<T>(rows: T[], key: (r: T) => string | string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    for (const one of Array.isArray(k) ? k : [k]) m.set(one, (m.get(one) ?? 0) + 1);
  }
  return m;
}

/** Map -> Bucket[], largest first, with `last` labels pushed to the end. */
export function toBuckets(m: Map<string, number>, last: string[] = []): Bucket[] {
  return [...m.entries()]
    .map(([label, value]) => ({ label, value, key: label }))
    .sort((a, b) => Number(last.includes(a.label)) - Number(last.includes(b.label)) || b.value - a.value);
}

/** Bucket[] in a fixed order (zero rows kept). */
export function ordered(m: Map<string, number>, order: readonly { key: string; label: string }[]): Bucket[] {
  return order.map(o => ({ key: o.key, label: o.label, value: m.get(o.key) ?? 0 }));
}

export const grainFor = (days: number | null): 'day' | 'week' => (days && days <= 90 ? 'day' : 'week');

export function bucketDate(isoDay: string, grain: 'day' | 'week'): string {
  return grain === 'day' ? isoDay.slice(0, 10) : format(startOfISOWeek(parseISO(isoDay.slice(0, 10))), 'yyyy-MM-dd');
}

/** Sum dated values into day/week buckets. */
export function trend(points: { t: string; value: number }[], grain: 'day' | 'week'): TrendPoint[] {
  const m = new Map<string, number>();
  for (const p of points) {
    const k = bucketDate(p.t, grain);
    m.set(k, (m.get(k) ?? 0) + p.value);
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([t, value]) => ({ t, value }));
}

export const isoDay = (d: Date) => format(d, 'yyyy-MM-dd');
export const inRange = (day: string | null, from: string | null, to?: string | null) =>
  !!day && (!from || day >= from) && (!to || day < to);

// ---------------------------------------------------------------- HubSpot snapshot (compact, cache-friendly)

/** One target company, kept small: the full set (10k+) has to fit in Next's 2 MB cache entry. */
export interface CompanyRow {
  id: string;
  name: string;
  domain: string | null;
  market: string;
  stage: LifecycleKey;
  sources: string[];
  outreach: OutreachKey;
  industry: string;
  priority: string;
  created: string | null; // yyyy-mm-dd
  contacted: string | null; // yyyy-mm-dd, last Instantly contact
}

/** One contact we've emailed (has Instantly activity in HubSpot). */
export interface ContactRow {
  market: string;
  outcome: OutcomeKey;
  campaign: string;
  mailbox: string;
  lastSent: string | null; // yyyy-mm-dd
  industry: string;
  priority: string;
  companyId: string | null;
}

export interface HubspotSnapshot {
  companies: CompanyRow[];
  contacts: ContactRow[];
  outboundContacts: number;
  portalId: string | null;
}

type Props = Record<string, string | null>;
const day = (v: string | null | undefined) => (v ? v.slice(0, 10) : null);

export function toCompanyRow(id: string, p: Props): CompanyRow {
  return {
    id,
    name: (p.name ?? '').slice(0, 80) || p.domain || `Company ${id}`,
    domain: p.domain ?? null,
    market: marketOf(p.country),
    stage: lifecycleKey(p.lifecyclestage),
    sources: p.lead_sources ? p.lead_sources.split(';').filter(Boolean).map(sourceLabel) : [NOT_SET],
    // Either flag counts as a reply: the company status lags behind the per-contact flag.
    outreach: p.instantly_any_contact_replied === 'true' ? 'replied' : outreachKey(p.instantly_company_status),
    industry: p.wc_industry_bucket || NOT_SET,
    priority: priorityLabel(p.company_priority_manual),
    created: day(p.createdate),
    contacted: day(p.instantly_last_contacted_at),
  };
}

export function toContactRow(p: Props, companies: Map<string, CompanyRow>): ContactRow {
  const company = p.associatedcompanyid ? companies.get(p.associatedcompanyid) : undefined;
  const own = marketOf(p.country);
  return {
    market: own !== UNKNOWN_COUNTRY ? own : company?.market ?? UNKNOWN_COUNTRY,
    outcome: outcomeKey(p.instantly_status, p.instantly_unsubscribed === 'true'),
    campaign: p.instantly_campaign_name || NOT_SET,
    mailbox: (p.instantly_email_account || NOT_SET).toLowerCase(),
    lastSent: day(p.instantly_last_email_sent_at),
    industry: company?.industry ?? NOT_SET,
    priority: company?.priority ?? NOT_SET,
    companyId: p.associatedcompanyid ?? null,
  };
}

export const isReached = (c: CompanyRow) => !!c.contacted || REACHED_OUTREACH.includes(c.outreach);
export const isResearched = (c: CompanyRow) => RESEARCHED_OUTREACH.includes(c.outreach) || isReached(c);

// ---------------------------------------------------------------- Pre-sales funnel

/** The four questions Data space answers, in order. Each step is a subset of the one before. */
export const FUNNEL = [
  { key: 'data', label: 'Data', status: 'Not researched', hint: 'Target companies in HubSpot (Record type = Leads for outbound).' },
  { key: 'researched', label: 'Researched', status: 'Researched', hint: 'Company research is done, including every company that went further.' },
  { key: 'reached', label: 'Reached out', status: 'Reached out', hint: 'At least one contact emailed through Instantly.' },
  { key: 'converted', label: 'Converted', status: 'Converted', hint: 'Reached out, and a contact replied to our email.' },
] as const;
export type FunnelKey = (typeof FUNNEL)[number]['key'];

// Converted = replied to our email. Lifecycle stages aren't used: HubSpot's "Lead" is set when outreach starts,
// and Opportunities also come from calls, with nothing in HubSpot saying which channel created them.
export const isConverted = (c: CompanyRow) => isReached(c) && c.outreach === 'replied';

/** Furthest step a company has reached. */
export function funnelStep(c: CompanyRow): FunnelKey {
  if (isConverted(c)) return 'converted';
  if (isReached(c)) return 'reached';
  if (isResearched(c)) return 'researched';
  return 'data';
}

const STEP_RANK: Record<FunnelKey, number> = { data: 0, researched: 1, reached: 2, converted: 3 };

export interface FunnelRow {
  label: string;
  data: number;
  researched: number;
  reached: number;
  converted: number;
}

/** Cumulative step counts: a converted company also counts as researched and reached. */
export function funnelCounts(rows: CompanyRow[]): FunnelRow {
  const r: FunnelRow = { label: 'All', data: 0, researched: 0, reached: 0, converted: 0 };
  for (const c of rows) {
    const k = STEP_RANK[funnelStep(c)];
    r.data++;
    if (k >= 1) r.researched++;
    if (k >= 2) r.reached++;
    if (k >= 3) r.converted++;
  }
  return r;
}

function funnelRows(rows: CompanyRow[], key: (c: CompanyRow) => string | string[], last: string[]): FunnelRow[] {
  const groups = new Map<string, CompanyRow[]>();
  for (const c of rows) {
    const k = key(c);
    for (const one of Array.isArray(k) ? k : [k]) groups.set(one, [...(groups.get(one) ?? []), c]);
  }
  return [...groups.entries()]
    .map(([label, g]) => ({ ...funnelCounts(g), label }))
    .sort((a, b) => Number(last.includes(a.label)) - Number(last.includes(b.label)) || b.data - a.data);
}

// ---------------------------------------------------------------- Data space

export interface DataSpaceFilters {
  market: string | null;
  from: string | null; // yyyy-mm-dd
  prevFrom: string | null;
  grain: 'day' | 'week';
  step: string | null;
  source: string | null;
  q: string;
}

export const BREAKDOWNS = [
  { key: 'market', label: 'Market' },
  { key: 'source', label: 'Source' },
  { key: 'industry', label: 'Industry' },
  { key: 'priority', label: 'Priority' },
] as const;
export type BreakdownKey = (typeof BREAKDOWNS)[number]['key'];

export function dataSpace(s: HubspotSnapshot, f: DataSpaceFilters) {
  const rows = f.market ? s.companies.filter(c => c.market === f.market) : s.companies;
  const totals = funnelCounts(rows);
  const added = f.from ? rows.filter(c => inRange(c.created, f.from)).length : null;
  const addedPrev = f.from ? rows.filter(c => inRange(c.created, f.prevFrom, f.from)).length : null;

  const table = rows
    .filter(c => (!f.step || funnelStep(c) === f.step) && (!f.source || c.sources.includes(f.source)))
    .filter(c => !f.q || c.name.toLowerCase().includes(f.q.toLowerCase()) || (c.domain ?? '').toLowerCase().includes(f.q.toLowerCase()))
    .sort((a, b) => (b.created ?? '').localeCompare(a.created ?? ''));

  return {
    totals,
    funnel: FUNNEL.map(st => ({ key: st.key, label: st.label, hint: st.hint, value: totals[st.key] })),
    contacts: f.market ? null : s.outboundContacts,
    added,
    addedPrev,
    breakdown: {
      market: funnelRows(rows, c => c.market, ['Other', UNKNOWN_COUNTRY]),
      source: funnelRows(rows, c => c.sources, [NOT_SET]),
      industry: funnelRows(rows, c => c.industry, ['Other', NOT_SET]),
      priority: funnelRows(rows, c => c.priority, ['Unclassified', NOT_SET]),
    } satisfies Record<BreakdownKey, FunnelRow[]>,
    growth: trend(rows.filter(c => c.created && inRange(c.created, f.from)).map(c => ({ t: c.created!, value: 1 })), f.grain),
    table,
  };
}

// ---------------------------------------------------------------- Outbound email (HubSpot side)

export interface RateRow {
  label: string;
  reached: number;
  replied: number;
  bounced: number;
}

function rateRows(rows: ContactRow[], key: (c: ContactRow) => string, last: string[] = []): RateRow[] {
  const m = new Map<string, RateRow>();
  for (const c of rows) {
    const k = key(c);
    const r = m.get(k) ?? { label: k, reached: 0, replied: 0, bounced: 0 };
    r.reached++;
    if (c.outcome === 'replied') r.replied++;
    if (c.outcome === 'bounced') r.bounced++;
    m.set(k, r);
  }
  return [...m.values()].sort((a, b) => Number(last.includes(a.label)) - Number(last.includes(b.label)) || b.reached - a.reached);
}

export function emailAudience(s: HubspotSnapshot, f: { market: string | null; from: string | null }) {
  const companies = f.market ? s.companies.filter(c => c.market === f.market) : s.companies;
  // A contact counts in the period when its latest email went out in the period.
  const contacts = s.contacts.filter(c => (!f.market || c.market === f.market) && (!f.from || inRange(c.lastSent, f.from)));
  return {
    targetCompanies: companies.length,
    reachedCompanies: companies.filter(isReached).length,
    contacts: contacts.length,
    replied: contacts.filter(c => c.outcome === 'replied').length,
    outcome: ordered(count(contacts, c => c.outcome), OUTCOME),
    markets: rateRows(contacts, c => c.market, ['Other', UNKNOWN_COUNTRY]),
    industries: rateRows(contacts, c => c.industry, ['Other', NOT_SET]),
    priorities: rateRows(contacts, c => c.priority, ['Unclassified', NOT_SET]),
    mailboxes: count(contacts, c => c.mailbox),
    lastSent: s.contacts.reduce<string | null>((a, c) => (c.lastSent && (!a || c.lastSent > a) ? c.lastSent : a), null),
  };
}

/** Inclusive Instantly date window for a filter period. */
export function instantlyWindow(from: Date | null, now: Date) {
  return { start: from ? isoDay(from) : undefined, end: isoDay(addDays(now, 1)) };
}

// ---------------------------------------------------------------- Compact snapshot
// Next's data cache refuses entries over 2MB; ~10k company rows as plain objects are ~3.6MB.
// Repeated values (market, stage, industry, campaign…) go into one shared list and rows keep indices.

type PackedRow = (string | number | null | number[])[];
export interface PackedSnapshot {
  v: 1;
  dict: string[];
  companies: PackedRow[];
  contacts: PackedRow[];
  outboundContacts: number;
  portalId: string | null;
}

export function packSnapshot(s: HubspotSnapshot): PackedSnapshot {
  const dict: string[] = [];
  const index = new Map<string, number>();
  const d = (v: string) => {
    let i = index.get(v);
    if (i === undefined) { i = dict.length; dict.push(v); index.set(v, i); }
    return i;
  };
  return {
    v: 1,
    dict,
    companies: s.companies.map(c => [
      c.id, c.name, c.domain, d(c.market), d(c.stage), c.sources.map(d), d(c.outreach), d(c.industry), d(c.priority), c.created, c.contacted,
    ]),
    contacts: s.contacts.map(c => [
      d(c.market), d(c.outcome), d(c.campaign), d(c.mailbox), c.lastSent, d(c.industry), d(c.priority), c.companyId,
    ]),
    outboundContacts: s.outboundContacts,
    portalId: s.portalId,
  };
}

export function unpackSnapshot(p: PackedSnapshot): HubspotSnapshot {
  const w = (i: unknown) => p.dict[i as number];
  return {
    companies: p.companies.map(r => ({
      id: r[0] as string,
      name: r[1] as string,
      domain: r[2] as string | null,
      market: w(r[3]),
      stage: w(r[4]) as LifecycleKey,
      sources: (r[5] as number[]).map(w),
      outreach: w(r[6]) as OutreachKey,
      industry: w(r[7]),
      priority: w(r[8]),
      created: r[9] as string | null,
      contacted: r[10] as string | null,
    })),
    contacts: p.contacts.map(r => ({
      market: w(r[0]),
      outcome: w(r[1]) as OutcomeKey,
      campaign: w(r[2]),
      mailbox: w(r[3]),
      lastSent: r[4] as string | null,
      industry: w(r[5]),
      priority: w(r[6]),
      companyId: r[7] as string | null,
    })),
    outboundContacts: p.outboundContacts,
    portalId: p.portalId,
  };
}

// ---------------------------------------------------------------- Opportunity source

/** Instantly lead interest statuses that count as a positive reply: Interested, Meeting booked, Meeting completed, Won. */
export const POSITIVE_INTEREST = [1, 2, 3, 4];
export const isPositiveReply = (status: number | null | undefined) => status != null && POSITIVE_INTEREST.includes(status);

/**
 * Where an opportunity came from. Outbound email only when a contact replied positively in Instantly;
 * everything else came from calling (the team's rule; HubSpot has no channel field for it).
 */
export const OPPORTUNITY_SOURCES = [
  { key: 'email', label: 'Outbound email', hint: 'A contact replied positively in Instantly (Interested, Meeting booked or later).' },
  { key: 'calling', label: 'Calling', hint: 'Every other opportunity.' },
] as const;
export type OpportunitySource = (typeof OPPORTUNITY_SOURCES)[number]['key'];

export interface OpportunityRow {
  id: string;
  name: string;
  market: string;
  stage: LifecycleKey;
  entered: string | null; // yyyy-mm-dd, first became an Opportunity
  source: OpportunitySource;
}

/** Companies with a positive reply, by HubSpot company id and by email domain (fallback when the contact isn't linked). */
export interface PositiveReplies {
  companyIds: Set<string>;
  domains: Set<string>;
}

const bareDomain = (d: string | null | undefined) => (d ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

export function toOpportunityRow(id: string, p: Props, positive: PositiveReplies): OpportunityRow {
  const domain = bareDomain(p.domain);
  return {
    id,
    name: (p.name ?? '').slice(0, 80) || p.domain || `Company ${id}`,
    market: marketOf(p.country),
    stage: lifecycleKey(p.lifecyclestage),
    entered: day(p.hs_v2_date_entered_opportunity),
    source: positive.companyIds.has(id) || (!!domain && positive.domains.has(domain)) ? 'email' : 'calling',
  };
}

export function emailDomain(email: string | null | undefined) {
  const at = (email ?? '').lastIndexOf('@');
  return at < 0 ? '' : bareDomain(email!.slice(at + 1));
}

/** Opportunities in the period (by the day they became one) and market, split by source. Newest first. */
export function opportunitySummary(rows: OpportunityRow[], f: { market: string | null; from: string | null }) {
  const list = rows
    .filter(r => (!f.market || r.market === f.market) && (!f.from || inRange(r.entered, f.from)))
    .sort((a, b) => (b.entered ?? '').localeCompare(a.entered ?? '') || a.name.localeCompare(b.name));
  const by = count(list, r => r.source);
  return {
    total: list.length,
    allTime: rows.length,
    sources: OPPORTUNITY_SOURCES.map(s => ({ ...s, value: by.get(s.key) ?? 0 })),
    rows: list,
  };
}
