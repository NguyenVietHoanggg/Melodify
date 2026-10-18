/**
 * Genre & mood taxonomy + feature estimation from metadata.
 *
 * Providers use different genre names ("Hip-Hop/Rap", "Tech House"…). We fold them into 16 macro genres
 * so recommendations, browse categories and the feature vector have a stable vocabulary.
 *
 * Audius gives us BPM, key, genre and a mood word, but not Spotify-style "energy"/"valence".
 * We ESTIMATE them from the mood (Russell's circumplex model: valence × arousal) and genre priors.
 * Uploaded tracks get real values from audio analysis instead (modules/music/analysis.ts).
 */

export const MACRO_GENRES = [
  'pop', 'hiphop', 'rnb', 'electronic', 'house', 'techno', 'bass', 'rock',
  'alternative', 'lofi', 'ambient', 'jazz', 'classical', 'acoustic', 'world', 'soundtrack',
] as const;
export type MacroGenre = (typeof MACRO_GENRES)[number];

const PROVIDER_GENRE_MAP: Record<string, MacroGenre> = {
  'pop': 'pop', 'hyperpop': 'pop', 'k-pop': 'pop',
  'hip-hop/rap': 'hiphop', 'hip-hop': 'hiphop', 'rap': 'hiphop', 'trap': 'hiphop',
  'r&b/soul': 'rnb', 'r&b': 'rnb', 'soul': 'rnb', 'funk': 'rnb',
  'electronic': 'electronic', 'electro': 'electronic', 'downtempo': 'electronic', 'future bass': 'electronic',
  'house': 'house', 'tech house': 'house', 'deep house': 'house', 'progressive house': 'house',
  'future house': 'house', 'tropical house': 'house', 'disco': 'house',
  'techno': 'techno', 'trance': 'techno', 'hardstyle': 'techno',
  'drum & bass': 'bass', 'dubstep': 'bass', 'jungle': 'bass', 'moombahton': 'bass', 'jersey club': 'bass',
  'rock': 'rock', 'metal': 'rock', 'punk': 'rock',
  'alternative': 'alternative', 'experimental': 'alternative', 'indie': 'alternative',
  'lo-fi': 'lofi', 'lofi': 'lofi',
  'ambient': 'ambient',
  'jazz': 'jazz', 'blues': 'jazz',
  'classical': 'classical',
  'acoustic': 'acoustic', 'folk': 'acoustic', 'country': 'acoustic',
  'world': 'world', 'latin': 'world', 'reggae': 'world', 'dancehall': 'world', 'devotional': 'world',
  'soundtrack': 'soundtrack', 'cinematic': 'soundtrack',
};

/** Non-music genres we never import into the music catalog. */
export const EXCLUDED_PROVIDER_GENRES = new Set(['podcasts', 'audiobooks', 'spoken word', 'comedy', 'kids']);

export function toMacroGenre(providerGenre: string | null | undefined): MacroGenre | null {
  if (!providerGenre) return null;
  return PROVIDER_GENRE_MAP[providerGenre.trim().toLowerCase()] ?? null;
}

/** Typical character of each macro genre: energy, danceability, acousticness, instrumentalness. */
const GENRE_PRIORS: Record<MacroGenre, { e: number; d: number; a: number; i: number }> = {
  pop: { e: 0.65, d: 0.68, a: 0.2, i: 0.05 },
  hiphop: { e: 0.68, d: 0.74, a: 0.1, i: 0.1 },
  rnb: { e: 0.5, d: 0.66, a: 0.25, i: 0.05 },
  electronic: { e: 0.72, d: 0.66, a: 0.05, i: 0.55 },
  house: { e: 0.78, d: 0.82, a: 0.03, i: 0.6 },
  techno: { e: 0.86, d: 0.74, a: 0.02, i: 0.8 },
  bass: { e: 0.9, d: 0.62, a: 0.02, i: 0.6 },
  rock: { e: 0.8, d: 0.45, a: 0.15, i: 0.1 },
  alternative: { e: 0.6, d: 0.45, a: 0.3, i: 0.3 },
  lofi: { e: 0.3, d: 0.6, a: 0.35, i: 0.8 },
  ambient: { e: 0.15, d: 0.2, a: 0.4, i: 0.9 },
  jazz: { e: 0.4, d: 0.5, a: 0.7, i: 0.6 },
  classical: { e: 0.25, d: 0.2, a: 0.9, i: 0.95 },
  acoustic: { e: 0.35, d: 0.45, a: 0.85, i: 0.2 },
  world: { e: 0.6, d: 0.7, a: 0.45, i: 0.3 },
  soundtrack: { e: 0.45, d: 0.3, a: 0.5, i: 0.85 },
};

