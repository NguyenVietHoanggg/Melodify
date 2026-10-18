/**
 * Recommendation engine — "what should play next / what else would you like".
 *
 * Classic 3-stage recommender pipeline (the same shape Spotify, YouTube & Netflix use):
 *   1. CANDIDATES  ~250 nearest tracks in feature-vector space (pgvector HNSW index)
 *                 + ~150 tracks people put next to the seeds (co-occurrence)
 *   2. SCORING     similarity, co-listening, transition smoothness, popularity, taste, freshness
 *   3. RE-RANKING  Maximal Marginal Relevance (relevant AND different from what we already picked)
 *                 + a cap on songs per artist
 * Runs in a few milliseconds and costs nothing — no LLM call per song.
 */
import { sql } from '../../db/client';
import { withVectorSearch } from '../../db/settings';
import { transitionCost, type MixFeatures } from '../music/reorder';
import { centroid, cosine, toPgVector } from './vector';

interface CandidateRow {
  id: string;
  artistId: string | null;
  vec: string | null;
  popularity: number;
  bpm: number | null;
  musicalKey: number | null;
  keyMode: number | null;
  energy: number | null;
}

interface Candidate extends MixFeatures {
  artistId: string | null;
  vector: number[];
  popularity: number;
  cooc: number;
  score: number;
}

export interface RecommendOptions {
  /** Most important first (e.g. the most recently played track). */
  seedTrackIds: string[];
  excludeTrackIds?: string[];
  userId?: string | null;
  limit: number;
  origin?: 'catalog' | 'upload';
  /** Prefer tracks that blend smoothly out of this one (autoplay, Smart Shuffle). */
  transitionFromId?: string | null;
  /** MMR λ: 1 = pure relevance, 0 = pure diversity. */
  lambda?: number;
  maxPerArtist?: number;
  /** Down-rank tracks the user heard in the last few days. */
  freshness?: boolean;
  /** Small random jitter so "Refresh" gives different results. */
  jitter?: number;
}

const toFeatures = (r: CandidateRow) => ({
  bpm: r.bpm,
  key: r.musicalKey != null && (r.keyMode === 0 || r.keyMode === 1) ? { pitch: r.musicalKey, mode: r.keyMode as 0 | 1 } : null,
  energy: r.energy,
});

const CANDIDATE_COLUMNS = sql`
  t.id, ta.artist_id, t.embedding::text as vec, t.popularity, t.bpm, t.musical_key, t.key_mode, t.energy`;

