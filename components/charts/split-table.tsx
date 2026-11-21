import { fmtInt } from '@/lib/format';

export interface SplitColumn {
  key: string;
  label: string;
  color: string;
}

export interface SplitRow {
  label: string;
  hint?: string;
  values: Record<string, number>;
}

/**
 * A small cross-tab: one row per bucket, one column per state, with a thin
 * stacked bar so the mix is visible at a glance. Every number is also shown
 * as text, so colour never carries the meaning alone.
 */
export function SplitTable({ columns, rows, rowHeader }: { columns: SplitColumn[]; rows: SplitRow[]; rowHeader: string }) {
  const totals = Object.fromEntries(columns.map(c => [c.key, rows.reduce((a, r) => a + (r.values[c.key] ?? 0), 0)]));
  const grand = Object.values(totals).reduce((a, b) => a + b, 0);
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="px-1 pb-2 text-left font-medium">{rowHeader}</th>
            <th className="w-[28%] px-2 pb-2 text-left font-medium"><span className="sr-only">Mix</span></th>
            {columns.map(c => (
              <th key={c.key} className="px-2 pb-2 text-right font-medium">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: c.color }} aria-hidden />
                  {c.label}
                </span>
              </th>
            ))}
            <th className="px-1 pb-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const total = columns.reduce((a, c) => a + (r.values[c.key] ?? 0), 0);
            return (
              <tr key={r.label} className="border-b last:border-0">
                <td className="px-1 py-2.5">
                  <div className="font-medium">{r.label}</div>
                  {r.hint && <div className="text-xs text-muted-foreground">{r.hint}</div>}
                </td>
                <td className="px-2 py-2.5">
                  <div className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-[var(--viz-track)]">
                    {total > 0 &&
                      columns.map(c =>
                        r.values[c.key] ? (
                          <div
                            key={c.key}
                            className="h-2 first:rounded-l-full last:rounded-r-full"
                            style={{ width: `${(r.values[c.key] / total) * 100}%`, background: c.color }}
                            title={`${c.label}: ${fmtInt(r.values[c.key])}`}
                          />
                        ) : null,
                      )}
                  </div>
                </td>
                {columns.map(c => (
                  <td key={c.key} className={`tabular px-2 py-2.5 text-right ${r.values[c.key] ? '' : 'text-muted-foreground'}`}>
                    {fmtInt(r.values[c.key] ?? 0)}
                  </td>
                ))}
                <td className="tabular px-1 py-2.5 text-right font-medium">{fmtInt(total)}</td>
              </tr>
            );
          })}
          <tr className="text-xs text-muted-foreground">
            <td className="px-1 pt-2.5 font-medium">Total</td>
            <td />
            {columns.map(c => (
              <td key={c.key} className="tabular px-2 pt-2.5 text-right">{fmtInt(totals[c.key])}</td>
            ))}
            <td className="tabular px-1 pt-2.5 text-right font-medium">{fmtInt(grand)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
