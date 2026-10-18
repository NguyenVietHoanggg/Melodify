/**
 * Premium subscriptions & payments.
 *
 * Rules (mirroring Spotify Vietnam):
 *  - Recurring plans renew monthly; first-time subscribers pay the intro price for the first N months.
 *  - One-time ("prepaid") purchases add months and never auto-renew; buying again extends the period.
 *  - Cancelling keeps Premium until the end of the paid period.
 *  - Failed renewal → past_due: Premium continues for a 7-day grace period while the card is retried once a
 *    day → paid again (active) or expired (back to Free).
 * Prices are always read from the database — never from the request.
 */
import type { CheckoutResult, PaymentRecord, PlansResponse } from '../../contracts';
import { sql } from '../../db/client';
import { toIso } from '../../lib/dto';
import { badRequest, conflict, notFound } from '../../lib/http';
import { logger } from '../../lib/logger';
import { invalidateUser } from '../player/service';
import { getSubscriptionSummary } from '../users/service';
import { charge, chargeToken, MOCK_OTP, tokenize, type CardInput } from './mockGateway';
import { GRACE_DAYS, RETRY_EVERY_HOURS } from './plans';

interface PlanRow {
  id: string;
  name: string;
  monthlyPrice: number;
  introMonths: number;
  introPrice: number | null;
  accounts: number;
  requiresVerification: 'student' | null;
  color: string | null;
}

export async function introEligible(userId: string | null): Promise<boolean> {
  if (!userId) return true;
  const [row] = await sql<{ had: boolean }[]>`select exists(select 1 from subscriptions where user_id = ${userId}) as had`;
  return !row?.had;
}

export async function getPlans(userId: string | null): Promise<PlansResponse> {
  const plans = await sql<PlanRow[]>`
    select id, name, monthly_price, intro_months, intro_price, accounts, requires_verification, color
      from plans where is_active order by position`;
  const prepaid = await sql<{ id: string; planId: string; months: number; price: number }[]>`
    select id, plan_id, months, price from prepaid_options order by position`;
  return {
    plans,
    prepaid: prepaid.map((o) => {
      const monthly = plans.find((p) => p.id === o.planId)?.monthlyPrice ?? 0;
      return { ...o, savings: Math.max(0, monthly * o.months - o.price) };
    }),
    introEligible: await introEligible(userId),
    current: userId ? await getSubscriptionSummary(userId) : null,
  };
}

export interface CheckoutInput {
  planId?: string;
  prepaidOptionId?: string;
  card: CardInput;
  idempotencyKey: string;
}

async function studentVerified(userId: string) {
  const [row] = await sql<{ ok: boolean }[]>`
    select exists(select 1 from student_verifications where user_id = ${userId} and status = 'verified' and expires_at > now()) as ok`;
  return row?.ok ?? false;
}

/** Turn a successful payment into Premium time (new subscription or an extension of the live one). */
async function activate(userId: string, paymentId: string) {
  const [p] = await sql<{ planId: string; prepaidOptionId: string | null; isIntro: boolean; methodId: string | null }[]>`
    select pay.plan_id, pay.prepaid_option_id,
           (pay.description like 'intro:%') as is_intro,
           (select id from payment_methods where user_id = ${userId} and is_default order by created_at desc limit 1) as method_id
      from payments pay where pay.id = ${paymentId}`;
  if (!p) throw notFound();
  const [plan] = await sql<{ introMonths: number }[]>`select intro_months from plans where id = ${p.planId}`;
  const months = p.prepaidOptionId
    ? ((await sql<{ months: number }[]>`select months from prepaid_options where id = ${p.prepaidOptionId}`)[0]?.months ?? 1)
    : p.isIntro
      ? (plan?.introMonths ?? 1)
      : 1;

  await sql.begin(async (tx) => {
    const [live] = await tx<{ id: string }[]>`
      select id from subscriptions where user_id = ${userId} and status in ('active', 'past_due') for update`;
    let subscriptionId: string;
    if (live) {
      // Extend the paid period (prepaid stacking, or paying a past-due recurring plan).
      const [s] = await tx<{ id: string }[]>`
        update subscriptions set
          current_period_end = greatest(current_period_end, now()) + make_interval(months => ${months}),
          status = 'active', cancel_at_period_end = false, canceled_at = null,
          plan_id = ${p.planId}, billing_type = ${p.prepaidOptionId ? 'prepaid' : 'recurring'},
          payment_method_id = coalesce(${p.methodId}, payment_method_id)
        where id = ${live.id} returning id`;
      subscriptionId = s!.id;
    } else {
      const [s] = await tx<{ id: string }[]>`
        insert into subscriptions (user_id, plan_id, billing_type, status, is_intro, current_period_start, current_period_end, payment_method_id)
        values (${userId}, ${p.planId}, ${p.prepaidOptionId ? 'prepaid' : 'recurring'}, 'active', ${p.isIntro},
                now(), now() + make_interval(months => ${months}), ${p.methodId})
        returning id`;
      subscriptionId = s!.id;
    }
    await tx`update payments set status = 'succeeded', subscription_id = ${subscriptionId} where id = ${paymentId}`;
  });
  invalidateUser(userId); // entitlements change right now: ads stop, Smart Shuffle unlocks…
}

