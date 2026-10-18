/** Ad pacing for Free listeners — decided on the server so a modified client can't skip it. */
import type { AdInfo } from '../../contracts';
import { sql } from '../../db/client';
import { AD_POLICY } from '../billing/plans';
import type { SessionState } from './state';

export function adDue(s: SessionState, now = Date.now()): boolean {
  if (s.tracksSinceAd >= AD_POLICY.tracksBetweenBreaks) return true;
  return s.tracksSinceAd >= 1 && now - s.lastAdAt > AD_POLICY.maxMinutesBetweenBreaks * 60_000;
}

export interface AdRow extends AdInfo {
  weight: number;
  isLive: boolean;
  audioUrl: string | null;
  ttsScript: string | null;
  ttsLang: string | null;
}

// The ads table is tiny and changes rarely: keep it in memory instead of asking the database on every song.
const TTL_MS = 60_000;
let cache: { at: number; rows: Promise<Map<string, AdRow>> } | null = null;

export function allAds(): Promise<Map<string, AdRow>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  const rows = sql<AdRow[]>`
    select id, advertiser, title, body, image_url, cta_label, click_url, bg_color, coalesce(duration_ms, 15000) as duration_ms,
           weight, audio_url, tts_script, tts_lang,
           (is_active and format = 'audio' and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())) as is_live
      from ads`.then((r) => new Map(r.map((a) => [a.id, a])));
  cache = { at: Date.now(), rows };
  rows.catch(() => (cache = null)); // a failed load is retried on the next call
  return rows;
}

const lastAdOf = new Map<string, string>();

/** Weighted random pick (weight 4 shows up 4× as often as weight 1), never the same ad twice in a row. */
export async function pickAd(userId: string): Promise<{ adId: string; impressionId: number; durationMs: number } | null> {
  const ads = [...(await allAds()).values()].filter((a) => a.isLive);
  if (!ads.length) return null;
  const last = lastAdOf.get(userId);
  const pool = ads.length > 1 ? ads.filter((a) => a.id !== last) : ads;
  let r = Math.random() * pool.reduce((s, a) => s + a.weight, 0);
  const chosen = pool.find((a) => (r -= a.weight) < 0) ?? pool[0]!;
  const [imp] = await sql<{ id: number }[]>`insert into ad_impressions (ad_id, user_id) values (${chosen.id}, ${userId}) returning id`;
  lastAdOf.set(userId, chosen.id);
  return { adId: chosen.id, impressionId: imp!.id, durationMs: chosen.durationMs };
}

export async function adDuration(adId: string): Promise<number> {
  return (await allAds()).get(adId)?.durationMs ?? 15_000;
}
