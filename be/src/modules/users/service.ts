import type { Request } from 'express';
import type { Me, Product, SubscriptionSummary, UserSettings } from '../../contracts';
import { sql } from '../../db/client';
import { notFound } from '../../lib/http';
import { toIso } from '../../lib/dto';
import { GRACE_DAYS, getEntitlements, type Platform } from '../billing/plans';

export const DEFAULT_SETTINGS: UserSettings = {
  audioQuality: 'automatic',
  normalizeVolume: true,
  crossfadeSec: 0,
  automix: true,
  autoplay: true,
  allowExplicit: true,
  showNowPlayingOnPlay: true,
  compactLibrary: false,
  privateSession: false,
  shareListeningActivity: true,
  showFollowsOnProfile: true,
  showPlaylistsOnProfile: true,
  showRecentArtistsOnProfile: true,
  publishNewPlaylists: true,
};

export const platformOf = (req?: Request): Platform => (req?.header('x-client') === 'mobile' ? 'mobile' : 'web');

export async function getProduct(userId: string): Promise<Product> {
  const [row] = await sql<{ product: Product }[]>`select public.user_product(${userId}) as product`;
  return row?.product ?? 'free';
}

export async function getSettings(userId: string): Promise<UserSettings> {
  const [row] = await sql<{ settings: Partial<UserSettings> }[]>`select settings from profiles where id = ${userId}`;
  return { ...DEFAULT_SETTINGS, ...(row?.settings ?? {}) };
}

export async function getSubscriptionSummary(userId: string): Promise<SubscriptionSummary | null> {
  const [s] = await sql<
    {
      id: string; planId: string; planName: string; status: SubscriptionSummary['status'];
      billingType: SubscriptionSummary['billingType']; isIntro: boolean; currentPeriodEnd: Date;
      cancelAtPeriodEnd: boolean; monthlyPrice: number;
    }[]
  >`
    select s.id, s.plan_id, p.name as plan_name, s.status, s.billing_type, s.is_intro,
           s.current_period_end, s.cancel_at_period_end, p.monthly_price
      from subscriptions s
      join plans p on p.id = s.plan_id
     where s.user_id = ${userId} and s.status in ('active', 'past_due')
     order by s.created_at desc
     limit 1`;
  if (!s) return null;
  return {
    id: s.id,
    planId: s.planId,
    planName: s.planName,
    status: s.status,
    billingType: s.billingType,
    isIntro: s.isIntro,
    currentPeriodEnd: toIso(s.currentPeriodEnd)!,
    cancelAtPeriodEnd: s.cancelAtPeriodEnd,
    nextChargeAmount: s.billingType === 'recurring' && !s.cancelAtPeriodEnd ? s.monthlyPrice : null,
    graceUntil: s.status === 'past_due' ? new Date(new Date(s.currentPeriodEnd).getTime() + GRACE_DAYS * 86_400_000).toISOString() : null,
  };
}

interface ProfileRow {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  email: string | null;
  country: string;
  locale: 'vi' | 'en';
  birthDate: string | null;
  gender: string | null;
  settings: Partial<UserSettings>;
  isAdmin: boolean;
  createdAt: Date;
}

export async function getMe(userId: string, req?: Request): Promise<Me> {
  const [row] = await sql<ProfileRow[]>`
    select p.id, p.username, p.display_name, p.avatar_url, u.email, p.country, p.locale, p.birth_date,
           p.gender, p.settings, p.is_admin, p.created_at
      from profiles p
      join auth.users u on u.id = p.id
     where p.id = ${userId}`;
  if (!row) throw notFound('profile_not_found');
  const [product, subscription] = await Promise.all([getProduct(userId), getSubscriptionSummary(userId)]);
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    email: row.email,
    product,
    entitlements: getEntitlements(product, platformOf(req)),
    country: row.country,
    locale: row.locale,
    birthDate: row.birthDate,
    gender: row.gender,
    settings: { ...DEFAULT_SETTINGS, ...row.settings },
    subscription,
    isAdmin: row.isAdmin,
    createdAt: toIso(row.createdAt)!,
  };
}
