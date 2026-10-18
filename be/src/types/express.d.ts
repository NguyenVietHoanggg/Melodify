import type { SupabaseClient } from '@supabase/supabase-js';
import type { QueryStats } from '../db/stats';

declare global {
  namespace Express {
    interface Request {
      /** Authenticated user id (JWT `sub`), null for anonymous visitors. Set by the session middleware. */
      userId: string | null;
      /** Request-scoped Supabase client bound to this request's auth cookies. */
      supabase: SupabaseClient;
      /** Device that sent the request (X-Device-Id header), used by the player. */
      deviceId: string | null;
      /** Database round-trips made while handling this request (development logs). */
      dbStats?: QueryStats;
    }
  }
}

export {};
