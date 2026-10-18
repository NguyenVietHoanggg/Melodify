import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { AuthError, Session } from '@supabase/supabase-js';
import { z } from 'zod';
import { env } from '../../config/env';
import { sql } from '../../db/client';
import { badRequest, HttpError, parse, requireUser, tooMany, unauthorized } from '../../lib/http';
import { birthDate, email, text } from '../../lib/validation';
import { GENDERS, MIN_AGE, PASSWORD_RULES, ageOn, passwordProblems } from './policy';
import { enabledOAuthProviders } from './providers';
import { isTokenClient } from './session';
import { getMe } from '../users/service';

export const authRouter = Router();

// Brute-force protection for everything that checks a secret or sends an email.
const sensitive = rateLimit({ windowMs: 10 * 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });

/** Map Supabase Auth errors to our stable error codes (the UI translates them). */
function authFailure(error: AuthError): HttpError {
  const code = error.code ?? 'auth_error';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return tooMany(code);
  if (code === 'invalid_credentials' || code === 'otp_expired' || code === 'bad_jwt') return new HttpError(401, code);
  return badRequest(code, error.message);
}

/** Web: cookies are already set by the request client. Mobile: return the tokens in the body. */
async function respondWithSession(req: Request, res: Response, session: Session | null) {
  if (!session) throw unauthorized('no_session');
  const me = await getMe(session.user.id, req);
  if (isTokenClient(req)) {
    res.json({
      me,
      tokens: { accessToken: session.access_token, refreshToken: session.refresh_token, expiresAt: session.expires_at },
    });
  } else {
    res.json({ me });
  }
}


authRouter.get('/policy', async (_req, res) => {
  res.json({ passwordRules: PASSWORD_RULES, minAge: MIN_AGE, genders: GENDERS, oauthProviders: await enabledOAuthProviders() });
});

/** Step 1 of sign-up: "This address is already linked to an existing account". */
authRouter.post('/email-status', sensitive, async (req, res) => {
  const body = parse(z.object({ email }), req.body);
  const [row] = await sql<{ exists: boolean }[]>`
    select exists(select 1 from auth.users where lower(email) = ${body.email}) as exists`;
  res.json({ exists: row?.exists ?? false });
});

const signupSchema = z.object({
  email,
  password: z.string().max(72),
  displayName: text(1, 60),
  birthDate,
  gender: z.enum(GENDERS),
  marketingOptIn: z.boolean().default(false),
  locale: z.enum(['vi', 'en']).default('vi'),
});

authRouter.post('/signup', sensitive, async (req, res) => {
  const body = parse(signupSchema, req.body);
  const problems = passwordProblems(body.password);
  if (problems.length) throw badRequest('weak_password', undefined, { rules: problems });
  if (ageOn(body.birthDate) < MIN_AGE) throw badRequest('too_young', undefined, { minAge: MIN_AGE });

  const { data, error } = await req.supabase.auth.signUp({
    email: body.email,
    password: body.password,
    options: {
      emailRedirectTo: env.WEB_ORIGIN,
      data: {
        display_name: body.displayName,
        birth_date: body.birthDate,
        gender: body.gender,
        marketing_opt_in: body.marketingOptIn,
        locale: body.locale,
      },
    },
  });
  if (error) throw authFailure(error);
  // With "Confirm email" disabled Supabase signs the user in immediately.
  if (!data.session) {
    res.status(202).json({ needsEmailConfirmation: true });
    return;
  }
  await respondWithSession(req, res, data.session);
});

authRouter.post('/login', sensitive, async (req, res) => {
  const body = parse(z.object({ email, password: z.string().min(1).max(72) }), req.body);
  const { data, error } = await req.supabase.auth.signInWithPassword(body);
  if (error) throw authFailure(error);
  await respondWithSession(req, res, data.session);
});

/** "Log in without password": email a 6-digit code. */
authRouter.post('/otp/send', sensitive, async (req, res) => {
  const body = parse(z.object({ email }), req.body);
  const { error } = await req.supabase.auth.signInWithOtp({ email: body.email, options: { shouldCreateUser: false } });
  if (error) throw authFailure(error);
  res.json({ sent: true });
});

authRouter.post('/otp/verify', sensitive, async (req, res) => {
  const body = parse(z.object({ email, token: z.string().regex(/^\d{6,8}$/) }), req.body);
  const { data, error } = await req.supabase.auth.verifyOtp({ email: body.email, token: body.token, type: 'email' });
  if (error) throw authFailure(error);
  await respondWithSession(req, res, data.session);
});

authRouter.post('/password/forgot', sensitive, async (req, res) => {
  const body = parse(z.object({ email }), req.body);
  const { error } = await req.supabase.auth.resetPasswordForEmail(body.email, {
    redirectTo: `${env.WEB_ORIGIN}/api/auth/callback?next=/password-reset`,
  });
  if (error) throw authFailure(error);
  res.json({ sent: true }); // same answer whether the email exists or not (no account enumeration)
});

authRouter.post('/password/update', sensitive, async (req, res) => {
  requireUser(req);
  const body = parse(z.object({ password: z.string().max(72) }), req.body);
  const problems = passwordProblems(body.password);
  if (problems.length) throw badRequest('weak_password', undefined, { rules: problems });
  const { error } = await req.supabase.auth.updateUser({ password: body.password });
  if (error) throw authFailure(error);
  res.json({ updated: true });
});

/** Social login: redirect the browser to Google; Supabase sends it back to /callback with a code (PKCE). */
authRouter.get('/oauth/:provider', async (req, res) => {
  const { provider } = parse(z.object({ provider: z.enum(['google', 'facebook', 'apple']) }), req.params);
  if (!(await enabledOAuthProviders()).includes(provider)) {
    res.redirect(`${env.WEB_ORIGIN}/login?error=oauth_unavailable`);
    return;
  }
  const { data, error } = await req.supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${env.WEB_ORIGIN}/api/auth/callback`, skipBrowserRedirect: true },
  });
  if (error || !data.url) throw error ? authFailure(error) : badRequest('oauth_unavailable');
  res.redirect(data.url);
});

authRouter.get('/callback', async (req, res) => {
  // Only paths on our own site ("/x", never "//other.site") — no open redirect.
  const { code, next } = parse(z.object({ code: z.string().max(200).optional(), next: z.string().max(500).regex(/^\/(?!\/)/).optional() }), req.query);
  if (code) {
    const { error } = await req.supabase.auth.exchangeCodeForSession(code);
    if (error) {
      res.redirect(`${env.WEB_ORIGIN}/login?error=${encodeURIComponent(error.code ?? 'oauth_failed')}`);
      return;
    }
  }
  res.redirect(`${env.WEB_ORIGIN}${next ?? '/'}`);
});

/** Mobile apps refresh their own tokens. */
authRouter.post('/refresh', async (req, res) => {
  const body = parse(z.object({ refreshToken: z.string().min(10) }), req.body);
  const { data, error } = await req.supabase.auth.refreshSession({ refresh_token: body.refreshToken });
  if (error) throw authFailure(error);
  await respondWithSession(req, res, data.session);
});

authRouter.post('/logout', async (req, res) => {
  await req.supabase.auth.signOut();
  res.json({ ok: true });
});

/** Called by the web app on start-up: who am I (or nobody)? */
authRouter.get('/session', async (req, res) => {
  res.json({ me: req.userId ? await getMe(req.userId, req) : null });
});
