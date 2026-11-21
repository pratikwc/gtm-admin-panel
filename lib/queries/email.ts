import 'server-only';
import { cached } from '../cache';
import {
  instantly, instantlyAll, InstantlyError,
  type InstantlyAccount, type InstantlyCampaign, type InstantlyCampaignAnalytics, type InstantlyDaily, type InstantlyStep,
} from '../instantly';
import { campaignStatus, grainFor, instantlyWindow, rate, trend, type CampaignGroup } from '../marketing';
import type { Filters } from '../filters';
import type { Kpi, TrendPoint } from './types';

export interface CampaignRow {
  id: string;
  name: string;
  status: number;
  statusLabel: string;
  group: CampaignGroup;
  created: string;
  leads: number;
  contacted: number;
  sent: number;
  replied: number;
  bounced: number;
  unsubscribed: number;
  opportunities: number;
  dailyLimit: number | null;
}

function row(c: InstantlyCampaign, a: InstantlyCampaignAnalytics | undefined): CampaignRow {
  const st = campaignStatus(c.status);
  return {
    id: c.id,
    name: c.name,
    status: c.status,
    statusLabel: st.label,
    group: st.group,
    created: c.timestamp_created,
    leads: a?.leads_count ?? 0,
    contacted: a?.contacted_count ?? 0,
    sent: a?.emails_sent_count ?? 0,
    replied: a?.reply_count_unique ?? 0,
    bounced: a?.bounced_count ?? 0,
    unsubscribed: a?.unsubscribed_count ?? 0,
    opportunities: a?.total_opportunities ?? 0,
    dailyLimit: c.daily_limit ?? null,
  };
}

const sum = (rows: CampaignRow[], k: keyof CampaignRow) => rows.reduce((a, r) => a + (r[k] as number), 0);

/** Campaigns + analytics for the period and the one before it, the daily series, and mailboxes. */
async function summary(fromIso: string | null, prevFromIso: string | null, days: number | null) {
  const now = new Date();
  const cur = instantlyWindow(fromIso ? new Date(fromIso) : null, now);
  const prev = prevFromIso && fromIso ? { start: instantlyWindow(new Date(prevFromIso), now).start, end: cur.start } : null;

  const [campaigns, analytics, prevAnalytics, daily, accounts] = await Promise.all([
    instantlyAll<InstantlyCampaign>('/campaigns'),
    instantly<InstantlyCampaignAnalytics[]>('/campaigns/analytics', { start_date: cur.start, end_date: cur.end }),
    prev ? instantly<InstantlyCampaignAnalytics[]>('/campaigns/analytics', { start_date: prev.start, end_date: prev.end }) : Promise.resolve(null),
    instantly<InstantlyDaily[]>('/campaigns/analytics/daily', { start_date: cur.start, end_date: cur.end }),
    instantlyAll<InstantlyAccount>('/accounts'),
  ]);

  const byId = new Map(analytics.map(a => [a.campaign_id, a]));
  const rows = campaigns.map(c => row(c, byId.get(c.id))).sort((a, b) => b.sent - a.sent || b.created.localeCompare(a.created));
  const prevRows = prevAnalytics ? campaigns.map(c => row(c, prevAnalytics.find(a => a.campaign_id === c.id))) : null;

  const k = (key: keyof CampaignRow) => ({ value: sum(rows, key), previous: prevRows ? sum(prevRows, key) : null });
  const pct = (n: keyof CampaignRow, d: keyof CampaignRow): Kpi => ({
    value: rate(sum(rows, n), sum(rows, d)),
    previous: prevRows ? rate(sum(prevRows, n), sum(prevRows, d)) : null,
    format: 'percent',
  });

  const grain = grainFor(days);
  const series = (pick: (d: InstantlyDaily) => number): TrendPoint[] => trend(daily.map(d => ({ t: d.date, value: pick(d) })), grain);
  const lastSendDay = [...daily].reverse().find(d => d.sent > 0)?.date ?? null;

  return {
    campaigns: rows,
    kpis: {
      sent: { ...k('sent'), hint: 'Emails Instantly sent in the period, all steps.' } as Kpi,
      contacted: { ...k('contacted'), hint: 'People who received at least one email in the period.' } as Kpi,
      replyRate: { ...pct('replied', 'contacted'), hint: 'Unique human replies ÷ people reached (auto-replies excluded).' } as Kpi,
      opportunities: { ...k('opportunities'), hint: 'Leads marked as an opportunity in Instantly.' } as Kpi,
      bounceRate: { ...pct('bounced', 'sent'), hint: 'Bounces ÷ emails sent. Keep under 2%.' } as Kpi,
    },
    totals: { sent: sum(rows, 'sent'), contacted: sum(rows, 'contacted'), replied: sum(rows, 'replied'), bounced: sum(rows, 'bounced') },
    grain,
    sentTrend: series(d => d.sent),
    replyTrend: series(d => d.unique_replies),
    lastSendDay,
    accounts: accounts.map(a => ({
      email: a.email.toLowerCase(),
      status: a.status,
      warmup_status: a.warmup_status,
      stat_warmup_score: a.stat_warmup_score,
      daily_limit: a.daily_limit,
      setup_pending: a.setup_pending,
    })),
  };
}

