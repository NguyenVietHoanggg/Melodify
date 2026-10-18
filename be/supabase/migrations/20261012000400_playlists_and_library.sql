-- ─────────────────────────────────────────────────────────────────────────────
-- Playlists & "Your Library"
-- ─────────────────────────────────────────────────────────────────────────────

create table public.playlists (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid references public.profiles (id) on delete cascade, -- null = editorial (owned by the app)
  kind             text not null default 'user'
                   check (kind in ('user', 'editorial', 'mix', 'radio', 'ai', 'imported')),
  name             text not null check (char_length(name) between 1 and 200),
  description      text check (description is null or char_length(description) <= 300),
  cover_url        text,          -- custom cover; otherwise the UI builds a mosaic from the first albums
  dominant_color   text,
  is_public        boolean not null default true,
  is_collaborative boolean not null default false,
  mix_enabled      boolean not null default false,  -- "Mix" mode (DJ transitions) toggled by the owner
  generated_for    uuid references public.profiles (id) on delete cascade, -- personalised mixes/radios
  generator        jsonb,         -- how it was generated, e.g. {"type":"daily_mix","index":1,"seedArtistIds":[…]}
  expires_at       timestamptz,   -- generated playlists are refreshed after this
  provider         text,
  provider_id      text,
  followers_count  integer not null default 0,
  search_name      text generated always as (public.normalize_text(name)) stored,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (provider, provider_id)
);
create index playlists_owner on public.playlists (owner_id);
create index playlists_generated_for on public.playlists (generated_for, kind);
create index playlists_search_trgm on public.playlists using gin (search_name extensions.gin_trgm_ops);
create trigger playlists_touch before update on public.playlists for each row execute function public.touch_updated_at();

-- A playlist may contain the same track twice, so items have their own id.
-- `position` is a float ("fractional indexing"): moving an item between positions 3.0 and 4.0 just sets
-- 3.5 — one UPDATE instead of renumbering every row after it.
create table public.playlist_tracks (
  id          uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  track_id    uuid not null references public.tracks (id) on delete cascade,
  position    double precision not null,
  added_by    uuid references public.profiles (id) on delete set null,
  added_at    timestamptz not null default now(),
  -- Mix mode: the owner's custom transition from this item into the next one.
  -- {"preset": "rise", "durationMs": 8000, "nextTrackId": "…"} — ignored if the next track changed.
  transition  jsonb
);
create index playlist_tracks_order on public.playlist_tracks (playlist_id, position);
create index playlist_tracks_track on public.playlist_tracks (track_id);

create table public.playlist_collaborators (
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  added_at    timestamptz not null default now(),
  primary key (playlist_id, user_id)
);

create table public.playlist_invites (
  token       text primary key,
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  created_by  uuid not null references public.profiles (id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

-- "Liked Songs"
create table public.saved_tracks (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  track_id uuid not null references public.tracks (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, track_id)
);
create index saved_tracks_recent on public.saved_tracks (user_id, added_at desc);

create table public.library_folders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 100),
  pinned_at  timestamptz,
  created_at timestamptz not null default now()
);
create index library_folders_user on public.library_folders (user_id);

-- Everything in the "Your Library" sidebar. item_type 'collection' covers the built-in entries
-- (Liked Songs, Your Episodes, Your Uploads) so they can be pinned like anything else.
create table public.library_items (
  user_id            uuid not null references public.profiles (id) on delete cascade,
  item_type          text not null check (item_type in ('playlist', 'album', 'artist', 'show', 'collection')),
  item_id            uuid not null,
  added_at           timestamptz not null default now(),
  last_played_at     timestamptz,
  pinned_at          timestamptz,
  folder_id          uuid references public.library_folders (id) on delete set null,
  exclude_from_taste boolean not null default false,  -- "Exclude from your taste profile"
  primary key (user_id, item_type, item_id)
);
create index library_items_item on public.library_items (item_type, item_id);

-- Keep followers/saves counters in sync (artists: followers, playlists: saves by people other than the owner).
create or replace function public.library_items_counters()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  delta integer := case when tg_op = 'INSERT' then 1 else -1 end;
  r record;
begin
  if tg_op = 'INSERT' then r := new; else r := old; end if;
  if r.item_type = 'artist' then
    update public.artists set followers_count = greatest(0, followers_count + delta) where id = r.item_id;
  elsif r.item_type = 'playlist' then
    update public.playlists set followers_count = greatest(0, followers_count + delta)
     where id = r.item_id and owner_id is distinct from r.user_id;
  end if;
  return null;
end
$$;
create trigger library_items_counters after insert or delete on public.library_items
  for each row execute function public.library_items_counters();

-- library_items.item_id is polymorphic (no FK), so clean up rows when the referenced entity disappears.
create or replace function public.cleanup_library_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.library_items where item_type = tg_argv[0] and item_id = old.id;
  return old;
end
$$;
create trigger playlists_cleanup_library after delete on public.playlists
  for each row execute function public.cleanup_library_items('playlist');
create trigger albums_cleanup_library after delete on public.albums
  for each row execute function public.cleanup_library_items('album');
create trigger artists_cleanup_library after delete on public.artists
  for each row execute function public.cleanup_library_items('artist');

-- Built-in collections get fixed ids so every client knows them.
--   00000000-0000-0000-0000-000000000001  Liked Songs
--   00000000-0000-0000-0000-000000000002  Your Episodes
--   00000000-0000-0000-0000-000000000003  Your Uploads
create or replace function public.add_default_library_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.library_items (user_id, item_type, item_id, pinned_at)
  values (new.id, 'collection', '00000000-0000-0000-0000-000000000001', now());
  return new;
end
$$;
create trigger profiles_default_library after insert on public.profiles
  for each row execute function public.add_default_library_items();