export async function checkout(userId: string, input: CheckoutInput): Promise<CheckoutResult> {
  // Idempotency: the same key twice returns the first result instead of charging twice.
  const [existing] = await sql<{ id: string; status: string; failureReason: string | null }[]>`
    select id, status, failure_reason from payments where idempotency_key = ${input.idempotencyKey} and user_id = ${userId}`;
  if (existing) {
    return {
      status: existing.status === 'succeeded' ? 'succeeded' : existing.status === 'requires_action' ? 'requires_action' : 'failed',
      paymentId: existing.id,
      failureCode: existing.failureReason ?? undefined,
      subscription: (await getSubscriptionSummary(userId)) ?? undefined,
    };
  }

  let planId: string;
  let amount: number;
  let description: string;
  const eligible = await introEligible(userId);
  if (input.prepaidOptionId) {
    const [o] = await sql<{ planId: string; months: number; price: number }[]>`select plan_id, months, price from prepaid_options where id = ${input.prepaidOptionId}`;
    if (!o) throw badRequest('unknown_option');
    planId = o.planId;
    amount = o.price;
    description = `prepaid:${o.months}m`;
  } else {
    const [plan] = await sql<PlanRow[]>`select id, monthly_price, intro_months, intro_price from plans where id = ${input.planId ?? ''} and is_active`;
    if (!plan) throw badRequest('unknown_plan');
    const [live] = await sql<{ billingType: string }[]>`select billing_type from subscriptions where user_id = ${userId} and status = 'active'`;
    if (live?.billingType === 'recurring') throw conflict('already_subscribed');
    planId = plan.id;
    const intro = eligible && plan.introMonths > 0 && plan.introPrice != null;
    amount = intro ? plan.introPrice! : plan.monthlyPrice;
    description = intro ? `intro:${plan.introMonths}m` : 'monthly';
  }
  const [plan] = await sql<{ requiresVerification: string | null; name: string }[]>`select requires_verification, name from plans where id = ${planId}`;
  if (plan?.requiresVerification === 'student' && !(await studentVerified(userId))) throw badRequest('student_verification_required');

  const outcome = charge(input.card, amount);
  const tok = tokenize(input.card);
  if (outcome.status !== 'failed') {
    await sql`update payment_methods set is_default = false where user_id = ${userId}`;
    await sql`
      insert into payment_methods (user_id, provider, kind, brand, last4, exp_month, exp_year, holder_name, provider_token, is_default)
      values (${userId}, 'mock', 'card', ${tok.brand}, ${tok.last4}, ${input.card.expMonth}, ${input.card.expYear}, ${input.card.name}, ${tok.token}, true)`;
  }
  const [payment] = await sql<{ id: string }[]>`
    insert into payments (user_id, plan_id, prepaid_option_id, amount, currency, status, provider, provider_ref, description, failure_reason, idempotency_key)
    values (${userId}, ${planId}, ${input.prepaidOptionId ?? null}, ${amount}, 'VND',
            ${outcome.status === 'succeeded' ? 'pending' : outcome.status}, 'mock', ${outcome.ref}, ${`${description} ${plan?.name ?? ''}`.trim()},
            ${outcome.status === 'failed' ? outcome.code : null}, ${input.idempotencyKey})
    returning id`;

  if (outcome.status === 'failed') return { status: 'failed', paymentId: payment!.id, failureCode: outcome.code };
  if (outcome.status === 'requires_action') return { status: 'requires_action', paymentId: payment!.id };
  await activate(userId, payment!.id);
  return { status: 'succeeded', paymentId: payment!.id, subscription: (await getSubscriptionSummary(userId)) ?? undefined };
}

/** Second step for cards that need 3-D Secure (OTP). */
export async function confirmPayment(userId: string, paymentId: string, otp: string): Promise<CheckoutResult> {
  const [p] = await sql<{ status: string }[]>`select status from payments where id = ${paymentId} and user_id = ${userId}`;
  if (!p) throw notFound();
  if (p.status !== 'requires_action') throw conflict('payment_not_pending');
  if (otp !== MOCK_OTP) {
    await sql`update payments set status = 'failed', failure_reason = 'otp_invalid' where id = ${paymentId}`;
    return { status: 'failed', paymentId, failureCode: 'otp_invalid' };
  }
  await activate(userId, paymentId);
  return { status: 'succeeded', paymentId, subscription: (await getSubscriptionSummary(userId)) ?? undefined };
}

export async function cancelSubscription(userId: string) {
  const res = await sql`
    update subscriptions set cancel_at_period_end = true, canceled_at = now()
     where user_id = ${userId} and status in ('active', 'past_due') and billing_type = 'recurring'`;
  if (!res.count) throw notFound('no_recurring_subscription');
}

export async function resumeSubscription(userId: string) {
  await sql`update subscriptions set cancel_at_period_end = false, canceled_at = null where user_id = ${userId} and status = 'active'`;
}

