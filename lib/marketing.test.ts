import { describe, expect, it } from 'vitest';
import {
  campaignStatus, dataSpace, emailAudience, lifecycleKey, mailboxHealth, marketOf, outcomeKey, outreachKey, rate,
  atStep, funnelCounts, funnelStep, researchDate, toCompanyRow, toContactRow, trend, type HubspotSnapshot,
} from './marketing';

describe('vocabularies', () => {
  it('maps HubSpot lifecycle values, including this portal\'s custom stages', () => {
    expect(lifecycleKey('lead')).toBe('target');
    expect(lifecycleKey('1433831971')).toBe('lead');
    expect(lifecycleKey('opportunity')).toBe('opportunity');
    expect(lifecycleKey('customer')).toBe('customer');
    expect(lifecycleKey('1398383212')).toBe('churned');
    expect(lifecycleKey(null)).toBe('other');
  });

  it('collapses outreach statuses', () => {
    expect(outreachKey('company_research_done')).toBe('researched');
    expect(outreachKey('research_completed')).toBe('researched');
    expect(outreachKey('added_to_instantly_sequence')).toBe('in_sequence');
    expect(outreachKey('replied')).toBe('replied');
    expect(outreachKey('opened')).toBe('in_sequence');
    expect(outreachKey(null)).toBe('not_researched');
  });

  it('reads free-text countries into markets', () => {
    expect(marketOf('United Arab Emirates')).toBe('United Arab Emirates');
    expect(marketOf('Dubai, UAE')).toBe('United Arab Emirates');
    expect(marketOf('KSA - Riyadh')).toBe('Saudi Arabia');
    expect(marketOf('')).toBe('Unknown');
    expect(marketOf('Germany')).toBe('Other');
  });

  it('lets unsubscribed win over other email outcomes', () => {
    expect(outcomeKey('replied', true)).toBe('unsubscribed');
    expect(outcomeKey('email_opened', false)).toBe('sent'); // opens aren't tracked reliably
    expect(outcomeKey('email_sent', false)).toBe('sent');
  });

  it('groups Instantly campaign statuses', () => {
    expect(campaignStatus(1).group).toBe('active');
    expect(campaignStatus(4).group).toBe('active');
    expect(campaignStatus(-2).group).toBe('attention');
    expect(campaignStatus(42).group).toBe('attention');
  });

  it('judges mailbox health', () => {
    expect(mailboxHealth({ status: 1, warmup_status: 1, stat_warmup_score: 100 })).toBe('good');
    expect(mailboxHealth({ status: 1, warmup_status: 1, stat_warmup_score: 60 })).toBe('warn');
    expect(mailboxHealth({ status: -1, warmup_status: 1, stat_warmup_score: 100 })).toBe('bad');
  });

  it('returns null rates for empty denominators', () => {
    expect(rate(1, 0)).toBeNull();
    expect(rate(1, 4)).toBe(0.25);
  });

  it('buckets dates by ISO week', () => {
    expect(trend([{ t: '2026-11-18', value: 2 }, { t: '2026-11-22', value: 3 }, { t: '2026-11-10', value: 1 }], 'week')).toEqual([
      { t: '2026-11-09', value: 1 },
      { t: '2026-11-16', value: 5 },
    ]);
  });
});

const company = (id: string, p: Record<string, string | null>) => toCompanyRow(id, { name: `Co ${id}`, ...p });

function fixture(): HubspotSnapshot {
  const companies = [
    company('1', { country: 'UAE', lifecyclestage: 'lead', instantly_company_status: 'replied', instantly_last_contacted_at: '2026-11-01T00:00:00Z', createdate: '2026-11-10T00:00:00Z', lead_sources: 'job-scan;Sales Navigator' }),
    company('2', { country: 'Saudi Arabia', lifecyclestage: 'customer', instantly_company_status: 'not_researched', createdate: '2026-01-05T00:00:00Z', lead_sources: 'Sales Navigator' }),
    company('3', { country: 'Dubai', lifecyclestage: 'lead', instantly_company_status: 'research_completed', createdate: '2026-11-15T00:00:00Z' }),
  ];
  const byId = new Map(companies.map(c => [c.id, c]));
  const contacts = [
    toContactRow({ country: null, associatedcompanyid: '1', instantly_status: 'replied', instantly_last_email_sent_at: '2026-11-01T00:00:00Z', instantly_email_account: 'A@x.com' }, byId),
    toContactRow({ country: 'India', associatedcompanyid: '2', instantly_status: 'bounced', instantly_last_email_sent_at: '2026-06-01T00:00:00Z' }, byId),
  ];
  return { companies, contacts, outboundContacts: 50, portalId: '123' };
}