export async function recommend(opts: RecommendOptions): Promise<string[]> {
  const {
    seedTrackIds, excludeTrackIds = [], userId = null, limit, origin = 'catalog',
    transitionFromId = null, lambda = 0.75, maxPerArtist = 2, freshness = true, jitter = 0,
  } = opts;
  if (!seedTrackIds.length || limit <= 0) return [];
  const given = [...new Set([...seedTrackIds, ...excludeTrackIds])];

  // Round-trip 1 — everything that only needs the inputs: the seeds, the listener's signals and the songs
  // people put next to the seeds (co-occurrence).
  const [seeds, signals, coAll] = await Promise.all([
    sql<CandidateRow[]>`
      select ${CANDIDATE_COLUMNS} from tracks t
        left join track_artists ta on ta.track_id = t.id and ta.position = 0
       where t.id = any(${seedTrackIds}::uuid[]) and t.embedding is not null`,
    userId
      ? Promise.all([
          sql<{ trackId: string }[]>`
            select track_id from track_feedback
             where user_id = ${userId} and (kind = 'hide' or (kind = 'snooze' and until > now()))`,
          freshness
            ? sql<{ trackId: string }[]>`
                select distinct track_id from play_events
                 where user_id = ${userId} and track_id is not null and started_at > now() - interval '3 days'`
            : [],
          sql<{ artistId: string }[]>`
            select item_id as artist_id from library_items where user_id = ${userId} and item_type = 'artist'
            union
            select ta.artist_id from saved_tracks s join track_artists ta on ta.track_id = s.track_id where s.user_id = ${userId}`,
        ])
      : null,
    sql<{ trackB: string; w: number }[]>`
      select c.track_b, sum(c.weight)::real as w from track_cooccurrence c
       where c.track_a = any(${seedTrackIds}::uuid[]) and not (c.track_b = any(${given}::uuid[]))
       group by c.track_b order by w desc limit 150`,
  ]);
  if (!seeds.length) return [];
  const seedOrder = new Map(seedTrackIds.map((id, i) => [id, i]));
  seeds.sort((a, b) => (seedOrder.get(a.id) ?? 0) - (seedOrder.get(b.id) ?? 0));
  // Recent/important seeds weigh more: 1, 0.87, 0.77, …
  const center = centroid(seeds.map((s) => JSON.parse(s.vec!) as number[]), seeds.map((_, i) => 1 / (1 + i * 0.15)));

  // Never recommend: the seeds, explicit exclusions, hidden/snoozed songs, (optionally) recent plays.
  const excluded = new Set(given);
  const [hidden = [], recentRows = [], artists = []] = signals ?? [];
  hidden.forEach((h) => excluded.add(h.trackId));
  const recent = new Set(recentRows.map((r) => r.trackId));
  const affinityArtists = new Set(artists.map((a) => a.artistId));
  const coRows = coAll.filter((r) => !excluded.has(r.trackB));

  // ── 1. Candidate generation (round-trip 2: both kinds of candidates together) ──
  const [byVector, coDetails] = await Promise.all([
    withVectorSearch((db) => db<CandidateRow[]>`
      select ${CANDIDATE_COLUMNS} from tracks t
        left join track_artists ta on ta.track_id = t.id and ta.position = 0
       where t.origin = ${origin} and t.is_playable and t.visibility = 'public' and t.embedding is not null
         and not (t.id = any(${[...excluded]}::uuid[]))
       order by t.embedding operator(extensions.<=>) ${toPgVector(center)}::extensions.vector
       limit 250`),
    coRows.length
      ? sql<CandidateRow[]>`
          select ${CANDIDATE_COLUMNS} from tracks t
            left join track_artists ta on ta.track_id = t.id and ta.position = 0
           where t.id = any(${coRows.map((r) => r.trackB)}::uuid[]) and t.origin = ${origin} and t.is_playable
             and t.visibility = 'public' and t.embedding is not null`
      : [],
  ]);
  const coWeight = new Map(coRows.map((r) => [r.trackB, r.w]));
  const inVector = new Set(byVector.map((c) => c.id));
  const byCo = coDetails.filter((r) => !inVector.has(r.id));

  // ── 2. Scoring ──────────────────────────────────────────────────────────────
  const from = transitionFromId ? seeds.find((s) => s.id === transitionFromId) : undefined;
  const fromFeatures = from ? { id: from.id, ...toFeatures(from) } : undefined;
  const maxCo = Math.max(1, ...coRows.map((r) => r.w));
  const candidates: Candidate[] = [...byVector, ...byCo].map((r) => {
    const vector = JSON.parse(r.vec!) as number[];
    const features = { id: r.id, ...toFeatures(r) };
    const sim = cosine(vector, center);
    const cooc = Math.log1p(coWeight.get(r.id) ?? 0) / Math.log1p(maxCo);
    const smooth = fromFeatures ? Math.exp(-transitionCost(fromFeatures, features) / 2) : 0.5;
    const affinity = r.artistId && affinityArtists.has(r.artistId) ? 0.08 : 0;
    const stale = recent.has(r.id) ? 0.25 : 0;
    const noise = jitter ? (Math.random() - 0.5) * jitter : 0;
    const score = 0.55 * sim + 0.2 * cooc + 0.12 * smooth + 0.08 * (r.popularity / 100) + affinity - stale + noise;
    return { ...features, artistId: r.artistId, vector, popularity: r.popularity, cooc, score };
  });

  // ── 3. Re-ranking: MMR + artist cap ─────────────────────────────────────────
  const picked: Candidate[] = [];
  const perArtist = new Map<string, number>();
  const pool = candidates.sort((a, b) => b.score - a.score).slice(0, 400);
  while (picked.length < limit && pool.length) {
    let bestIdx = -1;
    let bestValue = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const c = pool[i]!;
      if (c.artistId && (perArtist.get(c.artistId) ?? 0) >= maxPerArtist) continue;
      const redundancy = picked.length ? Math.max(...picked.map((p) => cosine(p.vector, c.vector))) : 0;
      const value = lambda * c.score - (1 - lambda) * redundancy;
      if (value > bestValue) {
        bestValue = value;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) break;
    const [chosen] = pool.splice(bestIdx, 1);
    picked.push(chosen!);
    if (chosen!.artistId) perArtist.set(chosen!.artistId, (perArtist.get(chosen!.artistId) ?? 0) + 1);
  }
  return picked.map((p) => p.id);
}

/** Tracks of a context in order — the usual seed source for radios and Smart Shuffle. */
export async function seedsForArtist(artistId: string, n = 5): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    select t.id from tracks t join track_artists ta on ta.track_id = t.id and ta.artist_id = ${artistId}
     where t.is_playable order by (t.play_count + t.provider_play_count) desc limit ${n}`;
  return rows.map((r) => r.id);
}