export async function listPayments(userId: string): Promise<PaymentRecord[]> {
  const rows = await sql<{ id: string; amount: number; currency: string; status: PaymentRecord['status']; description: string | null; brand: string | null; last4: string | null; createdAt: Date }[]>`
    select p.id, p.amount, p.currency, p.status, p.description, pm.brand, pm.last4, p.created_at
      from payments p
      left join lateral (select brand, last4 from payment_methods m where m.user_id = p.user_id order by created_at desc limit 1) pm on true
     where p.user_id = ${userId} order by p.created_at desc limit 50`;
  return rows.map((r) => ({ id: r.id, amount: r.amount, currency: r.currency, status: r.status, description: r.description, cardBrand: r.brand, cardLast4: r.last4, createdAt: toIso(r.createdAt)! }));
}

/** Mock student verification: a school e-mail (…edu / …edu.vn) is accepted for 12 months. */
export async function verifyStudent(userId: string, schoolName: string, studentEmail: string) {
  const ok = /@([a-z0-9-]+\.)*edu(\.[a-z]{2})?$/i.test(studentEmail.trim());
  await sql`
    insert into student_verifications (user_id, school_name, student_email, status, verified_at, expires_at)
    values (${userId}, ${schoolName}, ${studentEmail}, ${ok ? 'verified' : 'rejected'}, ${ok ? sql`now()` : null}, ${ok ? sql`now() + interval '12 months'` : null})
    on conflict (user_id) do update set school_name = excluded.school_name, student_email = excluded.student_email,
      status = excluded.status, verified_at = excluded.verified_at, expires_at = excluded.expires_at`;
  return ok;
}

/**
 * Renewal job (runs every minute): renew, expire or grace-period subscriptions whose period ended.
 * In production this would be a scheduled worker / pg_cron; here a timer in the API process is enough.
 */
export async function runBillingCycle(): Promise<number> {
  const due = await sql<{
    id: string; userId: string; planId: string; billingType: string; cancelAtPeriodEnd: boolean; status: string;
    token: string | null; monthlyPrice: number; graceOver: boolean; retriedRecently: boolean;
  }[]>`
    select s.id, s.user_id, s.plan_id, s.billing_type, s.cancel_at_period_end, s.status, m.provider_token as token, p.monthly_price,
           (s.current_period_end < now() - make_interval(days => ${GRACE_DAYS})) as grace_over,
           exists (select 1 from payments py
                    where py.subscription_id = s.id and py.status = 'failed'
                      and py.created_at > now() - make_interval(hours => ${RETRY_EVERY_HOURS})) as retried_recently
      from subscriptions s
      join plans p on p.id = s.plan_id
      left join payment_methods m on m.id = s.payment_method_id
     where s.status in ('active', 'past_due') and s.current_period_end < now()
     limit 200`;
  let processed = 0;
  for (const s of due) {
    // In the grace period we retry the card once a day — not on every tick of this job.
    if (s.status === 'past_due' && !s.graceOver && s.retriedRecently) continue;
    processed++;
    if (s.billingType === 'prepaid' || s.cancelAtPeriodEnd) {
      await sql`update subscriptions set status = ${s.cancelAtPeriodEnd ? 'canceled' : 'expired'} where id = ${s.id}`;
    } else if (s.status === 'past_due' && s.graceOver) {
      await sql`update subscriptions set status = 'expired' where id = ${s.id}`;
    } else if (s.status === 'active' || s.status === 'past_due') {
      const outcome = s.token ? chargeToken(s.token) : ({ status: 'failed', code: 'card_declined', ref: 'no_method' } as const);
      await sql`
        insert into payments (user_id, subscription_id, plan_id, amount, status, provider, provider_ref, description, failure_reason)
        values (${s.userId}, ${s.id}, ${s.planId}, ${s.monthlyPrice}, ${outcome.status === 'succeeded' ? 'succeeded' : 'failed'}, 'mock',
                ${outcome.ref}, 'renewal', ${outcome.status === 'failed' ? outcome.code : null})`;
      if (outcome.status === 'succeeded') {
        await sql`update subscriptions set status = 'active', is_intro = false, current_period_start = current_period_end,
                    current_period_end = current_period_end + interval '1 month' where id = ${s.id}`;
      } else {
        await sql`update subscriptions set status = 'past_due' where id = ${s.id}`;
      }
    }
    invalidateUser(s.userId);
  }
  if (processed) logger.info({ processed }, 'billing cycle');
  return processed;
}

export function startBillingJob() {
  const tick = () => void runBillingCycle().catch((err) => logger.error({ err }, 'billing cycle failed'));
  setTimeout(tick, 5_000);
  return setInterval(tick, 60_000);
}

/** DEV ONLY: pretend `days` passed for my subscription (to test renewals/expiry without waiting a month). */
export async function devAdvance(userId: string, days: number) {
  await sql`update subscriptions set current_period_end = current_period_end - make_interval(days => ${days}),
              current_period_start = current_period_start - make_interval(days => ${days})
            where user_id = ${userId} and status in ('active', 'past_due')`;
  return runBillingCycle();
}
