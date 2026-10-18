import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request database statistics. In development every request log line ends with "N queries":
 * each query is a network round-trip to Supabase, so a high number means "batch or parallelise these".
 */
export interface QueryStats {
  queries: number;
}

export const queryStats = new AsyncLocalStorage<QueryStats>();
