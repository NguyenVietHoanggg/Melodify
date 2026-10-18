-- ─────────────────────────────────────────────────────────────────────────────
-- Grace period: when a renewal payment fails the subscription is 'past_due' and the listener KEEPS
-- Premium for 7 more days while the card is retried (same number as GRACE_DAYS in billing/plans.ts).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.user_product(uid uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select case when exists (
    select 1 from public.subscriptions s
     where s.user_id = uid
       and (   (s.status = 'active'   and s.current_period_end > now())
            or (s.status = 'past_due' and s.current_period_end > now() - interval '7 days'))
  ) then 'premium' else 'free' end
$$;

-- Speeds up "did we already retry this card today?" in the renewal job.
create index if not exists payments_subscription_time on public.payments (subscription_id, created_at desc);
