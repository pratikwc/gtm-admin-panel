import 'server-only';

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}. See .env.example.`);
  return v;
}

export const env = {
  gtmDbUrl: () => req('GTM_SUPABASE_DB_URL'),
  jdDbUrl: () => req('JD_SUPABASE_DB_URL'),
  jdUrl: () => req('JD_SUPABASE_URL'),
  jdServiceKey: () => req('JD_SUPABASE_SERVICE_ROLE_KEY'),
  jdSiteUrl: () => (process.env.JD_SITE_URL || 'https://www.jobsduniya.ae').replace(/\/+$/, ''),
  hubspotToken: () => req('HUBSPOT_ACCESS_TOKEN'),
  /** The key was first added as lowercase `instantly_api_key`; accept either spelling. */
  instantlyKey: () => process.env.INSTANTLY_API_KEY || req('instantly_api_key'),
  /** HubSpot portal id, only used to build "Open in HubSpot" links. */
  hubspotPortalId: () => process.env.HUBSPOT_PORTAL_ID || null,
};
