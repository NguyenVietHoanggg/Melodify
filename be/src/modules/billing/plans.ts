/**
 * Plans & entitlements. Prices mirror Spotify Vietnam (checked Oct 2026):
 *  - Premium Individual: 65.000₫ for the first 2 months, then 65.000₫/month
 *  - Premium Student:    33.000₫ for the first 2 months, then 33.000₫/month
 *  - One-time (prepaid, no auto-renew): 1/3/6/12 months for Individual, 1 month for Student
 *
 * The API seeds these into the `plans` table and always re-reads prices from the DB when charging,
 * so a tampered client can never change what is charged.
 */

import type { Entitlements, Product } from '../../contracts';

export type Platform = 'web' | 'mobile';
export type PlanId = 'individual' | 'student';

// What each tier may do. Free on mobile is stricter (Spotify limits skips & queue editing there).
const FREE: Entitlements = {
  ads: true,
  skipsPerHour: null,
  onDemandPlayback: true,
  smartShuffle: false,
  mix: false,
  aiPlaylist: false,
  aiPlaylistsPerDay: 0,
  maxAudioQuality: 'high',
  queueEdit: true,
  jamHost: false,
  offlineDownload: false,
  uploadTracksLimit: 10,
  uploadMaxMb: 15,
};

const PREMIUM: Entitlements = {
  ads: false,
  skipsPerHour: null,
  onDemandPlayback: true,
  smartShuffle: true,
  mix: true,
  aiPlaylist: true,
  aiPlaylistsPerDay: 20,
  maxAudioQuality: 'lossless',
  queueEdit: true,
  jamHost: true,
  offlineDownload: true,
  uploadTracksLimit: 200,
  uploadMaxMb: 50,
};

export function getEntitlements(product: Product, platform: Platform = 'web'): Entitlements {
  if (product === 'premium') return { ...PREMIUM };
  // Spotify Free on mobile: 6 skips per hour and no queue editing.
  if (platform === 'mobile') return { ...FREE, skipsPerHour: 6, queueEdit: false };
  return { ...FREE };
}

/**
 * When a renewal payment fails the subscription becomes `past_due`: the listener KEEPS Premium for
 * GRACE_DAYS while we retry the card once every RETRY_EVERY_HOURS, then it expires (back to Free).
 * The SQL function public.user_product() uses the same 7 days (migration …001100_billing_grace.sql).
 */
export const GRACE_DAYS = 7;
export const RETRY_EVERY_HOURS = 24;

/** How often a Free listener hears an ad break. */
export const AD_POLICY = {
  tracksBetweenBreaks: 3,
  maxMinutesBetweenBreaks: 15,
  adsPerBreak: 1,
} as const;

export interface Plan {
  id: PlanId;
  name: string;
  monthlyPrice: number;
  /** Intro offer: pay `introPrice` once for the first `introMonths` months (first-time Premium only). */
  introMonths: number;
  introPrice: number;
  accounts: number;
  requiresVerification: 'student' | null;
  /** Card accent color on the plans page. */
  color: string;
}

export const PLANS: readonly Plan[] = [
  {
    id: 'individual',
    name: 'Premium Individual',
    monthlyPrice: 65000,
    introMonths: 2,
    introPrice: 65000,
    accounts: 1,
    requiresVerification: null,
    color: '#1ed760', // as on spotify.com/premium (2026)
  },
  {
    id: 'student',
    name: 'Premium Student',
    monthlyPrice: 33000,
    introMonths: 2,
    introPrice: 33000,
    accounts: 1,
    requiresVerification: 'student',
    color: '#91eeda',
  },
];

export interface PrepaidOption {
  id: string;
  planId: PlanId;
  months: number;
  price: number;
}

export const PREPAID_OPTIONS: readonly PrepaidOption[] = [
  { id: 'individual-12m', planId: 'individual', months: 12, price: 650000 },
  { id: 'individual-6m', planId: 'individual', months: 6, price: 390000 },
  { id: 'individual-3m', planId: 'individual', months: 3, price: 195000 },
  { id: 'individual-1m', planId: 'individual', months: 1, price: 65000 },
  { id: 'student-1m', planId: 'student', months: 1, price: 33000 },
];

/** Benefit keys shown on the Premium page (labels live in the web app's i18n files). */
export const PREMIUM_BENEFITS = [
  'adFree',
  'offline',
  'anyOrder',
  'highQuality',
  'jam',
  'queue',
  'smartShuffle',
  'mix',
  'aiPlaylist',
  'uploads',
] as const;
export type PremiumBenefit = (typeof PREMIUM_BENEFITS)[number];

export function findPlan(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}