describe('dataSpace', () => {
  const base = { market: null, from: '2026-11-01', prevFrom: '2026-10-01', grain: 'day' as const, step: null, source: null, q: '' };

  it('counts the nested funnel steps (all time)', () => {
    const d = dataSpace(fixture(), { ...base, from: null, prevFrom: null });
    // 1: replied + contacted -> replied; 2: customer, never reached -> data; 3: research done -> researched
    expect(d.totals).toMatchObject({ data: 3, researched: 2, reached: 1, replied: 1, positive: 0, opportunity: 0 });
    expect(d.funnel.map(s => s.value)).toEqual([3, 2, 1, 1, 0, 0]);
    expect(d.breakdown.source.find(s => s.label === 'Job scan (Supabase)')?.replied).toBe(1);
    expect(d.table[0].id).toBe('3'); // newest first
  });

  it('counts activity in the period when a range is set', () => {
    const d = dataSpace(fixture(), base);
    // added since 1 Nov: 1 and 3; emailed since 1 Nov: 1; no research or reply dates in the fixture
    expect(d.totals).toMatchObject({ data: 2, researched: 0, reached: 1, replied: 0 });
    expect(d.added).toBe(2);
    expect(d.table.map(c => c.id).sort()).toEqual(['1', '3']); // 2 had nothing happen in the period
  });

  it('filters by market and by step', () => {
    const d = dataSpace(fixture(), { ...base, from: null, prevFrom: null, market: 'United Arab Emirates', step: 'researched' });
    expect(d.totals.data).toBe(2);
    expect(d.table.map(c => c.id)).toEqual(['3', '1']); // at the step or beyond, newest first
  });

  it('counts only email replies as replied, not lifecycle stages', () => {
    expect(funnelStep(company('9', { lifecyclestage: 'opportunity', instantly_last_contacted_at: '2026-11-01' }))).toBe('reached');
    expect(funnelStep(company('9', { instantly_any_contact_replied: 'true', instantly_last_contacted_at: '2026-11-01' }))).toBe('replied');
  });
});

describe('emailAudience', () => {
  it('falls back to the company country and respects the period', () => {
    const a = emailAudience(fixture(), { market: null, from: '2026-10-01' });
    expect(a.contacts).toBe(1);
    expect(a.markets[0]).toMatchObject({ label: 'United Arab Emirates', reached: 1, replied: 1 });
    expect(a.mailboxes.get('a@x.com')).toBe(1);
    expect(a.reachedCompanies).toBe(1);
  });
});

describe('packSnapshot', () => {
  it('round-trips through JSON unchanged', async () => {
    const { packSnapshot, unpackSnapshot } = await import('./marketing');
    const s = fixture();
    const p = packSnapshot(s);
    expect(unpackSnapshot(JSON.parse(JSON.stringify(p)))).toEqual(s);
  });
});

describe('email funnel: replied, positive reply, opportunity', () => {
  const positive = new Set(['1', '2']);
  const reached = { instantly_last_contacted_at: '2026-11-01', instantly_any_contact_replied: 'true' };

  it('counts opportunities only after a positive reply (email only)', () => {
    expect(funnelStep(toCompanyRow('1', { ...reached, lifecyclestage: 'opportunity' }, positive))).toBe('opportunity');
    expect(funnelStep(toCompanyRow('2', { ...reached, lifecyclestage: 'lead' }, positive))).toBe('positive');
    expect(funnelStep(toCompanyRow('3', { ...reached }, positive))).toBe('replied');
    // An Opportunity from calling (no positive email reply) is not counted as one.
    expect(funnelStep(toCompanyRow('4', { lifecyclestage: 'opportunity', hs_v2_date_entered_opportunity: '2026-10-01' }, positive))).toBe('data');
  });

  it('is cumulative', () => {
    const rows = [
      toCompanyRow('1', { ...reached, lifecyclestage: 'customer' }, positive),
      toCompanyRow('2', { ...reached }, positive),
      toCompanyRow('3', { ...reached }, positive),
    ];
    expect(funnelCounts(rows)).toMatchObject({ data: 3, reached: 3, replied: 3, positive: 2, opportunity: 1 });
  });

  it('treats only Interested and later as positive', async () => {
    const { isPositiveReply } = await import('./marketing');
    expect([1, 2, 3, 4].every(isPositiveReply)).toBe(true);
    expect([0, -1, -2, null].some(isPositiveReply)).toBe(false);
  });
});

describe('step dates', () => {
  it('reads the research date from the brief file name', () => {
    expect(researchDate('https://x.supabase.co/storage/v1/object/public/briefs/2026-11-12_09-30_Acme_brief.md')).toBe('2026-11-12');
    expect(researchDate(null)).toBeNull();
    expect(researchDate('https://example.com/brief.md')).toBeNull();
  });

  it('counts a step in a period only when it happened in that period', () => {
    const c = company('5', {
      createdate: '2026-01-01', instantly_last_contacted_at: '2026-11-20', instantly_any_contact_replied: 'true', instantly_last_reply_at: '2026-11-21',
      research_brief_link: 'briefs/2026-10-01_10-00_Co_brief.md',
    });
    expect(atStep(c, 'replied')).toBe(true);
    expect(atStep(c, 'data', '2026-11-01')).toBe(false); // added long ago
    expect(atStep(c, 'researched', '2026-11-01')).toBe(false); // researched in October
    expect(atStep(c, 'reached', '2026-11-01')).toBe(true);
    expect(atStep(c, 'replied', '2026-11-01')).toBe(true);
    expect(funnelCounts([c], '2026-11-01')).toMatchObject({ data: 0, researched: 0, reached: 1, replied: 1 });
  });
});
