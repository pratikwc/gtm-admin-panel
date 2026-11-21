import 'server-only';
import { cached } from '../cache';
import { hubspot, hsSearchAll, type HsRecord } from '../hubspot';
import { instantlyAll, type InstantlyLead } from '../instantly';
import { emailDomain, isPositiveReply, isoDay, opportunitySummary, toOpportunityRow, type OpportunityRow, type PositiveReplies } from '../marketing';
import type { Filters } from '../filters';

const PROPS = ['name', 'domain', 'country', 'lifecyclestage', 'record_type', 'hs_v2_date_entered_opportunity'];

/** Companies whose contacts replied positively in Instantly, by HubSpot company id and by email domain. */
async function positiveReplies(): Promise<PositiveReplies> {
  const leads = await instantlyAll<InstantlyLead>('/leads/list', {}, 300, true);
  const emails = [...new Set(leads.filter(l => isPositiveReply(l.lt_interest_status)).map(l => l.email.toLowerCase()))];
  const domains = new Set(emails.map(emailDomain).filter(Boolean));
  const companyIds = new Set<string>();
  for (let i = 0; i < emails.length; i += 100) {
    const r = await hubspot<{ results: HsRecord[] }>('/crm/v3/objects/contacts/search', {
      method: 'POST',
      body: {
        filterGroups: [{ filters: [{ propertyName: 'email', operator: 'IN', values: emails.slice(i, i + 100) }] }],
        properties: ['associatedcompanyid'],
        limit: 100,
      },
    });
    for (const c of r.results) if (c.properties.associatedcompanyid) companyIds.add(c.properties.associatedcompanyid);
  }
  return { companyIds, domains };
}

/** Every company that has ever been an Opportunity in HubSpot, with where it came from. */
async function load(): Promise<OpportunityRow[]> {
  const [records, positive] = await Promise.all([
    hsSearchAll('companies', [[{ propertyName: 'hs_v2_date_entered_opportunity', operator: 'HAS_PROPERTY' }]], PROPS, 1),
    positiveReplies(),
  ]);
  return records
    .filter(r => r.properties.record_type !== 'Inv record')
    .map(r => toOpportunityRow(r.id, r.properties, positive));
}

const opportunitiesCached = cached('opportunities-v1', 'hubspot', load, 3600);

export async function getOpportunities(f: Filters) {
  const r = await opportunitiesCached();
  return { ...opportunitySummary(r.data, { market: f.market, from: f.from ? isoDay(f.from) : null }), fetchedAt: r.fetchedAt };
}
export type OpportunitySummary = Awaited<ReturnType<typeof getOpportunities>>;
