-- ─────────────────────────────────────────────────────────────────────────────
-- Podcasts (imported from public RSS feeds) + social features.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.shows (
  id              uuid primary key default gen_random_uuid(),
  provider        text not null default 'rss',
  provider_id     text not null,  -- the RSS feed URL
  title           text not null,
  publisher       text,
  description     text,
  image_url       text,
  dominant_color  text,
  language        text,
  explicit        boolean not null default false,
  categories      text[] not null default '{}',
  website_url     text,
  followers_count integer not null default 0,
  search_title    text generated always as (public.normalize_text(title)) stored,
  last_fetched_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (provider, provider_id)
);
create index shows_search_trgm on public.shows using gin (search_title extensions.gin_trgm_ops);
create trigger shows_touch before update on public.shows for each row execute function public.touch_updated_at();
create trigger shows_cleanup_library after delete on public.shows
  for each row execute function public.cleanup_library_items('show');

create table public.episodes (
  id             uuid primary key default gen_random_uuid(),
  show_id        uuid not null references public.shows (id) on delete cascade,
  guid           text not null,
  title          text not null,
  description    text,
  audio_url      text not null,
  image_url      text,
  duration_ms    integer not null default 0,
  release_date   timestamptz,
  explicit       boolean not null default false,
  season_number  integer,
  episode_number integer,
  search_title   text generated always as (public.normalize_text(title)) stored,
  created_at     timestamptz not null default now(),
  unique (show_id, guid)
);
create index episodes_show_date on public.episodes (show_id, release_date desc);
create index episodes_search_trgm on public.episodes using gin (search_title extensions.gin_trgm_ops);

alter table public.play_events
  add constraint play_events_episode_fk foreign key (episode_id) references public.episodes (id) on delete set null;

-- Resume where you left off.
create table public.episode_progress (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  episode_id  uuid not null references public.episodes (id) on delete cascade,
  position_ms integer not null default 0,
  completed   boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (user_id, episode_id)
);

-- "Your Episodes"
create table public.saved_episodes (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  episode_id uuid not null references public.episodes (id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (user_id, episode_id)
);

create table public.user_follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index user_follows_followee on public.user_follows (followee_id);

create or replace function public.user_follows_counters()
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
  update public.profiles set following_count = greatest(0, following_count + delta) where id = r.follower_id;
  update public.profiles set followers_count = greatest(0, followers_count + delta) where id = r.followee_id;
  return null;
end
$$;
create trigger user_follows_counters after insert or delete on public.user_follows
  for each row execute function public.user_follows_counters();

-- "What's New" feed (new releases from followed artists, new episodes of followed shows…)
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index notifications_user on public.notifications (user_id, created_at desc);

-- Jam: listen together in real time.
create table public.jam_sessions (
  id         uuid primary key default gen_random_uuid(),
  host_id    uuid not null references public.profiles (id) on delete cascade,
  code       text not null unique,
  status     text not null default 'active' check (status in ('active', 'ended')),
  created_at timestamptz not null default now(),
  ended_at   timestamptz
);
create unique index jam_one_active_per_host on public.jam_sessions (host_id) where status = 'active';

create table public.jam_members (
  jam_id    uuid not null references public.jam_sessions (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (jam_id, user_id)
);
