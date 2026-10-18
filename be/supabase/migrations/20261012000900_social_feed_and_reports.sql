-- ─────────────────────────────────────────────────────────────────────────────
-- Social extras: "What's New" seen-marker, and reports on user-uploaded content.
-- ─────────────────────────────────────────────────────────────────────────────

-- What's New (bell icon): items released after this moment get a blue "new" dot.
alter table public.profiles add column feed_seen_at timestamptz;

-- Anyone can publish their own music, so listeners must be able to report it (copyright, offensive…).
-- Three open reports from different people hide a public upload until an admin reviews it.
create table public.content_reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  track_id    uuid not null references public.tracks (id) on delete cascade,
  reason      text not null check (reason in ('copyright', 'offensive', 'spam', 'other')),
  details     text check (char_length(details) <= 1000),
  status      text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  created_at  timestamptz not null default now(),
  unique (reporter_id, track_id)
);
create index content_reports_track on public.content_reports (track_id) where status = 'open';

-- Same defence in depth as every other table: only the backend (service role / direct DB) touches it.
alter table public.content_reports enable row level security;
revoke all on public.content_reports from anon, authenticated;
