import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import { makeQueryer } from './pool';

/** Jobs Duniya Supabase project (published jobs, companies, chat_interactions). */
export const jd = makeQueryer('jd', env.jdDbUrl);

/** Service-role client, used ONLY to sign private resume URLs. Never sent to the browser. */
export function jdStorage() {
  return createClient(env.jdUrl(), env.jdServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage;
}
