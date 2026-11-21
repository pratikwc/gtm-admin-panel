import 'server-only';
import { unstable_cache } from 'next/cache';

export const REVALIDATE_SECONDS = 600;
export type CacheTag = 'outbound' | 'published' | 'applications' | 'pipeline';

/** Cache a query result for 10 minutes. Dates survive the JSON round-trip as ISO strings. */
export function cached<A extends unknown[], R>(key: string, tag: CacheTag, fn: (...args: A) => Promise<R>) {
  return unstable_cache(
    async (...args: A) => ({ data: await fn(...args), fetchedAt: new Date().toISOString() }),
    [key],
    { revalidate: REVALIDATE_SECONDS, tags: [tag, 'all'] },
  );
}
