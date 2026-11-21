import { Banner } from './freshness';

/** Shown when an external source (HubSpot, Instantly) can't be read; the rest of the page still renders. */
export function SourceBanner({ source, error }: { source: string; error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  const auth = /\b(401|403)\b/.test(message);
  return (
    <Banner tone="bad" title={`Couldn't read ${source}${auth ? ' (access denied)' : ''}`}>
      {auth
        ? `The ${source} key in the environment variables is missing, expired or lacks read access. Numbers from ${source} are hidden until it works again.`
        : `${message}. Numbers from ${source} are hidden; press Refresh to try again.`}
    </Banner>
  );
}
