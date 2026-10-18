import type { AudioQuality, StreamInfo } from '../../contracts';
import { sql } from '../../db/client';
import { logger } from '../../lib/logger';
import { getProvider } from '../../providers';
import { allAds } from './ads';
import type { Entry } from './state';

// Signed URLs are reused until shortly before they expire.
const cache = new Map<string, StreamInfo>();

export async function streamFor(e: Entry, quality: AudioQuality): Promise<StreamInfo | null> {
  if (e.kind === 'ad') {
    const ad = (await allAds()).get(e.id);
    if (!ad) return null;
    return { url: ad.audioUrl, speech: ad.ttsScript ? { text: ad.ttsScript, lang: ad.ttsLang ?? 'vi-VN' } : null, expiresAt: null };
  }
  if (e.kind === 'episode') {
    const [ep] = await sql<{ audioUrl: string }[]>`select audio_url from episodes where id = ${e.id}`;
    return ep ? { url: ep.audioUrl, speech: null, expiresAt: null } : null;
  }
  const hit = cache.get(`${e.id}:${quality}`);
  if (hit && (hit.expiresAt === null || hit.expiresAt - Date.now() > 5 * 60_000)) return hit;
  const [t] = await sql<{ provider: string; providerId: string | null; storagePath: string | null }[]>`
    select provider, provider_id, storage_path from tracks where id = ${e.id} and is_playable`;
  if (!t) return null;
  const provider = getProvider(t.provider);
  if (!provider) return null;
  try {
    const s = await provider.resolveStream({ provider: t.provider, providerId: t.providerId, storagePath: t.storagePath }, quality);
    const info: StreamInfo = { url: s.url, speech: null, expiresAt: s.expiresAt };
    cache.set(`${e.id}:${quality}`, info);
    return info;
  } catch (err) {
    logger.warn({ err, trackId: e.id }, 'stream resolution failed');
    return null;
  }
}
