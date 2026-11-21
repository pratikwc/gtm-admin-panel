import 'server-only';
import { Pool, type QueryResultRow } from 'pg';

/**
 * Read-only Postgres pools. Supabase's pooler ignores startup `options`, so
 * read-only is enforced per query instead: every query runs inside its own
 * `BEGIN READ ONLY` transaction with a local statement timeout. That works
 * with both the session pooler (:5432) and the transaction pooler (:6543),
 * and the panel can never write to either project even if a query is wrong.
 */
const globalPools = globalThis as unknown as { __wcPools?: Map<string, Pool> };
const pools = (globalPools.__wcPools ??= new Map<string, Pool>());

export function getPool(name: string, connectionString: string): Pool {
  let pool = pools.get(name);
  if (!pool) {
    pool = new Pool({
      connectionString,
      // A page fires ~10-15 aggregates at once. With few slots, the rest wait
      // in the pool's queue, and that wait counts against
      // connectionTimeoutMillis, so keep it generous. Opening a connection
      // costs ~2s (TLS to Sydney / Ohio), so keep idle ones around.
      max: 6,
      idleTimeoutMillis: 300_000,
      connectionTimeoutMillis: 30_000,
      keepAlive: true,
      ssl: { rejectUnauthorized: false },
      application_name: 'wc-admin-panel',
    });
    pool.on('error', (err: Error) => console.error(`[db:${name}] idle client error`, err.message));
    pools.set(name, pool);
  }
  return pool;
}

const STATEMENT_TIMEOUT_MS = 20_000;

export type Queryer = <T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]) => Promise<T[]>;

export function makeQueryer(name: string, url: () => string): Queryer {
  return async (sql, params = []) => {
    const t0 = Date.now();
    const client = await getPool(name, url()).connect();
    let res;
    try {
      await client.query(`BEGIN READ ONLY; SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
      res = await client.query(sql, params);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    const ms = Date.now() - t0;
    if (ms > 2000) console.warn(`[db:${name}] slow query ${ms}ms: ${sql.slice(0, 80).replace(/\s+/g, ' ')}`);
    return res.rows;
  };
}
