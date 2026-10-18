/**
 * Minimal migration runner: applies every be/supabase/migrations/*.sql file that hasn't run yet,
 * each inside its own transaction (all-or-nothing).
 * Applied versions are recorded in supabase_migrations.schema_migrations — the same table the Supabase CLI
 * uses — so `supabase db push` and this script agree on what has already been applied.
 *
 *   npm run db:migrate
 */
import fs from 'node:fs';
import path from 'node:path';
import { sql } from '../db/client';

const DIR = path.resolve(import.meta.dirname, '../../supabase/migrations');

async function main() {
  await sql`create schema if not exists supabase_migrations`;
  await sql`
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key, statements text[], name text
    )`;
  const applied = new Set((await sql<{ version: string }[]>`select version from supabase_migrations.schema_migrations`).map((r) => r.version));

  const files = fs.readdirSync(DIR).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
  let count = 0;
  for (const file of files) {
    const [version, ...rest] = file.replace(/\.sql$/, '').split('_');
    if (applied.has(version!)) continue;
    const body = fs.readFileSync(path.join(DIR, file), 'utf8');
    process.stdout.write(`→ ${file} … `);
    await sql.begin(async (tx) => {
      await tx.unsafe(body).simple(); // "simple" protocol = many statements in one go
      await tx`insert into supabase_migrations.schema_migrations (version, name, statements) values (${version!}, ${rest.join('_')}, ${[body]})`;
    });
    console.log('done');
    count++;
  }
  console.log(count ? `✓ Applied ${count} migration(s).` : '✓ Database already up to date.');
  await sql.end();
}

main().catch(async (err) => {
  console.error('\n✗ Migration failed:', err.message);
  await sql.end();
  process.exit(1);
});
