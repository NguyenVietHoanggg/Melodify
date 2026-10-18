/**
 * Audius adapter — free, full-length, artist-uploaded music with an open API (no key, just an app name).
 * Docs: https://docs.audius.org/developers/api
 */
import type { CatalogArtist, CatalogTrack, MusicProvider } from './types';

const BASE = 'https://api.audius.co/v1';
const appName = () => process.env.AUDIUS_APP_NAME || 'melodify_learning';

// ── Raw API shapes (only the fields we use) ─────────────────────────────────
export interface AudiusImageSet {
  '150x150'?: string;
  '480x480'?: string;
  '1000x1000'?: string;
  '640x'?: string;
  '2000x'?: string;
  mirrors?: string[];
}

export interface AudiusUser {
  id: string;
  name: string;
  handle: string;
  bio: string | null;
  is_verified: boolean;
  follower_count: number;
  profile_picture: AudiusImageSet | null;
  cover_photo: AudiusImageSet | null;
}

export interface AudiusTrack {
  id: string;
  title: string;
  duration: number;
  genre: string | null;
  mood: string | null;
  tags: string | null;
  release_date: string | null;
  created_at: string | null;
  play_count: number;
  favorite_count: number;
  artwork: AudiusImageSet | null;
  user: AudiusUser;
  bpm: number | null;
  musical_key: string | null;
  isrc: string | null;
  parental_warning_type: string | null;
  is_streamable?: boolean;
  is_stream_gated?: boolean;
  is_delete?: boolean;
  is_unlisted?: boolean;
  is_available?: boolean;
  album_backlink?: { playlist_id: string; playlist_name: string } | null;
}

export interface AudiusPlaylist {
  id: string;
  playlist_name: string;
  description: string | null;
  is_album: boolean;
  is_private?: boolean;
  is_delete?: boolean;
  is_stream_gated?: boolean;
  artwork: AudiusImageSet | null;
  user: AudiusUser;
  track_count: number;
  release_date?: string | null;
  created_at?: string | null;
}

// ── HTTP with timeout + retries (public APIs hiccup; scripts must not die on one bad request) ──
async function call<T>(path: string, params: Record<string, string | number | undefined> = {}, attempt = 1): Promise<T> {
  const url = new URL(BASE + path);
  url.searchParams.set('app_name', appName());
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { accept: 'application/json' } });
    if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
    if (!res.ok) return [] as T; // 404 for a deleted playlist etc. → treat as empty
    const json = (await res.json()) as { data: T };
    return json.data;
  } catch (err) {
    if (attempt >= 3) throw err;
    await new Promise((r) => setTimeout(r, 1000 * attempt * attempt));
    return call<T>(path, params, attempt + 1);
  }
}

export const audiusApi = {
  trendingTracks: (genre: string | undefined, time: 'week' | 'month' | 'year' | 'allTime', limit = 50) =>
    call<AudiusTrack[]>('/tracks/trending', { genre, time, limit }),
  trendingPlaylists: (time: 'week' | 'month' | 'year' | 'allTime', limit = 50) =>
    call<AudiusPlaylist[]>('/playlists/trending', { time, limit }),
  playlist: async (id: string) => (await call<AudiusPlaylist[]>(`/playlists/${id}`))[0] ?? null,
  playlistTracks: (id: string) => call<AudiusTrack[]>(`/playlists/${id}/tracks`),
  streamUrl: (trackId: string) => `${BASE}/tracks/${encodeURIComponent(trackId)}/stream?app_name=${encodeURIComponent(appName())}`,
};

// ── Mapping helpers ─────────────────────────────────────────────────────────
/** Primary URL first, then the same path on every mirror host. */
export function imageCandidates(set: AudiusImageSet | null | undefined, size: keyof AudiusImageSet): string[] {
  const primary = set?.[size];
  if (!primary || typeof primary !== 'string') return [];
  const path = new URL(primary).pathname;
  return [primary, ...(set?.mirrors ?? []).map((host) => host + path)];
}

export const isPlayableAudiusTrack = (t: AudiusTrack) =>
  t.is_streamable !== false && !t.is_stream_gated && !t.is_delete && !t.is_unlisted && t.is_available !== false &&
  t.duration >= 45 && t.duration <= 900;

export function mapArtist(u: AudiusUser): CatalogArtist {
  return {
    providerId: u.id,
    name: u.name.trim() || u.handle,
    bio: u.bio?.trim() || null,
    avatarUrl: u.profile_picture?.['480x480'] ?? u.profile_picture?.['150x150'] ?? null,
    bannerUrl: u.cover_photo?.['2000x'] ?? u.cover_photo?.['640x'] ?? null,
    dominantColor: null,
    verified: u.is_verified,
    providerFollowers: u.follower_count ?? 0,
    externalUrl: `https://audius.co/${u.handle}`,
  };
}

export function mapTrack(t: AudiusTrack, albumProviderId: string, trackNumber: number): CatalogTrack {
  const tags = (t.tags ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 12);
  return {
    providerId: t.id,
    title: t.title.trim(),
    durationMs: Math.round(t.duration * 1000),
    explicit: (t.parental_warning_type ?? '').toLowerCase() === 'explicit' || tags.some((x) => /explicit/i.test(x)),
    albumProviderId,
    trackNumber,
    artistProviderIds: [t.user.id],
    providerGenre: t.genre || null,
    mood: t.mood || null,
    tags,
    bpm: t.bpm && t.bpm >= 30 && t.bpm <= 300 ? Math.round(t.bpm * 10) / 10 : null,
    musicalKey: t.musical_key || null,
    releaseDate: (t.release_date ?? t.created_at)?.slice(0, 10) ?? null,
    providerPlayCount: t.play_count ?? 0,
    favoriteCount: t.favorite_count ?? 0,
    isrc: t.isrc || null,
  };
}

export const audiusProvider: MusicProvider = {
  id: 'audius',
  async resolveStream(target) {
    // Audius serves a single quality; a licensed provider would pick a bitrate from `quality` here.
    return { url: audiusApi.streamUrl(target.providerId!), expiresAt: null };
  },
};
