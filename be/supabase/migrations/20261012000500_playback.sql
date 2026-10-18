-- ─────────────────────────────────────────────────────────────────────────────
-- Playback: listening history, server-side player sessions, devices, search history,
-- user feedback and co-listening statistics used by the recommender.
-- ─────────────────────────────────────────────────────────────────────────────

-- One row per play. This table is the raw material for "Recently played", "On Repeat", monthly listeners,
-- play counts, Daily Mixes and the taste profile.
create table public.play_events (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  track_id     uuid references public.tracks (id) on delete set null,
  episode_id   uuid,  -- FK added in the podcasts migration
  context_type text,
  context_id   text,
  source       text not null default 'context'
               check (source in ('context', 'queue', 'smart_shuffle', 'autoplay', 'radio', 'jam')),
  device_id    text,
  started_at   timestamptz not null default now(),
  ms_played    integer not null default 0,
  ended_reason text check (ended_reason in ('completed', 'skipped', 'paused', 'error', 'switched', 'replaced')),
  counted      boolean not null default false,  -- became a "stream" (≥ 30 s played), Spotify's rule
  is_private   boolean not null default false   -- private session: excluded from taste & friend activity
);
create index play_events_user_time on public.play_events (user_id, started_at desc);
create index play_events_track_time on public.play_events (track_id, started_at desc);

-- Server-side playback session — the single source of truth that every device of a user follows
-- (Spotify calls this the Connect "cluster"). Stored as JSON because its shape is owned by the backend.
create table public.player_sessions (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  state      jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.devices (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  id           text not null,
  name         text not null,
  type         text not null check (type in ('computer', 'smartphone', 'tablet', 'speaker', 'tv', 'web')),
  volume       real not null default 1 check (volume between 0 and 1),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.recent_searches (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  item_type   text not null check (item_type in ('track', 'artist', 'album', 'playlist', 'show', 'episode', 'user')),
  item_id     uuid not null,
  searched_at timestamptz not null default now(),
  primary key (user_id, item_type, item_id)
);
create index recent_searches_time on public.recent_searches (user_id, searched_at desc);

-- "Hide song", "Snooze" (don't suggest for 30 days) and "Exclude from your taste profile".
create table public.track_feedback (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  track_id   uuid not null references public.tracks (id) on delete cascade,
  kind       text not null check (kind in ('hide', 'snooze', 'exclude_taste')),
  until      timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, track_id, kind)
);

-- "People who put A in a playlist also put B" — collaborative-filtering signal, rebuilt by a job.
-- Stored in both directions so lookups by either track are a simple index scan.
create table public.track_cooccurrence (
  track_a uuid not null references public.tracks (id) on delete cascade,
  track_b uuid not null references public.tracks (id) on delete cascade,
  weight  real not null,
  primary key (track_a, track_b)
);
