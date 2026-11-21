import { describe, expect, it } from 'vitest';
import {
  campaignStatus, dataSpace, emailAudience, lifecycleKey, mailboxHealth, marketOf, outcomeKey, outreachKey, rate,
  toCompanyRow, toContactRow, trend, type HubspotSnapshot,
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
    expect(outcomeKey('email_opened', false)).toBe('opened');
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
  it('counts target, reached, researched and stages', () => {
    const d = dataSpace(fixture(), { market: null, from: '2026-11-01', prevFrom: '2026-10-01', grain: 'day', stage: null, source: null, outreach: null, q: '' });
    expect(d.kpis.target.value).toBe(3);
    expect(d.kpis.reached.value).toBe(1);
    expect(d.kpis.researched.value).toBe(2);
    expect(d.kpis.customers.value).toBe(1);
    expect(d.kpis.added.value).toBe(2);
    expect(d.sources.find(s => s.label === 'Job scan (Supabase)')?.value).toBe(1);
    expect(d.table[0].id).toBe('3'); // newest first
  });

  it('filters by market and table filters', () => {
    const d = dataSpace(fixture(), { market: 'United Arab Emirates', from: null, prevFrom: null, grain: 'week', stage: null, source: null, outreach: 'researched', q: '' });
    expect(d.kpis.target.value).toBe(2);
    expect(d.table.map(c => c.id)).toEqual(['3']);
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
