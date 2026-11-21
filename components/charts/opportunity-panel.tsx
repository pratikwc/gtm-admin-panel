import { ExternalLink } from 'lucide-react';
import { fmtDate, fmtInt, fmtPct } from '@/lib/format';
import { LIFECYCLE, rate, type OpportunitySource } from '@/lib/marketing';
import type { OpportunitySummary } from '@/lib/queries/opportunities';
import { Panel } from './panel';
import { StatusChip, type ChipTone } from './status-chip';

const COLOR: Record<OpportunitySource, string> = { email: 'var(--viz-brand)', calling: 'var(--ord-2)' };
const TONE: Record<OpportunitySource, ChipTone> = { email: 'good', calling: 'info' };
const STAGE = Object.fromEntries(LIFECYCLE.map(s => [s.key, s.label])) as Record<string, string>;

/** Opportunities split into outbound email (positive Instantly reply) and calling. */
export function OpportunityPanel({
  data,
  portalId,
  list = false,
  className,
}: {
  data: OpportunitySummary | null;
  portalId?: string | null;
  list?: boolean;
  className?: string;
}) {
  const description =
    'Companies that became an Opportunity in HubSpot in the period. Outbound email only when a contact replied positively in Instantly (Interested or Meeting booked); every other opportunity counts as calling.';
  if (!data) {
    return (
      <Panel className={className} title="Opportunities by source" description={description}>
        <p className="text-sm text-muted-foreground">HubSpot or Instantly isn&rsquo;t answering right now.</p>
      </Panel>
    );
  }
  const shown = data.rows.slice(0, 50);
  return (
    <Panel className={className} title="Opportunities by source" description={description}>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground">Opportunities</div>
          <div className="tabular mt-1 text-2xl font-semibold tracking-tight">{fmtInt(data.total)}</div>
          <div className="tabular mt-1 text-[11px] text-muted-foreground">{fmtInt(data.allTime)} all time</div>
        </div>
        {data.sources.map(s => {
          const share = rate(s.value, data.total);
          return (
            <div key={s.key} className="rounded-lg border p-4" title={s.hint}>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2 w-2 rounded-full" style={{ background: COLOR[s.key] }} />
                {s.label}
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="tabular text-2xl font-semibold tracking-tight">{fmtInt(s.value)}</span>
                {share != null && <span className="tabular text-xs text-muted-foreground">{fmtPct(share, share < 0.1 ? 1 : 0)}</span>}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">{s.hint}</div>
            </div>
          );
        })}
      </div>

      {data.total > 0 && (
        <div className="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-[var(--viz-track)]">
          {data.sources.map(s => (
            <div key={s.key} className="h-2" style={{ width: `${(s.value / data.total) * 100}%`, background: COLOR[s.key] }} />
          ))}
        </div>
      )}

      {list && shown.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Company</th>
                <th className="py-2 pr-3 font-medium">Market</th>
                <th className="py-2 pr-3 font-medium">Stage now</th>
                <th className="py-2 pr-3 font-medium">Became opportunity</th>
                <th className="py-2 font-medium">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map(r => (
                <tr key={r.id}>
                  <td className="py-2 pr-3">
                    {portalId ? (
                      <a
                        href={`https://app.hubspot.com/contacts/${portalId}/record/0-2/${r.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-medium hover:text-primary"
                      >
                        {r.name} <ExternalLink className="h-3 w-3 opacity-50" />
                      </a>
                    ) : (
                      <span className="font-medium">{r.name}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">{r.market}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{STAGE[r.stage] ?? 'Other'}</td>
                  <td className="tabular py-2 pr-3 text-muted-foreground">{fmtDate(r.entered)}</td>
                  <td className="py-2">
                    <StatusChip tone={TONE[r.source]}>{r.source === 'email' ? 'Outbound email' : 'Calling'}</StatusChip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.rows.length > shown.length && (
            <p className="mt-2 text-xs text-muted-foreground">Showing the newest {shown.length} of {fmtInt(data.rows.length)}.</p>
          )}
        </div>
      )}
    </Panel>
  );
}
