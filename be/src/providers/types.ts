/**
 * Music providers (Adapter pattern).
 *
 * The rest of the backend never talks to Audius (or any future licensed catalog) directly. A provider:
 *   1. turns its own data into a provider-agnostic CatalogBundle that the loader writes to Postgres;
 *   2. resolves a playable stream URL for one of its tracks.
 * Switching to a licensed commercial catalog later = writing one more adapter with these two jobs
 * (that adapter would typically return short-lived signed URLs, possibly DRM-protected).
 */
import type { AudioQuality } from '../contracts';

export interface CatalogArtist {
  providerId: string;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  dominantColor: string | null;
  verified: boolean;
  providerFollowers: number;
  externalUrl: string | null;
}

export interface CatalogAlbum {
  providerId: string;
  title: string;
  releaseType: 'album' | 'single' | 'ep' | 'compilation';
  releaseDate: string | null;
  coverUrl: string | null;
  dominantColor: string | null;
  label: string | null;
  copyright: string | null;
  artistProviderIds: string[];
}

export interface CatalogTrack {
  providerId: string;
  title: string;
  durationMs: number;
  explicit: boolean;
  albumProviderId: string;
  trackNumber: number;
  artistProviderIds: string[];
  providerGenre: string | null;
  mood: string | null;
  tags: string[];
  bpm: number | null;
  /** Raw key text from the provider, e.g. "E flat minor". */
  musicalKey: string | null;
  releaseDate: string | null;
  providerPlayCount: number;
  favoriteCount: number;
  isrc: string | null;
}

export interface CatalogPlaylist {
  providerId: string;
  name: string;
  description: string | null;
  coverUrl: string | null;
  dominantColor: string | null;
  trackProviderIds: string[];
}

export interface CatalogBundle {
  provider: string;
  fetchedAt: string;
  artists: CatalogArtist[];
  albums: CatalogAlbum[];
  tracks: CatalogTrack[];
  playlists: CatalogPlaylist[];
}

export interface StreamTarget {
  provider: string;
  providerId: string | null;
  storagePath: string | null;
}

export interface ResolvedStream {
  url: string;
  /** Epoch ms after which the URL stops working (signed URLs), null = never. */
  expiresAt: number | null;
}

export interface MusicProvider {
  readonly id: string;
  resolveStream(target: StreamTarget, quality: AudioQuality): Promise<ResolvedStream>;
}
