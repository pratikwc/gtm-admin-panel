import 'server-only';
import { unstable_cache } from 'next/cache';

export const REVALIDATE_SECONDS = 600;
export type CacheTag = 'outbound' | 'published' | 'applications' | 'pipeline' | 'hubspot' | 'email';

/**
 * Cache a result (10 minutes by default). Dates survive the JSON round-trip as ISO strings.
 * Next serves the stale entry while it refetches in the background, so slow sources
 * (the full HubSpot read) only block the very first visitor.
 */
export function cached<A extends unknown[], R>(key: string, tag: CacheTag, fn: (...args: A) => Promise<R>, revalidate = REVALIDATE_SECONDS) {
  return unstable_cache(
    async (...args: A) => ({ data: await fn(...args), fetchedAt: new Date().toISOString() }),
    [key],
    { revalidate, tags: [tag, 'all'] },
  );
}
