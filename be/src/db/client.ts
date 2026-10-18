import postgres from 'postgres';
import { env, isDev } from '../config/env';
import { queryStats } from './stats';

/**
 * Supabase's *transaction* pooler (port 6543) may run each query on a different server connection,
 * so it can't keep prepared statements. The session pooler (port 5432) and direct connections can.
 */
export const transactionPooler = /:6543(\/|$)/.test(env.DATABASE_URL) || /[?&]pgbouncer=true/i.test(env.DATABASE_URL);

/**
 * One shared connection pool for the whole backend.
 *
 * - `transform: postgres.camel` → snake_case columns come back as camelCase properties.
 * - `prepare`                   → prepared statements cost 1 network round-trip per query instead of 2, and
 *                                 let queries sent together (Promise.all) travel in one batch ("pipelining").
 *                                 With a database far away (Supabase region ≠ your machine) that halves
 *                                 the latency of every API call.
 * - int8 (bigint) is returned as a JS number: our counters stay far below 2^53.
 * - `date` stays a 'YYYY-MM-DD' string: turning it into a JS Date would shift it by the server's timezone.
 */
export const sql = postgres(env.DATABASE_URL, {
  prepare: !transactionPooler,
  // A few connections are plenty: queries beyond that are pipelined onto busy ones, and every new connection
  // has to prepare its statements again. A busy production server can raise DB_POOL_MAX (e.g. 20).
  // PGlite (local testing) is single-session: .env.localdb sets DB_POOL_MAX=1 so queries never interleave.
  max: Number(process.env.DB_POOL_MAX ?? 5),
  // Opening a connection to a far-away database costs ~0.5 s (TCP + TLS + login), so keep idle ones a while.
  idle_timeout: 300,
  connect_timeout: 15,
  transform: postgres.camel,
  onnotice: () => {},
  // Development only: count the queries of the current request (shown in the request log).
  debug: isDev
    ? () => {
        const stats = queryStats.getStore();
        if (stats) stats.queries++;
      }
    : undefined,
  types: {
    bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
    date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
  },
});

export type Sql = typeof sql;

/** A reusable piece of SQL (sql`...` that is embedded in another query instead of being awaited). */
export type Fragment = postgres.Fragment;