/** Mood words → (valence, energy) on Russell's circumplex. Keys are Audius' mood vocabulary. */
export const MOOD_SPACE: Record<string, { v: number; e: number }> = {
  Peaceful: { v: 0.6, e: 0.2 },
  Romantic: { v: 0.7, e: 0.4 },
  Sentimental: { v: 0.45, e: 0.3 },
  Tender: { v: 0.6, e: 0.25 },
  Easygoing: { v: 0.7, e: 0.4 },
  Yearning: { v: 0.35, e: 0.4 },
  Sophisticated: { v: 0.6, e: 0.45 },
  Sensual: { v: 0.6, e: 0.45 },
  Cool: { v: 0.55, e: 0.5 },
  Gritty: { v: 0.35, e: 0.7 },
  Melancholy: { v: 0.2, e: 0.3 },
  Serious: { v: 0.35, e: 0.5 },
  Brooding: { v: 0.25, e: 0.5 },
  Fiery: { v: 0.5, e: 0.85 },
  Defiant: { v: 0.4, e: 0.8 },
  Aggressive: { v: 0.25, e: 0.95 },
  Rowdy: { v: 0.55, e: 0.9 },
  Excited: { v: 0.8, e: 0.85 },
  Energizing: { v: 0.7, e: 0.85 },
  Empowering: { v: 0.75, e: 0.75 },
  Stirring: { v: 0.6, e: 0.7 },
  Upbeat: { v: 0.85, e: 0.75 },
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export interface EstimatedFeatures {
  energy: number;
  valence: number;
  danceability: number;
  acousticness: number;
  instrumentalness: number;
}

export function estimateFeatures(input: {
  genre: MacroGenre | null;
  mood: string | null;
  bpm: number | null;
  title: string;
  tags: string[];
}): EstimatedFeatures {
  const g = input.genre ? GENRE_PRIORS[input.genre] : { e: 0.55, d: 0.55, a: 0.3, i: 0.3 };
  const m = input.mood ? MOOD_SPACE[input.mood] : undefined;
  const tempoEnergy = input.bpm ? clamp01((input.bpm - 60) / 120) : g.e;

  const energy = clamp01((m ? 0.5 * m.e : 0.5 * g.e) + 0.35 * g.e + 0.15 * tempoEnergy);
  const valence = clamp01(m ? m.v : 0.5);
  // Danceability peaks in the 100–135 BPM pocket where most dance music lives.
  const inPocket = input.bpm ? input.bpm >= 100 && input.bpm <= 135 : false;
  const danceability = clamp01(g.d + (inPocket ? 0.08 : -0.04));

  const text = `${input.title} ${input.tags.join(' ')}`.toLowerCase();
  let instrumentalness = g.i;
  if (/instrumental|\bbeat\b|type beat|lofi|lo-fi|ambient/.test(text)) instrumentalness += 0.2;
  if (/feat\.|\bft\.|vocal|lyrics|remix/.test(text)) instrumentalness -= 0.2;
  const acousticness = clamp01(g.a + (/acoustic|piano|guitar|unplugged/.test(text) ? 0.2 : 0));

  return { energy, valence, danceability, acousticness, instrumentalness: clamp01(instrumentalness) };
}

/**
 * Browse categories (Search page). Colors are Spotify's own category palette.
 * `query` tells the backend how to fill the category page.
 */
export const CATEGORY_SEED: {
  id: string; vi: string; en: string; color: string; kind: string; query: Record<string, unknown>;
}[] = [
  { id: 'music', vi: 'Nhạc', en: 'Music', color: '#dc148c', kind: 'genre', query: {} },
  { id: 'podcasts', vi: 'Podcast', en: 'Podcasts', color: '#006450', kind: 'podcasts', query: {} },
  { id: 'made-for-you', vi: 'Dành Cho Bạn', en: 'Made For You', color: '#1e3264', kind: 'made_for_you', query: {} },
  { id: 'new-releases', vi: 'Mới phát hành', en: 'New Releases', color: '#608108', kind: 'new', query: {} },
  { id: 'community', vi: 'Cộng đồng', en: 'Community', color: '#8400e7', kind: 'community', query: {} },
  { id: 'charts', vi: 'Bảng xếp hạng', en: 'Charts', color: '#8d67ab', kind: 'charts', query: {} },
  { id: 'pop', vi: 'Pop', en: 'Pop', color: '#477d95', kind: 'genre', query: { genres: ['pop'] } },
  { id: 'hiphop', vi: 'Hip-Hop', en: 'Hip-Hop', color: '#e13300', kind: 'genre', query: { genres: ['hiphop'] } },
  { id: 'electronic', vi: 'Điện tử', en: 'Electronic', color: '#0d73ec', kind: 'genre', query: { genres: ['electronic', 'techno', 'bass'] } },
  { id: 'dance', vi: 'Dance/House', en: 'Dance/House', color: '#d84000', kind: 'genre', query: { genres: ['house'] } },
  { id: 'rnb', vi: 'R&B', en: 'R&B', color: '#dc148c', kind: 'genre', query: { genres: ['rnb'] } },
  { id: 'lofi', vi: 'Lo-fi', en: 'Lo-fi', color: '#537aa1', kind: 'genre', query: { genres: ['lofi'] } },
  { id: 'rock', vi: 'Rock', en: 'Rock', color: '#e91429', kind: 'genre', query: { genres: ['rock'] } },
  { id: 'indie', vi: 'Indie', en: 'Indie', color: '#e1118c', kind: 'genre', query: { genres: ['alternative'] } },
  { id: 'chill', vi: 'Thư giãn', en: 'Chill', color: '#27856a', kind: 'mood', query: { moods: ['Peaceful', 'Easygoing', 'Tender', 'Cool'] } },
  { id: 'mood', vi: 'Tâm trạng', en: 'Mood', color: '#e1118c', kind: 'mood', query: { moods: ['Sentimental', 'Melancholy', 'Yearning', 'Romantic'] } },
  { id: 'workout', vi: 'Tập luyện', en: 'Workout', color: '#777777', kind: 'mood', query: { moods: ['Energizing', 'Fiery', 'Aggressive', 'Empowering'], minBpm: 115 } },
  { id: 'party', vi: 'Tiệc tùng', en: 'Party', color: '#af2896', kind: 'mood', query: { moods: ['Upbeat', 'Excited', 'Rowdy'] } },
  { id: 'focus', vi: 'Tập trung', en: 'Focus', color: '#503750', kind: 'mood', query: { genres: ['lofi', 'ambient', 'classical'], maxEnergy: 0.5 } },
  { id: 'sleep', vi: 'Ngủ ngon', en: 'Sleep', color: '#1e3264', kind: 'mood', query: { genres: ['ambient', 'classical'], maxEnergy: 0.35 } },
  { id: 'romance', vi: 'Lãng mạn', en: 'Romance', color: '#8c1932', kind: 'mood', query: { moods: ['Romantic', 'Sensual', 'Tender'] } },
  { id: 'jazz', vi: 'Jazz', en: 'Jazz', color: '#a56752', kind: 'genre', query: { genres: ['jazz'] } },
  { id: 'acoustic', vi: 'Acoustic', en: 'Acoustic', color: '#bc5900', kind: 'genre', query: { genres: ['acoustic'] } },
  { id: 'classical', vi: 'Cổ điển', en: 'Classical', color: '#7d4b32', kind: 'genre', query: { genres: ['classical'] } },
  { id: 'world', vi: 'Âm nhạc thế giới', en: 'World', color: '#148a08', kind: 'genre', query: { genres: ['world'] } },
  { id: 'ambient', vi: 'Ambient', en: 'Ambient', color: '#2d46b9', kind: 'genre', query: { genres: ['ambient'] } },
  { id: 'soundtrack', vi: 'Nhạc phim', en: 'Soundtracks', color: '#b06239', kind: 'genre', query: { genres: ['soundtrack'] } },
  { id: 'discover', vi: 'Khám phá', en: 'Discover', color: '#8d67ab', kind: 'discover', query: {} },
];
