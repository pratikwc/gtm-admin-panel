import { getJdApiStatus } from '@/lib/queries/pipeline';
import { Banner } from './freshness';

/** Shown when the Jobs Duniya Supabase REST API (used by the public site) is failing. */
export async function JdApiBanner() {
  const { data } = await getJdApiStatus();
  if (data.ok) return null;
  const quota = data.status === 402 || /egress_quota/i.test(data.message ?? '');
  return (
    <Banner tone="bad" title={quota ? 'Jobs Duniya’s Supabase API is restricted (egress quota exceeded)' : `Jobs Duniya’s Supabase API is failing (${data.status ?? 'no response'})`}>
      {quota
        ? 'Supabase has paused API access for the Jobs Duniya project. The public site’s search, application form and resume uploads use that API, so they are likely failing for candidates right now. Upgrade the plan or lift the spend cap to restore it. This panel still works because it reads the database directly, but resume downloads are unavailable.'
        : data.message}
    </Banner>
  );
}
