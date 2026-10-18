-- ─────────────────────────────────────────────────────────────────────────────
-- Extensions & shared helpers
-- On Supabase, extensions are installed into the dedicated "extensions" schema.
-- ─────────────────────────────────────────────────────────────────────────────
create extension if not exists pg_trgm with schema extensions;   -- fuzzy search (typo tolerant)
create extension if not exists unaccent with schema extensions;  -- "Sơn Tùng" ≈ "son tung"
create extension if not exists vector with schema extensions;    -- pgvector: similarity search for recommendations

-- unaccent() is only STABLE (its dictionary could be swapped), but generated columns and indexes
-- require IMMUTABLE functions. Pinning the dictionary explicitly makes this wrapper safe to mark
-- IMMUTABLE — the standard Postgres trick for accent-insensitive search.
create or replace function public.normalize_text(input text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, input))
$$;

-- Generic "updated_at = now()" trigger used by many tables.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;
