/**
 * Social logins switched on in the Supabase dashboard (Authentication → Providers), optionally narrowed by
 * OAUTH_PROVIDERS in be/.env. Asking Supabase first means we never show a "Continue with Google"
 * button that would only end on Supabase's "Unsupported provider: provider is not enabled" page.
 */
import { env } from '../../config/env';

export type OAuthProvider = 'google' | 'facebook' | 'apple';
const ALL: OAuthProvider[] = ['google', 'facebook', 'apple'];
/** OAUTH_PROVIDERS is an optional allow-list; empty = every provider switched on in Supabase. */
const allowed = (): OAuthProvider[] => (env.OAUTH_PROVIDERS.length ? env.OAUTH_PROVIDERS : ALL);

const TTL_MS = 5 * 60_000;
const RETRY_MS = 60_000;
let cache: { until: number; value: OAuthProvider[] } | null = null;

export async function enabledOAuthProviders(): Promise<OAuthProvider[]> {
  if (cache && Date.now() < cache.until) return cache.value;
  try {
    // Public endpoint: the publishable key is enough, and the answer has no secrets in it.
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const settings = (await res.json()) as { external?: Partial<Record<string, boolean>> };
    const value = allowed().filter((p) => settings.external?.[p] === true);
    cache = { until: Date.now() + TTL_MS, value };
    return value;
  } catch {
    // Supabase unreachable (or the offline emulator): only an explicit list is trusted; ask again soon.
    cache = { until: Date.now() + RETRY_MS, value: env.OAUTH_PROVIDERS };
    return env.OAUTH_PROVIDERS;
  }
}
