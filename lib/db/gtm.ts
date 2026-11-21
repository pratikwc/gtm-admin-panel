import 'server-only';
import { env } from '@/lib/env';
import { makeQueryer } from './pool';

/** Outbound / GTM Supabase project (scraped LinkedIn jobs, companies, contacts, Instantly). */
export const gtm = makeQueryer('gtm', env.gtmDbUrl);
