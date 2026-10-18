/**
 * AI Playlist (Premium): "nhạc buồn cho đêm mưa, kiểu thập niên 90" → a ready playlist.
 *
 *   1. UNDERSTAND  Gemini converts the text into structured parameters (genres, moods, energy, tempo,
 *                  decades, artists, keywords). Fallback: a local keyword parser.
 *   2. RETRIEVE    our own recommender: nearest tracks to a target feature vector (pgvector),
 *                  + songs by artists the user named, + songs whose titles match the keywords.
 *   3. SCORE       similarity + how well each song fits the requested ranges + taste + popularity.
 *   4. DIVERSIFY   MMR + max songs per artist, then Smart Reorder for smooth transitions.
 *
 * The LLM never invents song names, so every result exists, is playable, and costs one cheap call.
 */
import type { AiIntent, AiPlaylistResult } from '../../contracts';
import { sql } from '../../db/client';
import { withVectorSearch } from '../../db/settings';
import { HttpError, notFound, paymentRequired, tooMany } from '../../lib/http';
import { logger } from '../../lib/logger';
import { getEntitlements } from '../billing/plans';
import { smartReorder, type MixFeatures } from '../music/reorder';
import { tasteTracks } from '../reco/taste';
import { centroid, cosine, featureVector, toPgVector } from '../reco/vector';
import { getProduct, getSettings } from '../users/service';
import { askGemini, geminiConfigured } from './gemini';
import { interpretLocally, normalizeLlmIntent, targetFeatures } from './interpret';

type Locale = 'vi' | 'en';

// ── Quota ────────────────────────────────────────────────────────────────────
export async function aiStatus(userId: string) {
  const ent = getEntitlements(await getProduct(userId));
  const [{ used } = { used: 0 }] = await sql<{ used: number }[]>`
    select count(*)::int as used from ai_requests where user_id = ${userId} and created_at > now() - interval '24 hours'`;
  return { available: ent.aiPlaylistsPerDay > 0, limit: ent.aiPlaylistsPerDay, remaining: Math.max(0, ent.aiPlaylistsPerDay - used), usesGemini: geminiConfigured() };
}

async function assertQuota(userId: string) {
  const s = await aiStatus(userId);
  if (!s.available) throw paymentRequired('premium_required');
  if (s.remaining <= 0) throw tooMany('ai_daily_limit', { limit: s.limit });
  return s;
}

// ── 1. Understand ────────────────────────────────────────────────────────────
async function interpret(prompt: string, locale: Locale, previous?: AiIntent | null): Promise<{ intent: AiIntent; usedAi: boolean }> {
  if (geminiConfigured()) {
    let raw: unknown;
    try {
      raw = await askGemini(prompt, previous);
    } catch (err) {
      logger.warn({ err: String(err) }, 'Gemini unavailable → keyword fallback');
    }
    if (raw !== undefined) {
      const intent = normalizeLlmIntent(raw, prompt);
      if (!intent) throw new HttpError(422, 'ai_prompt_rejected');
      return { intent: previous ? { ...intent, title: intent.title || previous.title } : intent, usedAi: true };
    }
  }
  const local = interpretLocally(prompt, locale);
  if (!previous) return { intent: local, usedAi: false };
  // Refining without Gemini: the new words override what they mention, the rest stays.
  return {
    intent: {
      ...previous,
      genres: local.genres.length ? local.genres : previous.genres,
      moods: local.moods.length ? local.moods : previous.moods,
      energy: local.energy ?? previous.energy,
      valence: local.valence ?? previous.valence,
      bpm: local.bpm ?? previous.bpm,
      decades: local.decades.length ? local.decades : previous.decades,
      keywords: [...new Set([...previous.keywords, ...local.keywords])].slice(0, 6),
    },
    usedAi: false,
  };
}

// ── 2–4. Retrieve, score, diversify ──────────────────────────────────────────
interface Row {
  id: string;
  artistId: string | null;
  vec: string;
  popularity: number;
  bpm: number | null;
  musicalKey: number | null;
  keyMode: number | null;
  energy: number | null;
  valence: number | null;
  genre: string | null;
  releaseDate: string | null;
}

const COLUMNS = sql`
  t.id, ta.artist_id, t.embedding::text as vec, t.popularity, t.bpm, t.musical_key, t.key_mode, t.energy, t.valence, t.genre, t.release_date`;
const FROM = sql`from tracks t left join track_artists ta on ta.track_id = t.id and ta.position = 0`;

/** Distance outside a [lo, hi] range, scaled to 0…1 (0 = inside). */
const outside = (x: number | null, r: [number, number] | null, scale: number) =>
  x == null || !r ? 0 : Math.min(1, Math.max(0, r[0] - x, x - r[1]) / scale);

