/**
 * A throw-away local Postgres for development & testing WITHOUT a Supabase project:
 * PGlite (Postgres compiled to WebAssembly) + a socket server speaking the Postgres wire protocol.
 * The backend connects to it exactly like to a real Postgres (postgres://postgres@127.0.0.1:54329/postgres).
 *
 *   npm run db:local -w be      (keep it running in its own terminal)
 *
 * Supabase-only pieces (auth.users, storage.buckets, API roles) are stubbed so the migrations apply, and a
 * small Storage emulator (local-storage.ts) serves uploads/images on http://127.0.0.1:54321 (SUPABASE_URL in .env.localdb).
 */
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { vector } from '@electric-sql/pglite-pgvector';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { startLocalStorage } from './local-storage';

const DATA_DIR = path.resolve(import.meta.dirname, '../../.cache/pglite');
const PORT = Number(process.env.LOCAL_DB_PORT ?? 54329);
const STORAGE_PORT = Number(process.env.LOCAL_STORAGE_PORT ?? 54321);
const fresh = !fs.existsSync(DATA_DIR);

const db = await PGlite.create({ dataDir: DATA_DIR, extensions: { pg_trgm, unaccent, vector } });
if (fresh) {
  await db.exec(`
    create schema if not exists extensions;
    create schema if not exists auth;
    create table if not exists auth.users (
      id uuid primary key, email text, raw_user_meta_data jsonb, created_at timestamptz default now()
    );
    create schema if not exists storage;
    create table if not exists storage.buckets (
      id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
    );
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    end $$;
  `);
  console.log('Created a fresh local database with Supabase stubs.');
}

const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1', maxConnections: 10 } as ConstructorParameters<typeof PGLiteSocketServer>[0]);
await server.start();
console.log(`Local Postgres (PGlite) listening on postgresql://postgres@127.0.0.1:${PORT}/postgres`);
const storage = startLocalStorage({ port: STORAGE_PORT, dir: path.resolve(import.meta.dirname, '../../.cache/storage') });
console.log(`Local Storage emulator listening on http://127.0.0.1:${STORAGE_PORT}/storage/v1`);

const stop = async () => {
  storage.close();
  await server.stop();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
