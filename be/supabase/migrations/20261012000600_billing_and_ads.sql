-- ─────────────────────────────────────────────────────────────────────────────
-- Billing (Premium plans, subscriptions, mock payments) and ads for Free users.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.plans (
  id                    text primary key,
  name                  text not null,
  monthly_price         integer not null check (monthly_price >= 0),
  currency              text not null default 'VND',
  intro_months          smallint not null default 0,
  intro_price           integer,
  accounts              smallint not null default 1,
  requires_verification text check (requires_verification in ('student')),
  color                 text,
  is_active             boolean not null default true,
  position              integer not null default 0
);

-- One-time purchases ("Thanh toán một lần"): no auto-renew.
create table public.prepaid_options (
  id       text primary key,
  plan_id  text not null references public.plans (id),
  months   smallint not null check (months > 0),
  price    integer not null check (price >= 0),
  position integer not null default 0
);

-- We never store raw card numbers: only brand + last 4 + a provider token (PCI-DSS rule of thumb).
create table public.payment_methods (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  provider       text not null default 'mock',
  kind           text not null default 'card' check (kind in ('card', 'ewallet')),
  brand          text,
  last4          text,
  exp_month      smallint,
  exp_year       smallint,
  holder_name    text,
  provider_token text,
  is_default     boolean not null default true,
  created_at     timestamptz not null default now()
);
create index payment_methods_user on public.payment_methods (user_id);

create table public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles (id) on delete cascade,
  plan_id              text not null references public.plans (id),
  billing_type         text not null check (billing_type in ('recurring', 'prepaid')),
  status               text not null check (status in ('active', 'past_due', 'canceled', 'expired')),
  is_intro             boolean not null default false,
  current_period_start timestamptz not null,
  current_period_end   timestamptz not null,
  cancel_at_period_end boolean not null default false,
  canceled_at          timestamptz,
  payment_method_id    uuid references public.payment_methods (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (current_period_end > current_period_start)
);
-- At most one live subscription per user — enforced by the database, not just by code.
create unique index subscriptions_one_live on public.subscriptions (user_id) where status in ('active', 'past_due');
create index subscriptions_due on public.subscriptions (current_period_end) where status in ('active', 'past_due');
create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();

create table public.payments (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  subscription_id   uuid references public.subscriptions (id) on delete set null,
  plan_id           text references public.plans (id),
  prepaid_option_id text references public.prepaid_options (id),
  amount            integer not null check (amount >= 0),
  currency          text not null default 'VND',
  status            text not null check (status in ('pending', 'requires_action', 'succeeded', 'failed', 'refunded')),
  provider          text not null default 'mock',
  provider_ref      text,
  description       text,
  failure_reason    text,
  -- Same key twice = same payment (protects against double-clicks and network retries).
  idempotency_key   text unique,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index payments_user on public.payments (user_id, created_at desc);
create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();

create table public.student_verifications (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  school_name   text not null,
  student_email text not null,
  status        text not null check (status in ('pending', 'verified', 'rejected')),
  verified_at   timestamptz,
  expires_at    timestamptz,
  created_at    timestamptz not null default now()
);

-- Effective product of a user: the only definition of "is Premium" in the whole system.
create or replace function public.user_product(uid uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select case when exists (
    select 1 from public.subscriptions s
     where s.user_id = uid
       and s.status in ('active', 'past_due')
       and s.current_period_end > now()
  ) then 'premium' else 'free' end
$$;

-- Ads (Free tier). Audio ads can be a real file or a script read by the browser's speech engine.
create table public.ads (
  id          uuid primary key default gen_random_uuid(),
  advertiser  text not null,
  title       text not null,
  body        text,
  format      text not null check (format in ('audio', 'display')),
  audio_url   text,
  tts_script  text,
  tts_lang    text default 'vi-VN',
  duration_ms integer,
  image_url   text,
  cta_label   text,
  click_url   text,
  bg_color    text,
  weight      integer not null default 1 check (weight > 0),
  is_active   boolean not null default true,
  starts_at   timestamptz,
  ends_at     timestamptz,
  created_at  timestamptz not null default now()
);

create table public.ad_impressions (
  id           bigint generated always as identity primary key,
  ad_id        uuid not null references public.ads (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  served_at    timestamptz not null default now(),
  completed_at timestamptz,
  clicked_at   timestamptz
);
create index ad_impressions_user on public.ad_impressions (user_id, served_at desc);
