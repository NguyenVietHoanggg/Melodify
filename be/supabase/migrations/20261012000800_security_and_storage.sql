-- ─────────────────────────────────────────────────────────────────────────────
-- Security model
--
-- The frontend never talks to the database: every read/write goes through the backend, which connects
-- directly to Postgres. Supabase also exposes every table in the "public" schema through its automatic
-- REST API (PostgREST) to anyone holding the publishable key — so we lock that door:
--   1. Row Level Security ON for every table, with NO policies  → the REST API sees zero rows.
--   2. Revoke table privileges from the API roles (anon, authenticated) → belt and braces.
-- The backend's own connection (table owner) is not affected.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end
$$;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- ── Storage buckets ─────────────────────────────────────────────────────────
-- uploads: users' own music — PRIVATE; the backend hands out short-lived signed URLs.
-- images:  playlist covers, avatars, upload artwork — public read.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('uploads', 'uploads', false, 52428800,
   array['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/flac', 'audio/x-flac',
         'audio/ogg', 'audio/aac', 'audio/mp4', 'audio/x-m4a']),
  ('images', 'images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
