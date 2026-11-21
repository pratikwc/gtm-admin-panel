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
};
