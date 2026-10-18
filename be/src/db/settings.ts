import { sql, transactionPooler, type Sql } from './client';

/**
 * Run queries on one reserved connection after changing search options for it (e.g. how typo-tolerant
 * text search is, how wide a vector search looks).
 *
 * The options go out first and the queries right behind them in the same batch (pipelined): one network
 * round-trip instead of three for BEGIN / SET LOCAL / COMMIT. They stay set on that pooled connection
 * afterwards, so only use this for options that every query of that kind wants anyway.
 * Behind a transaction pooler a connection isn't ours between statements, so there it's a real transaction.
 */
export async function withSettings<T>(settings: Record<string, string>, fn: (db: Sql) => Promise<T>): Promise<T> {
  if (transactionPooler) {
    return sql.begin(async (tx) => {
      for (const [name, value] of Object.entries(settings)) await tx`select set_config(${name}, ${value}, true)`;
      return fn(tx as unknown as Sql);
    }) as Promise<T>;
  }
  const db = await sql.reserve();
  try {
    // .execute() sends them right now, ahead of the queries fn() starts.
    const applied = Object.entries(settings).map(([name, value]) => db`select set_config(${name}, ${value}, false)`.execute());
    const [, result] = await Promise.all([Promise.all(applied), fn(db)]);
    return result;
  } finally {
    db.release();
  }
}

/**
 * pgvector's HNSW index hands back only `hnsw.ef_search` neighbours (default 40) BEFORE our WHERE filters
 * run, so "the 250 most similar playable songs" needs a wider window.
 */
export const withVectorSearch = <T>(fn: (db: Sql) => Promise<T>) => withSettings({ 'hnsw.ef_search': '400' }, fn);
