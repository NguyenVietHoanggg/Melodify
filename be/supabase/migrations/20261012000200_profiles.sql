-- ─────────────────────────────────────────────────────────────────────────────
-- Profiles: public data of a user (auth.users holds the private auth data).
-- ─────────────────────────────────────────────────────────────────────────────
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  username         text not null unique check (username ~ '^[a-z0-9._]{3,40}$'),
  display_name     text not null check (char_length(display_name) between 1 and 60),
  avatar_url       text,
  birth_date       date,
  gender           text check (gender in ('male', 'female', 'non_binary', 'other', 'prefer_not_to_say')),
  country          text not null default 'VN',
  locale           text not null default 'vi' check (locale in ('vi', 'en')),
  marketing_opt_in boolean not null default false,
  -- Preferences synced across devices (audio quality, crossfade, explicit filter, private session…)
  settings         jsonb not null default '{}'::jsonb,
  is_admin         boolean not null default false,
  followers_count  integer not null default 0,
  following_count  integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Create the profile row automatically whenever someone signs up.
-- The backend validates the sign-up form and passes it as user metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  local_part text := split_part(coalesce(new.email, 'user'), '@', 1);
  handle text := regexp_replace(lower(local_part), '[^a-z0-9]+', '', 'g');
begin
  insert into public.profiles (id, username, display_name, avatar_url, birth_date, gender, marketing_opt_in, locale)
  values (
    new.id,
    left(coalesce(nullif(handle, ''), 'user'), 24) || '.' || substr(replace(new.id::text, '-', ''), 1, 6),
    left(coalesce(nullif(meta ->> 'display_name', ''), nullif(meta ->> 'full_name', ''), nullif(meta ->> 'name', ''), local_part), 60),
    coalesce(meta ->> 'avatar_url', meta ->> 'picture'),
    nullif(meta ->> 'birth_date', '')::date,
    nullif(meta ->> 'gender', ''),
    coalesce((meta ->> 'marketing_opt_in')::boolean, false),
    coalesce(nullif(meta ->> 'locale', ''), 'vi')
  );
  return new;
end
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
