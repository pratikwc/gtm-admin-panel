import 'server-only';
import { cached } from '../cache';
import { gtm } from '../db/gtm';
import { hubspot, hsCount, hsGet, hsPortalId, hsSearchAll, type HsRecord } from '../hubspot';
import { instantlyAll, type InstantlyLead } from '../instantly';
import {
  dataSpace, FUNNEL, funnelStep, grainFor, isoDay, isPositiveReply, packSnapshot, toCompanyRow, toContactRow, unpackSnapshot,
  type CompanyRow, type HubspotSnapshot, type PackedSnapshot,
} from '../marketing';
import type { Filters } from '../filters';

const COMPANY_PROPS = [
  'name', 'domain', 'country', 'lifecyclestage', 'lead_sources', 'instantly_company_status',
  'instantly_last_contacted_at', 'instantly_any_contact_replied', 'wc_industry_bucket', 'company_priority_manual', 'createdate',
  'hs_v2_date_entered_opportunity', 'research_brief_link', 'instantly_last_reply_at',
];
const CONTACT_PROPS = [
  'country', 'associatedcompanyid', 'instantly_status', 'instantly_unsubscribed', 'instantly_campaign_name',
  'instantly_email_account', 'instantly_last_email_sent_at', 'instantly_last_replied_at',
];
const OUTBOUND = 'Leads for outbound';

/**
 * HubSpot ids of companies with a contact who replied positively in Instantly
 * (lead interest status Interested / Meeting booked / Meeting completed / Won).
 */
async function positiveReplyCompanies(): Promise<Set<string>> {
  const leads = await instantlyAll<InstantlyLead>('/leads/list', {}, 300, true);
  const emails = [...new Set(leads.filter(l => isPositiveReply(l.lt_interest_status)).map(l => l.email.toLowerCase()))];
  const ids = new Set<string>();
  for (let i = 0; i < emails.length; i += 100) {
    const r = await hubspot<{ results: HsRecord[] }>('/crm/v3/objects/contacts/search', {
      method: 'POST',
      body: {
        filterGroups: [{ filters: [{ propertyName: 'email', operator: 'IN', values: emails.slice(i, i + 100) }] }],
        properties: ['associatedcompanyid'],
        limit: 100,
      },
    });
    for (const c of r.results) if (c.properties.associatedcompanyid) ids.add(c.properties.associatedcompanyid);
  }
  return ids;
}

/**
 * Full read of HubSpot target companies and emailed contacts, reduced to compact rows.
 * Takes ~15s, so it is cached for an hour and refreshed in the background.
 */
async function snapshot(): Promise<HubspotSnapshot> {
  const [companyRecords, contactRecords, outboundContacts, portalId, positive] = await Promise.all([
    hsSearchAll('companies', [[{ propertyName: 'record_type', operator: 'EQ', value: OUTBOUND }]], COMPANY_PROPS),
    hsSearchAll(
      'contacts',
      [
        [{ propertyName: 'instantly_last_email_sent_at', operator: 'HAS_PROPERTY' }],
        [{ propertyName: 'instantly_status', operator: 'HAS_PROPERTY' }],
      ],
      CONTACT_PROPS,
      2,
    ),
    hsCount('contacts', [{ propertyName: 'contact_record_type', operator: 'EQ', value: OUTBOUND }]),
    hsPortalId(),
    positiveReplyCompanies(),
  ]);
  const contacts0 = dedupe(contactRecords);
  // Latest reply and latest email sent per company, from its contacts.
  const replyAt = new Map<string, string>();
  const sentAt = new Map<string, string>();
  const keepLatest = (m: Map<string, string>, id: string | null, at: string | null) => {
    if (id && at && at > (m.get(id) ?? '')) m.set(id, at);
  };
  for (const { properties: p } of contacts0) {
    keepLatest(replyAt, p.associatedcompanyid, p.instantly_last_replied_at);
    keepLatest(sentAt, p.associatedcompanyid, p.instantly_last_email_sent_at);
  }
  const companies = dedupe(companyRecords).map(r => toCompanyRow(r.id, r.properties, positive, replyAt.get(r.id), sentAt.get(r.id)));
  const byId = new Map<string, CompanyRow>(companies.map(c => [c.id, c]));
  const contacts = contacts0.map(r => toContactRow(r.properties, byId));
  return { companies, contacts, outboundContacts, portalId };
}

function dedupe(records: HsRecord[]) {
  const seen = new Set<string>();
  return records.filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

// Stored packed (shared value list + indices) to stay under Next's 2MB cache entry limit.
const packedSnapshot = cached('hubspot-snapshot-v7', 'hubspot', async (): Promise<PackedSnapshot> => packSnapshot(await snapshot()), 3600);

export async function getHubspotSnapshot(): Promise<{ data: HubspotSnapshot; fetchedAt: string }> {
  const r = await packedSnapshot();
  return { ...r, data: unpackSnapshot(r.data) };
}

export async function getDataSpace(f: Filters, extra: { step: string | null; source: string | null }) {
  const { data, fetchedAt } = await getHubspotSnapshot();
  const ds = dataSpace(data, {
    market: f.market,
    from: f.from ? isoDay(f.from) : null,
    prevFrom: f.prevFrom ? isoDay(f.prevFrom) : null,
    grain: grainFor(f.days),
    q: f.q,
    ...extra,
  });
  return { ...ds, portalId: data.portalId, fetchedAt };
}

/** Companies that landed in Supabase (GTM) and whether they reached HubSpot yet. */
async function syncStatus() {
  const [r] = await gtm<{ total: number; linked: number; waiting: number; new_30d: number; last_added: string | null; last_hs_read: string | null; last_researched: string | null }>(
    `SELECT count(*)::int AS total,
            count(hubspot_company_id)::int AS linked,
            (count(*) - count(hubspot_company_id))::int AS waiting,
            count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS new_30d,
            max(created_at)::text AS last_added,
            max(hs_read_at)::text AS last_hs_read,
            (SELECT max(researched_at)::text FROM research_briefs) AS last_researched
       FROM companies`,
  );
  return r;
}
export const getSyncStatus = cached('gtm-hubspot-sync-v2', 'pipeline', syncStatus);

export async function getCompanyDetail(id: string) {
  const r = await hsGet('companies', id, [
    ...COMPANY_PROPS, 'city', 'numberofemployees', 'industry', 'hs_lastmodifieddate', 'instantly_last_campaign_name',
    'instantly_last_reply_at', 'instantly_any_contact_replied', 'research_brief_link', 'linkedin_company_page', 'num_associated_contacts',
  ]);
  return r ? { id: r.id, p: r.properties, row: toCompanyRow(r.id, r.properties) } : null;
}

export async function exportDataCompanies(f: Filters) {
  const ds = await getDataSpace(f, { step: null, source: null });
  return ds.table.map(c => ({
    hubspot_id: c.id,
    company: c.name,
    domain: c.domain,
    market: c.market,
    status: FUNNEL.find(st => st.key === funnelStep(c))!.status,
    sources: c.sources.join('; '),
    industry: c.industry,
    priority: c.priority,
    created: c.created,
    last_contacted: c.contacted,
  }));
}
