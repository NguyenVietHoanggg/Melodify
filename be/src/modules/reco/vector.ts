/**
 * The 32-dimensional feature vector stored in tracks.embedding (pgvector).
 *
 * Hand-crafted ("content-based") embedding: every dimension means something.
 *   0–15  macro genre (one-hot)                      weight 1.0  → genre dominates similarity
 *   16–17 valence, energy                             weight 0.6
 *   18–20 danceability, acousticness, instrumentalness
 *   21–22 tempo on an octave circle (85 ≈ 170 BPM)   — half/double time feel the same
 *   23    tempo magnitude
 *   24–26 key on the Camelot wheel + major/minor
 *   27    era (release year)
 *   28    popularity
 *   29–31 reserved (e.g. a learned collaborative embedding later)
 * Cosine distance between two vectors = how "similar in vibe" two tracks are.
 */
import { MACRO_GENRES, type MacroGenre } from '../music/taxonomy';
import { toCamelot } from '../music/keys';

export const VECTOR_DIMS = 32;

export interface VectorInput {
  genre: string | null;
  energy: number | null;
  valence: number | null;
  danceability: number | null;
  acousticness: number | null;
  instrumentalness: number | null;
  bpm: number | null;
  musicalKey: number | null;
  keyMode: number | null;
  releaseDate: string | null;
  popularity: number;
}

const centered = (x: number | null, fallback = 0.5) => (x ?? fallback) - 0.5;

export function featureVector(t: VectorInput): number[] {
  const v = new Array<number>(VECTOR_DIMS).fill(0);
  const g = MACRO_GENRES.indexOf(t.genre as MacroGenre);
  if (g >= 0) v[g] = 1;

  v[16] = centered(t.valence) * 1.2;
  v[17] = centered(t.energy) * 1.2;
  v[18] = centered(t.danceability) * 0.8;
  v[19] = centered(t.acousticness, 0.3) * 0.8;
  v[20] = centered(t.instrumentalness, 0.3) * 0.8;

  if (t.bpm) {
    const octave = Math.log2(t.bpm / 60) % 1;
    v[21] = Math.cos(2 * Math.PI * octave) * 0.4;
    v[22] = Math.sin(2 * Math.PI * octave) * 0.4;
    v[23] = ((t.bpm - 120) / 60) * 0.25;
  }
  if (t.musicalKey != null && (t.keyMode === 0 || t.keyMode === 1)) {
    const cam = toCamelot({ pitch: t.musicalKey, mode: t.keyMode });
    const angle = (2 * Math.PI * (cam.number - 1)) / 12;
    v[24] = Math.cos(angle) * 0.25;
    v[25] = Math.sin(angle) * 0.25;
    v[26] = t.keyMode === 1 ? 0.15 : -0.15;
  }
  if (t.releaseDate) v[27] = ((new Date(t.releaseDate).getFullYear() - 2015) / 15) * 0.3;
  v[28] = (t.popularity / 100 - 0.5) * 0.2;
  return v.map((x) => Math.round(x * 1e4) / 1e4);
}

/** pgvector text format: "[0.1,0.2,…]" */
export const toPgVector = (v: number[]) => `[${v.join(',')}]`;

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Weighted average of vectors (e.g. the "centre" of a playlist or of a user's taste). */
export function centroid(vectors: number[][], weights?: number[]): number[] {
  const out = new Array<number>(VECTOR_DIMS).fill(0);
  let total = 0;
  vectors.forEach((vec, i) => {
    const w = weights?.[i] ?? 1;
    total += w;
    for (let d = 0; d < VECTOR_DIMS; d++) out[d]! += (vec[d] ?? 0) * w;
  });
  return total ? out.map((x) => x / total) : out;
}
