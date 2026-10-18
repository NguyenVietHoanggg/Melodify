-- ─────────────────────────────────────────────────────────────────────────────
-- Music catalog: artists, albums (releases), tracks, lyrics, browse categories.
--
-- Every catalog row remembers WHERE it came from: (provider, provider_id).
-- Today the provider is 'audius' (+ 'upload' for user uploads); a licensed commercial catalog can be
-- added later as just another provider without touching the rest of the schema.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.artists (
  id                 uuid primary key default gen_random_uuid(),
  provider           text not null,
  provider_id        text,
  name               text not null,
  bio                text,
  avatar_url         text,
  banner_url         text,
  dominant_color     text,
  verified           boolean not null default false,
  genres             text[] not null default '{}',
  followers_count    integer not null default 0,     -- followers on Melodify
  monthly_listeners  integer not null default 0,     -- recomputed by a job from play_events
  provider_followers integer not null default 0,     -- popularity signal imported from the provider
  owner_id           uuid references public.profiles (id) on delete cascade, -- creator profile of a user (uploads)
  external_url       text,
  search_name        text generated always as (public.normalize_text(name)) stored,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (provider, provider_id)
);
create index artists_search_trgm on public.artists using gin (search_name extensions.gin_trgm_ops);
create unique index artists_one_per_owner on public.artists (owner_id) where owner_id is not null;
create trigger artists_touch before update on public.artists for each row execute function public.touch_updated_at();

create table public.albums (
  id             uuid primary key default gen_random_uuid(),
  provider       text not null,
  provider_id    text,
  title          text not null,
  release_type   text not null default 'album' check (release_type in ('album', 'single', 'ep', 'compilation')),
  release_date   date,
  cover_url      text,
  dominant_color text,
  label          text,
  copyright      text,
  origin         text not null default 'catalog' check (origin in ('catalog', 'upload')),
  popularity     integer not null default 0,
  search_title   text generated always as (public.normalize_text(title)) stored,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (provider, provider_id)
);
create index albums_search_trgm on public.albums using gin (search_title extensions.gin_trgm_ops);
create index albums_release_date on public.albums (release_date desc nulls last);
create trigger albums_touch before update on public.albums for each row execute function public.touch_updated_at();

create table public.album_artists (
  album_id  uuid not null references public.albums (id) on delete cascade,
  artist_id uuid not null references public.artists (id) on delete cascade,
  position  smallint not null default 0,
  primary key (album_id, artist_id)
);
create index album_artists_artist on public.album_artists (artist_id);

create table public.tracks (
  id                  uuid primary key default gen_random_uuid(),
  provider            text not null,
  provider_id         text,
  origin              text not null default 'catalog' check (origin in ('catalog', 'upload')),
  visibility          text not null default 'public' check (visibility in ('public', 'private')),
  uploader_id         uuid references public.profiles (id) on delete cascade,
  album_id            uuid references public.albums (id) on delete set null,
  title               text not null,
  track_number        smallint not null default 1,
  disc_number         smallint not null default 1,
  duration_ms         integer not null check (duration_ms > 0),
  explicit            boolean not null default false,
  isrc                text,
  storage_path        text,          -- uploads: object path inside the private "uploads" bucket
  -- Musical features (Spotify calls these "audio features"); they power Smart Shuffle, radio and Mix.
  genre               text,          -- normalized macro genre (be/src/modules/music/taxonomy.ts)
  provider_genre      text,
  moods               text[] not null default '{}',
  tags                text[] not null default '{}',
  bpm                 real check (bpm is null or bpm between 30 and 300),
  musical_key         smallint check (musical_key between 0 and 11),
  key_mode            smallint check (key_mode in (0, 1)),
  energy              real check (energy is null or energy between 0 and 1),
  valence             real check (valence is null or valence between 0 and 1),
  danceability        real check (danceability is null or danceability between 0 and 1),
  acousticness        real check (acousticness is null or acousticness between 0 and 1),
  instrumentalness    real check (instrumentalness is null or instrumentalness between 0 and 1),
  language            text,
  release_date        date,
  popularity          integer not null default 0 check (popularity between 0 and 100),
  play_count          bigint not null default 0,  -- streams on Melodify (counted after 30s, like Spotify)
  provider_play_count bigint not null default 0,
  embedding           extensions.vector(32),       -- feature vector for similarity search
  analysis_status     text not null default 'pending' check (analysis_status in ('pending', 'done', 'failed', 'skipped')),
  is_playable         boolean not null default true,
  blocked_reason      text,
  search_title        text generated always as (public.normalize_text(title)) stored,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (provider, provider_id),
  constraint uploads_have_uploader check ((origin = 'upload') = (uploader_id is not null))
);
create index tracks_album on public.tracks (album_id, disc_number, track_number);
create index tracks_search_trgm on public.tracks using gin (search_title extensions.gin_trgm_ops);
create index tracks_genre on public.tracks (genre) where origin = 'catalog';
create index tracks_uploader on public.tracks (uploader_id) where uploader_id is not null;
create index tracks_popular on public.tracks (popularity desc) where origin = 'catalog' and is_playable;
create index tracks_embedding on public.tracks using hnsw (embedding extensions.vector_cosine_ops);
create trigger tracks_touch before update on public.tracks for each row execute function public.touch_updated_at();

create table public.track_artists (
  track_id  uuid not null references public.tracks (id) on delete cascade,
  artist_id uuid not null references public.artists (id) on delete cascade,
  position  smallint not null default 0,
  role      text not null default 'main' check (role in ('main', 'featured')),
  primary key (track_id, artist_id)
);
create index track_artists_artist on public.track_artists (artist_id);

create table public.lyrics (
  track_id     uuid primary key references public.tracks (id) on delete cascade,
  kind         text not null check (kind in ('synced', 'plain', 'none')),
  -- synced: [{"t": 12345, "text": "..."}]   plain: [{"text": "..."}]   none: [] (cached "not found")
  lines        jsonb not null default '[]'::jsonb,
  language     text,
  provider     text not null,                -- 'lrclib' | 'uploader'
  provider_ref text,
  updated_at   timestamptz not null default now()
);

-- Cards on the Search page ("Browse all").
create table public.categories (
  id        text primary key,
  name_vi   text not null,
  name_en   text not null,
  color     text not null,
  image_url text,
  kind      text not null default 'genre'
            check (kind in ('genre', 'mood', 'charts', 'new', 'made_for_you', 'community', 'podcasts', 'discover')),
  -- How the backend fills the category page, e.g. {"genres": ["electronic"]} or {"moods": ["Peaceful"]}
  query     jsonb not null default '{}'::jsonb,
  position  integer not null default 0
);
