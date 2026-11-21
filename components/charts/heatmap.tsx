import { EmptyState } from './panel';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// One-hue ordinal ramp (blue), light -> dark. Empty cells use the track colour.
const RAMP = ['var(--ord-1)', 'var(--ord-2)', 'var(--ord-3)', 'var(--ord-4)', 'var(--ord-5)'];

/** Weekday x hour grid of counts. Sequential single hue; exact value in each cell's tooltip. */
export function Heatmap({ matrix, tzLabel }: { matrix: number[][]; tzLabel: string }) {
  const max = Math.max(0, ...matrix.flat());
  if (max === 0) return <EmptyState>No submissions in this period.</EmptyState>;
  const step = (v: number) => (v === 0 ? null : RAMP[Math.min(RAMP.length - 1, Math.floor((v / max) * RAMP.length - 1e-9))]);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-separate" style={{ borderSpacing: 2 }}>
          <thead>
            <tr>
              <th className="w-9" />
              {Array.from({ length: 24 }, (_, h) => (
                <th key={h} className="pb-1 text-center text-[10px] font-normal text-muted-foreground tabular">
                  {h % 3 === 0 ? String(h).padStart(2, '0') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, d) => (
              <tr key={d}>
                <th scope="row" className="pr-1 text-left text-[11px] font-normal text-muted-foreground">{DAYS[d]}</th>
                {row.map((v, h) => (
                  <td
                    key={h}
                    title={`${DAYS[d]} ${String(h).padStart(2, '0')}:00–${String(h).padStart(2, '0')}:59 · ${v} submission${v === 1 ? '' : 's'}`}
                    className="h-5 rounded-[3px]"
                    style={{ background: step(v) ?? 'var(--viz-track)' }}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Hours in {tzLabel}</span>
        <span className="flex items-center gap-1.5">
          Fewer
          {RAMP.map(c => <span key={c} className="h-2.5 w-4 rounded-sm" style={{ background: c }} />)}
          More (max {max})
        </span>
      </div>
    </div>
  );
}
