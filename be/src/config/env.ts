import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

// Node ≥ 20.12 reads .env files natively — no dotenv dependency needed.
// ENV_FILE lets you point at another file; the --local-db flag is a shortcut for ENV_FILE=.env.localdb
// (the offline PGlite database + Storage emulator, see docs/03-chay-du-an.md).
const envFile = process.env.ENV_FILE ?? (process.argv.includes('--local-db') ? '.env.localdb' : '.env');
for (const candidate of [path.resolve(process.cwd(), envFile), path.resolve(import.meta.dirname, '../..', envFile)]) {
  if (fs.existsSync(candidate)) {
    process.loadEnvFile(candidate);
    break;
  }
}

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.url().default('http://localhost:5173'),
  APP_NAME: z.string().min(1).default('Melodify'),

  // Some dashboard pages show the REST endpoint (…supabase.co/rest/v1/); the client libraries need the base URL.
  SUPABASE_URL: z
    .url({ message: 'SUPABASE_URL phải là URL dạng https://<ref>.supabase.co' })
    .transform((v) => v.trim().replace(/\/(rest|auth|storage)\/v1\/?$/i, '').replace(/\/+$/, '')),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20, 'Thiếu SUPABASE_PUBLISHABLE_KEY'),
  SUPABASE_SECRET_KEY: z.string().min(20, 'Thiếu SUPABASE_SECRET_KEY'),
  SUPABASE_JWT_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL phải bắt đầu bằng postgresql://')
    .refine((v) => !v.includes('[YOUR-PASSWORD]'), 'Hãy thay [YOUR-PASSWORD] trong DATABASE_URL bằng mật khẩu DB'),

  /** Optional allow-list of social logins, e.g. "google,facebook". Empty = all those enabled in Supabase. */
  OAUTH_PROVIDERS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((s) => s.trim().toLowerCase()).filter((s): s is 'google' | 'facebook' | 'apple' => ['google', 'facebook', 'apple'].includes(s))),

  GEMINI_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  /** Fast and reliable for turning a request into playlist parameters (~1–2 s). */
  GEMINI_MODEL: z.string().default('gemini-flash-lite-latest'),
  /** Tried once when the main model is overloaded or times out; empty = no backup. */
  GEMINI_FALLBACK_MODEL: z.string().default('gemini-flash-latest'),
  AUDIUS_APP_NAME: z.string().default('melodify_learning'),

  /**
   * LOCAL TESTING ONLY: act as this user without logging in. Honoured only when NODE_ENV=development
   * AND the database is on this machine (see modules/auth/session.ts). Leave empty with real Supabase.
   */
  LOCAL_DEV_USER_ID: z.preprocess(emptyToUndefined, z.guid().optional()),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (parsed.success) return parsed.data;
  console.error('\n❌ File be/.env chưa đúng — xem hướng dẫn ở docs/02-cai-dat-supabase-va-gemini.md\n');
  for (const issue of parsed.error.issues) console.error(`   • ${issue.path.join('.')}: ${issue.message}`);
  console.error('');
  process.exit(1);
}

export const env = load();
export const isDev = env.NODE_ENV === 'development';

/** The fake local user is only ever allowed in development against a database on this very machine. */
export const localDevUserId =
  isDev && env.LOCAL_DEV_USER_ID && /@(127\.0\.0\.1|localhost)[:/]/.test(env.DATABASE_URL) ? env.LOCAL_DEV_USER_ID : null;
if (localDevUserId) console.warn(`⚠️  LOCAL_DEV_USER_ID is active: every request acts as user ${localDevUserId} (local testing only)`);