const summaryCached = cached('email-summary-v4', 'email', summary);

export function getEmailSummary(f: Filters) {
  return summaryCached(f.from?.toISOString().slice(0, 10) ?? null, f.prevFrom?.toISOString().slice(0, 10) ?? null, f.days);
}

/** One campaign: totals, daily trend and step × variant results for the period. */
async function campaign(id: string, fromIso: string | null, days: number | null) {
  const cur = instantlyWindow(fromIso ? new Date(fromIso) : null, new Date());
  const [c, analytics, daily, steps] = await Promise.all([
    instantly<InstantlyCampaign>(`/campaigns/${encodeURIComponent(id)}`),
    instantly<InstantlyCampaignAnalytics[]>('/campaigns/analytics', { id, start_date: cur.start, end_date: cur.end }),
    instantly<InstantlyDaily[]>('/campaigns/analytics/daily', { campaign_id: id, start_date: cur.start, end_date: cur.end }),
    instantly<InstantlyStep[]>('/campaigns/analytics/steps', { campaign_id: id, start_date: cur.start, end_date: cur.end }),
  ]);
  return {
    row: row(c, analytics.find(a => a.campaign_id === id)),
    sentTrend: trend(daily.map(d => ({ t: d.date, value: d.sent })), grainFor(days)),
    grain: grainFor(days),
    steps: steps
      .filter(s => s.step != null)
      .map(s => ({ step: Number(s.step), variant: Number(s.variant ?? 0), sent: s.sent, replied: s.unique_replies, auto: s.unique_replies_automatic ?? 0 }))
      .sort((a, b) => a.step - b.step || a.variant - b.variant),
  };
}
const campaignCached = cached('email-campaign-v4', 'email', campaign);

export async function getCampaign(id: string, f: Filters) {
  try {
    return (await campaignCached(id, f.from?.toISOString().slice(0, 10) ?? null, f.days)).data;
  } catch (e) {
    if (e instanceof InstantlyError && e.status === 404) return null;
    throw e;
  }
}

/** Is the Instantly API answering? Used for the banner, so it never throws. */
async function status() {
  try {
    await instantly('/campaigns', { limit: 1 });
    return { ok: true as const, status: 200, message: null };
  } catch (e) {
    const err = e as InstantlyError;
    return { ok: false as const, status: err.status ?? null, message: err.message };
  }
}
export const getInstantlyStatus = cached('instantly-status-v1', 'email', status);

export async function exportCampaigns(f: Filters) {
  const { data } = await getEmailSummary(f);
  return data.campaigns.map(c => ({
    campaign: c.name,
    status: c.statusLabel,
    leads: c.leads,
    contacted: c.contacted,
    emails_sent: c.sent,
    replied: c.replied,
    reply_rate: rate(c.replied, c.contacted),
    bounced: c.bounced,
    bounce_rate: rate(c.bounced, c.sent),
    unsubscribed: c.unsubscribed,
    opportunities: c.opportunities,
    created: c.created,
  }));
}
