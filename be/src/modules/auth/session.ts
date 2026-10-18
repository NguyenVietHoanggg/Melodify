import type { CookieOptions, NextFunction, Request, RequestHandler, Response } from 'express';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env, isDev, localDevUserId } from '../../config/env';

/**
 * BFF ("Backend For Frontend") authentication.
 *
 * The browser never sees a token: Supabase's session lives in httpOnly cookies that JavaScript cannot read,
 * so even an XSS bug cannot steal it. Each request gets its own Supabase client bound to the request's
 * cookies; if the access token has expired, the client refreshes it and we write the new cookies back.
 * Mobile apps (no cookies) send `Authorization: Bearer <access token>` instead — both paths end up here.
 */
export function createRequestClient(req: Request, res: Response): SupabaseClient {
  return createServerClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return Object.entries(req.cookies ?? {}).map(([name, value]) => ({ name, value: String(value) }));
      },
      setAll(cookiesToSet, headers) {
        if (res.headersSent) return;
        for (const [key, value] of Object.entries(headers ?? {})) res.setHeader(key, value);
        for (const { name, value, options } of cookiesToSet) {
          const opts: CookieOptions = {
            path: options.path ?? '/',
            sameSite: 'lax',
            httpOnly: true, // the whole point of the BFF: tokens are invisible to JavaScript
            secure: !isDev,
          };
          // The `cookie` library counts maxAge in SECONDS, Express in MILLISECONDS.
          if (options.maxAge !== undefined) opts.maxAge = options.maxAge * 1000;
          if (options.expires) opts.expires = options.expires;
          if (options.domain) opts.domain = options.domain;
          res.cookie(name, value, opts);
        }
      },
    },
  });
}

// Verified tokens are cached until they expire, so we don't re-verify on every request.
const verified = new Map<string, { sub: string; exp: number }>();

async function verifyToken(client: SupabaseClient, token: string): Promise<string | null> {
  const now = Date.now() / 1000;
  const hit = verified.get(token);
  if (hit && hit.exp > now) return hit.sub;
  const { data, error } = await client.auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  verified.set(token, { sub: data.claims.sub, exp: data.claims.exp });
  if (verified.size > 10_000) verified.delete(verified.keys().next().value as string);
  return data.claims.sub;
}

const hasAuthCookie = (req: Request) =>
  Object.keys(req.cookies ?? {}).some((name) => name.startsWith('sb-') && name.includes('-auth-token'));

export const sessionMiddleware: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  req.supabase = createRequestClient(req, res);
  req.userId = null;
  req.deviceId = req.header('x-device-id')?.slice(0, 64) ?? null;
  if (localDevUserId) {
    req.userId = localDevUserId;
    return next();
  }

  let token = req.header('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token && hasAuthCookie(req)) {
    // Reads the session from cookies and refreshes it when the access token has expired.
    const { data } = await req.supabase.auth.getSession();
    token = data.session?.access_token;
  }
  if (token) req.userId = await verifyToken(req.supabase, token);
  next();
};

/** True when the caller is a native app that wants tokens in the response body instead of cookies. */
export const isTokenClient = (req: Request) => req.header('x-client') === 'mobile';
