/**
 * Runs every migration against an in-memory Postgres (PGlite, Postgres compiled to WebAssembly) and then
 * exercises the triggers/functions. Catches SQL mistakes locally before they ever touch the cloud DB.
 *
 *   npm run db:check -w be
 */
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { vector } from '@electric-sql/pglite-pgvector';

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../../supabase/migrations');

const db = await PGlite.create({ extensions: { pg_trgm, unaccent, vector } });

// Minimal stand-ins for what a Supabase project already contains.
await db.exec(`
  create schema if not exists extensions;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create role anon;
  create role authenticated;
`);

let failed = false;
for (const file of fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
  try {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
    console.log('✓', file);
  } catch (err) {
    failed = true;
    console.error('✗', file, '\n   ', (err as Error).message);
    break;
  }
}
if (failed) process.exit(1);

// ── Smoke tests for triggers & functions ──────────────────────────────────────
const one = async <T>(q: string, params: unknown[] = []) => (await db.query<T>(q, params)).rows[0] as T;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(ok ? '  ✓' : '  ✗', label, ok ? '' : JSON.stringify(detail));
  if (!ok) failed = true;
};

// unaccent also folds typographic punctuation (— → -), which helps search too.
const norm = await one<{ v: string }>(`select public.normalize_text('Sơn Tùng M-TP — Đen Vâu') as v`);
check('normalize_text strips Vietnamese accents', norm.v === 'son tung m-tp - den vau', norm);

const uid = '11111111-1111-1111-1111-111111111111';
await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
  uid,
  'hoang.nguyen@example.com',
  { display_name: 'Hoàng', birth_date: '2000-05-20', gender: 'male' },
]);
const profile = await one<{ username: string; display_name: string; gender: string }>(
  `select username, display_name, gender from public.profiles where id = $1`, [uid]);
check('sign-up trigger creates a profile', profile?.display_name === 'Hoàng' && /^hoangnguyen\.[0-9a-f]{6}$/.test(profile.username), profile);
const liked = await one<{ n: number }>(`select count(*)::int as n from public.library_items where user_id = $1 and item_type = 'collection' and pinned_at is not null`, [uid]);
check('Liked Songs is pinned in the new library', liked.n === 1, liked);

const artist = await one<{ id: string }>(`insert into public.artists (provider, provider_id, name) values ('audius', 'a1', 'Sơn Tùng M-TP') returning id`);
const album = await one<{ id: string }>(`insert into public.albums (provider, provider_id, title, release_type) values ('audius', 'al1', 'Lạc Trôi', 'single') returning id`);
const track = await one<{ id: string }>(
  `insert into public.tracks (provider, provider_id, album_id, title, duration_ms, bpm, musical_key, key_mode, embedding)
   values ('audius', 't1', $1, 'Lạc Trôi', 233000, 92, 9, 0, $2) returning id`,
  [album.id, `[${Array.from({ length: 32 }, (_, i) => (i % 3) / 3).join(',')}]`],
);
await db.query(`insert into public.track_artists (track_id, artist_id) values ($1, $2)`, [track.id, artist.id]);

const found = await one<{ title: string; score: number }>(
  `select title, extensions.similarity(search_title, public.normalize_text($1)) as score
     from public.tracks where search_title operator(extensions.%) public.normalize_text($1)
    order by score desc limit 1`, ['lac troi']);
check('fuzzy accent-insensitive search finds "Lạc Trôi" from "lac troi"', found?.title === 'Lạc Trôi', found);

const nearest = await one<{ title: string }>(
  `select title from public.tracks order by embedding operator(extensions.<=>) $1::extensions.vector limit 1`,
  [`[${Array.from({ length: 32 }, (_, i) => (i % 3) / 3).join(',')}]`]);
check('pgvector nearest-neighbour query works', nearest?.title === 'Lạc Trôi', nearest);

await db.query(`insert into public.library_items (user_id, item_type, item_id) values ($1, 'artist', $2)`, [uid, artist.id]);
const followers = await one<{ n: number }>(`select followers_count as n from public.artists where id = $1`, [artist.id]);
check('following an artist increments followers_count', followers.n === 1, followers);
await db.query(`delete from public.artists where id = $1`, [artist.id]);
const orphan = await one<{ n: number }>(`select count(*)::int as n from public.library_items where item_type = 'artist'`);
check('deleting an artist cleans up library items', orphan.n === 0, orphan);

const free = await one<{ p: string }>(`select public.user_product($1) as p`, [uid]);
await db.query(`insert into public.plans (id, name, monthly_price) values ('individual', 'Premium Individual', 65000)`);
await db.query(
  `insert into public.subscriptions (user_id, plan_id, billing_type, status, current_period_start, current_period_end)
   values ($1, 'individual', 'recurring', 'active', now(), now() + interval '1 month')`, [uid]);
const premium = await one<{ p: string }>(`select public.user_product($1) as p`, [uid]);
check('user_product: free → premium after subscribing', free.p === 'free' && premium.p === 'premium', { free, premium });

let doubleSub = false;
try {
  await db.query(
    `insert into public.subscriptions (user_id, plan_id, billing_type, status, current_period_start, current_period_end)
     values ($1, 'individual', 'recurring', 'active', now(), now() + interval '1 month')`, [uid]);
} catch {
  doubleSub = true;
}
check('database rejects a second live subscription', doubleSub);

// Failed renewal: Premium continues during the 7-day grace period, then stops.
await db.query(`update public.subscriptions set status = 'past_due', current_period_start = now() - interval '32 days', current_period_end = now() - interval '2 days' where user_id = $1`, [uid]);
const inGrace = await one<{ p: string }>(`select public.user_product($1) as p`, [uid]);
await db.query(`update public.subscriptions set current_period_start = now() - interval '38 days', current_period_end = now() - interval '8 days' where user_id = $1`, [uid]);
const afterGrace = await one<{ p: string }>(`select public.user_product($1) as p`, [uid]);
check('past_due keeps Premium for 7 days, then Free', inGrace.p === 'premium' && afterGrace.p === 'free', { inGrace, afterGrace });

const rls = await one<{ n: number }>(
  `select count(*)::int as n from pg_tables where schemaname = 'public' and not rowsecurity`);
check('row level security is enabled on every public table', rls.n === 0, rls);

await db.close();
if (failed) process.exit(1);
console.log('\nAll migrations applied and smoke tests passed.');
