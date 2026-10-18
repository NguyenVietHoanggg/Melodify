-- Social log-in (Google, Facebook, Apple) sends its own profile fields: "en-US" / "vi_VN" style locales,
-- names under full_name or name, sometimes a birthday in another format, and no gender we can use.
-- The first version of this trigger copied them as-is, so a check constraint (locale in ('vi','en'))
-- could reject the new user and make the whole sign-in fail. Now every field is cleaned first; anything
-- unusable is simply left empty and the app asks for it ("Tell us about yourself").
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
  raw_locale text := lower(left(coalesce(meta ->> 'locale', ''), 2));
  raw_birth text := coalesce(meta ->> 'birth_date', meta ->> 'birthdate', '');
  raw_gender text := lower(coalesce(meta ->> 'gender', ''));
  birth date;
  name text := btrim(coalesce(nullif(btrim(meta ->> 'display_name'), ''), nullif(btrim(meta ->> 'full_name'), ''), nullif(btrim(meta ->> 'name'), ''), local_part));
begin
  -- A birthday only if it is a real ISO date in a sensible range ('2001-02-30' must not break sign-in).
  begin
    if raw_birth ~ '^\d{4}-\d{2}-\d{2}$' then
      birth := raw_birth::date;
      if birth < date '1900-01-01' or birth > current_date then birth := null; end if;
    end if;
  exception when others then
    birth := null;
  end;

  insert into public.profiles (id, username, display_name, avatar_url, birth_date, gender, marketing_opt_in, locale)
  values (
    new.id,
    left(coalesce(nullif(handle, ''), 'user'), 24) || '.' || substr(replace(new.id::text, '-', ''), 1, 6),
    left(coalesce(nullif(name, ''), 'user'), 60),
    coalesce(meta ->> 'avatar_url', meta ->> 'picture'),
    birth,
    case when raw_gender in ('male', 'female', 'non_binary', 'other', 'prefer_not_to_say') then raw_gender end,
    case when lower(coalesce(meta ->> 'marketing_opt_in', '')) in ('true', 'false') then (meta ->> 'marketing_opt_in')::boolean else false end,
    case when raw_locale in ('vi', 'en') then raw_locale else 'vi' end
  );
  return new;
end
$$;