export async function pickTracks(userId: string, intent: AiIntent, excludeIds: string[] = []): Promise<string[]> {
  const f = targetFeatures(intent);
  const targets = (intent.genres.length ? intent.genres : [null]).map((genre) =>
    featureVector({
      genre, energy: f.energy, valence: f.valence, danceability: null, acousticness: null, instrumentalness: null,
      bpm: f.bpm, musicalKey: null, keyMode: null, releaseDate: f.releaseDate, popularity: 60,
    }),
  );

  // Round-trip 1 — the listener's settings, hidden songs and taste, plus the artists they named
  // ("giống Đen Vâu" → their songs and songs that sound like them).
  const [settings, hidden, taste, named] = await Promise.all([
    getSettings(userId),
    sql<{ trackId: string }[]>`
      select track_id from track_feedback where user_id = ${userId} and (kind = 'hide' or (kind = 'snooze' and until > now()))`,
    // A little personalisation: lean towards the user's taste (like Spotify's AI Playlist does).
    tasteTracks(userId, 120).catch(() => []),
    Promise.all(intent.artists.map((name) => sql<{ id: string }[]>`
      select id from artists where owner_id is null and search_name operator(extensions.%) public.normalize_text(${name})
       order by extensions.similarity(search_name, public.normalize_text(${name})) desc, provider_followers desc limit 1`)),
  ]);
  const namedArtistIds = new Set(named.flatMap((rows) => rows.map((a) => a.id)));
  const tasteCenter = taste.length ? centroid(taste.map((t) => t.vector), taste.map((t) => t.weight)) : null;
  const excluded = [...new Set([...excludeIds, ...hidden.map((h) => h.trackId)])];
  const base = sql`t.origin = 'catalog' and t.is_playable and t.visibility = 'public' and t.embedding is not null
                   and not (t.id = any(${excluded}::uuid[])) ${settings.allowExplicit ? sql`` : sql`and not t.explicit`}`;
  // Keywords matched in titles ("mưa", "christmas").
  const patterns = intent.keywords.map((k) => `%${k.replace(/[%_\\]/g, '')}%`).filter((p) => p.length > 3);

  // Round-trip 2 — all candidate searches together.
  const [vectorLists, byArtist, byKeyword] = await Promise.all([
    // Candidates near each target vector (one target per requested genre).
    withVectorSearch((db) => Promise.all(targets.map((target) => db<Row[]>`
      select ${COLUMNS} ${FROM} where ${base}
       order by t.embedding operator(extensions.<=>) ${toPgVector(target)}::extensions.vector limit ${targets.length > 1 ? 200 : 350}`))),
    namedArtistIds.size
      ? sql<Row[]>`
          select ${COLUMNS} ${FROM}
           where ${base} and exists (select 1 from track_artists x where x.track_id = t.id and x.artist_id = any(${[...namedArtistIds]}::uuid[]))
           order by t.popularity desc limit 60`
      : [],
    patterns.length
      ? sql<Row[]>`
          select ${COLUMNS} ${FROM} where ${base} and t.search_title ilike any(${patterns}::text[]) order by t.popularity desc limit 60`
      : [],
  ]);
  const byVector = vectorLists.flat();
  const keywordIds = new Set(byKeyword.map((r) => r.id));

  const seen = new Set<string>();
  const candidates = [...byArtist, ...byKeyword, ...byVector]
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .map((r) => {
      const vector = JSON.parse(r.vec) as number[];
      const sim = Math.max(...targets.map((t) => cosine(vector, t)));
      const year = r.releaseDate ? new Date(r.releaseDate).getFullYear() : null;
      const decadeMiss = intent.decades.length && year != null && !intent.decades.some((d) => year >= d - 1 && year <= d + 11) ? 1 : 0;
      const fit =
        0.25 * outside(r.energy, intent.energy, 0.3) + 0.2 * outside(r.valence, intent.valence, 0.3) +
        0.2 * outside(r.bpm, intent.bpm, 25) + 0.2 * decadeMiss;
      const artistBonus = r.artistId && namedArtistIds.has(r.artistId) ? 0.35 : 0;
      const genreBonus = intent.genres.length && r.genre && intent.genres.includes(r.genre) ? 0.08 : 0;
      const affinity = tasteCenter ? 0.08 * cosine(vector, tasteCenter) : 0;
      const score = 0.6 * sim - fit + artistBonus + genreBonus + (keywordIds.has(r.id) ? 0.12 : 0) + 0.06 * (r.popularity / 100) + affinity;
      const features: MixFeatures = {
        id: r.id, bpm: r.bpm, energy: r.energy,
        key: r.musicalKey != null && (r.keyMode === 0 || r.keyMode === 1) ? { pitch: r.musicalKey, mode: r.keyMode as 0 | 1 } : null,
      };
      return { ...features, artistId: r.artistId, vector, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 400);

  // MMR: relevant AND different from what's already picked; cap songs per artist.
  const maxPerArtist = namedArtistIds.size ? 4 : 2;
  const picked: typeof candidates = [];
  const perArtist = new Map<string, number>();
  const pool = [...candidates];
  while (picked.length < intent.count && pool.length) {
    let best = -1;
    let bestValue = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const c = pool[i]!;
      if (c.artistId && (perArtist.get(c.artistId) ?? 0) >= maxPerArtist) continue;
      const redundancy = picked.length ? Math.max(...picked.slice(-12).map((p) => cosine(p.vector, c.vector))) : 0;
      const value = 0.8 * c.score - 0.2 * redundancy;
      if (value > bestValue) {
        bestValue = value;
        best = i;
      }
    }
    if (best < 0) break;
    const [chosen] = pool.splice(best, 1);
    picked.push(chosen!);
    if (chosen!.artistId) perArtist.set(chosen!.artistId, (perArtist.get(chosen!.artistId) ?? 0) + 1);
  }
  // Order for listening: smooth BPM / key / energy flow, starting from the best match.
  return smartReorder(picked, { keepFirst: true }).map((t) => t.id);
}

// ── Create / refine ──────────────────────────────────────────────────────────
export async function createAiPlaylist(userId: string, prompt: string, locale: Locale): Promise<AiPlaylistResult> {
  const quota = await assertQuota(userId);
  const { intent, usedAi } = await interpret(prompt, locale);
  const trackIds = await pickTracks(userId, intent);
  if (!trackIds.length) throw new HttpError(409, 'ai_no_matching_tracks');
  const settings = await getSettings(userId);
  const playlistId = await sql.begin(async (tx) => {
    const [p] = await tx<{ id: string }[]>`
      insert into playlists (owner_id, kind, name, description, is_public, generator)
      values (${userId}, 'ai', ${intent.title}, ${intent.description || null}, ${settings.publishNewPlaylists},
              ${tx.json({ prompts: [prompt], intent, usedAi } as never)})
      returning id`;
    await tx`insert into library_items (user_id, item_type, item_id) values (${userId}, 'playlist', ${p!.id})`;
    await tx`insert into playlist_tracks ${tx(trackIds.map((trackId, i) => ({ playlistId: p!.id, trackId, position: i + 1, addedBy: userId })))}`;
    await tx`insert into ai_requests (user_id, playlist_id, kind, prompt, used_ai) values (${userId}, ${p!.id}, 'create', ${prompt}, ${usedAi})`;
    return p!.id;
  });
  return { playlistId, intent, usedAi, remainingToday: quota.remaining - 1 };
}

export async function refineAiPlaylist(userId: string, playlistId: string, prompt: string, locale: Locale): Promise<AiPlaylistResult> {
  const [p] = await sql<{ ownerId: string; kind: string; generator: { prompts?: string[]; intent?: AiIntent } | null }[]>`
    select owner_id, kind, generator from playlists where id = ${playlistId}`;
  if (!p || p.ownerId !== userId || p.kind !== 'ai') throw notFound();
  const quota = await assertQuota(userId);
  const { intent, usedAi } = await interpret(prompt, locale, p.generator?.intent ?? null);
  const trackIds = await pickTracks(userId, intent);
  if (!trackIds.length) throw new HttpError(409, 'ai_no_matching_tracks');
  await sql.begin(async (tx) => {
    await tx`select id from playlists where id = ${playlistId} for update`;
    await tx`delete from playlist_tracks where playlist_id = ${playlistId}`;
    await tx`insert into playlist_tracks ${tx(trackIds.map((trackId, i) => ({ playlistId, trackId, position: i + 1, addedBy: userId })))}`;
    await tx`
      update playlists set description = ${intent.description || null}, updated_at = now(),
             generator = ${tx.json({ prompts: [...(p.generator?.prompts ?? []), prompt].slice(-10), intent, usedAi } as never)}
       where id = ${playlistId}`;
    await tx`insert into ai_requests (user_id, playlist_id, kind, prompt, used_ai) values (${userId}, ${playlistId}, 'refine', ${prompt}, ${usedAi})`;
  });
  return { playlistId, intent, usedAi, remainingToday: quota.remaining - 1 };
}

/** Prompt ideas shown on the AI Playlist screen. */
export const SUGGESTIONS: Record<Locale, string[]> = {
  vi: [
    'Nhạc buồn cho đêm mưa',
    'Rap sôi động để tập gym',
    'Lo-fi nhẹ nhàng để tập trung học bài',
    'Tình ca thập niên 90',
    'Nhạc điện tử cho chuyến xe đêm',
    'Acoustic thư giãn ở quán cà phê',
    'Nhạc vui tươi cho sáng chủ nhật',
    'Piano êm dịu để dễ ngủ',
  ],
  en: [
    'Sad songs for a rainy night',
    'High-energy rap for the gym',
    'Chill lo-fi to focus and study',
    'Love songs from the 90s',
    'Electronic music for a late-night drive',
    'Relaxed acoustic coffee shop vibes',
    'Feel-good songs for a Sunday morning',
    'Calm piano to fall asleep',
  ],
};
