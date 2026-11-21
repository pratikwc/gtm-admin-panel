import { hsCount } from '@/lib/hubspot';
import { instantly } from '@/lib/instantly';
import { NextResponse } from 'next/server';
import { gtm } from '@/lib/db/gtm';
import { jd } from '@/lib/db/jd';
import { requireViewer } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Checks both pools reach the right project and are read-only.
 * GTM must have job_scan_runs; JD must have chat_interactions.
 */
export async function GET() {
  if (!(await requireViewer())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // A write that touches zero rows even if it were allowed; Postgres rejects it
  // up front inside a read-only transaction, which proves writes are blocked.
  const writeBlocked = async (q: typeof gtm, sql: string) => {
    try {
      await q(sql);
      return false;
    } catch (e) {
      return /read-only transaction/i.test((e as Error).message);
    }
  };
  const probe = async (name: string, q: typeof gtm, table: string, noopWrite: string) => {
    const t0 = Date.now();
    try {
      const [r] = await q<{ ok: boolean; ro: string }>(
        `SELECT to_regclass($1) IS NOT NULL AS ok, current_setting('transaction_read_only') AS ro`,
        [`public.${table}`],
      );
      const blocked = await writeBlocked(q, noopWrite);
      return { name, reachable: true, rightProject: r.ok, readOnly: r.ro === 'on' && blocked, ms: Date.now() - t0 };
    } catch (e) {
      return { name, reachable: false, error: (e as Error).message, ms: Date.now() - t0 };
    }
  };
  const results = await Promise.all([
    probe('gtm', gtm, 'job_scan_runs', 'UPDATE job_scan_runs SET notes = notes WHERE false'),
    probe('jd', jd, 'chat_interactions', 'UPDATE chat_interactions SET name = name WHERE false'),
  ]);
  // External read-only APIs: just "does the key work".
  const api = async (name: string, fn: () => Promise<unknown>) => {
    const t0 = Date.now();
    try {
      await fn();
      return { name, reachable: true, ms: Date.now() - t0 };
    } catch (e) {
      return { name, reachable: false, error: (e as Error).message, ms: Date.now() - t0 };
    }
  };
  const apis = await Promise.all([
    api('hubspot', () => hsCount('companies', [{ propertyName: 'record_type', operator: 'HAS_PROPERTY' }])),
    api('instantly', () => instantly('/campaigns', { limit: 1 })),
  ]);
  const ok = results.every(r => r.reachable && 'rightProject' in r && r.rightProject && r.readOnly) && apis.every(a => a.reachable);
  return NextResponse.json({ ok, results: [...results, ...apis] }, { status: ok ? 200 : 503 });
}
