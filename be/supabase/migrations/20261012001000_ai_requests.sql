-- ─────────────────────────────────────────────────────────────────────────────
-- AI Playlist usage log: enforces the daily limit (Premium: N requests/day, create + refine)
-- and lets us see which prompts the keyword fallback handles badly.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.ai_requests (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  playlist_id uuid references public.playlists (id) on delete set null,
  kind        text not null check (kind in ('create', 'refine')),
  prompt      text not null check (char_length(prompt) <= 500),
  used_ai     boolean not null,
  created_at  timestamptz not null default now()
);
create index ai_requests_user_day on public.ai_requests (user_id, created_at desc);

alter table public.ai_requests enable row level security;
revoke all on public.ai_requests from anon, authenticated;
