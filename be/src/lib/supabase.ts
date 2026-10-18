import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';

/**
 * Admin client (secret key): full access to Storage and Auth admin APIs.
 * Lives only on the server. Database queries do NOT go through it — they use `sql` (db/client.ts).
 */
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
