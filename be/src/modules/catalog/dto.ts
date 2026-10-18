/** Row → DTO mappers. Keeping them in one place guarantees every endpoint sends identical shapes. */
import type { AiIntent, ArtistRef, Card, MixCover, Playlist, Track, UserRef } from '../../contracts';
import { appName, toIso, uri } from '../../lib/dto';
import { keyLabel, toCamelot } from '../music/keys';

export interface TrackRow {
  id: string;
  title: string;
  durationMs: number;
  explicit: boolean;
  origin: 'catalog' | 'upload';
  visibility: 'public' | 'private';
  genre: string | null;
  bpm: number | null;
  musicalKey: number | null;
  keyMode: number | null;
  energy: number | null;
  plays: number;
  releaseDate: string | null;
  isPlayable: boolean;
  albumId: string | null;
  albumTitle: string | null;
  coverUrl: string | null;
  artists: ArtistRef[];
  uploaderId: string | null;
  uploaderUsername: string | null;
  uploaderName: string | null;
  uploaderAvatar: string | null;
}

export function toTrack(r: TrackRow): Track {
  const key = r.musicalKey != null && (r.keyMode === 0 || r.keyMode === 1) ? { pitch: r.musicalKey, mode: r.keyMode as 0 | 1 } : null;
  return {
    id: r.id,
    title: r.title,
    durationMs: r.durationMs,
    explicit: r.explicit,
    artists: r.artists,
    album: r.albumId ? { id: r.albumId, title: r.albumTitle ?? '', coverUrl: r.coverUrl } : null,
    origin: r.origin,
    visibility: r.visibility,
    uploader: r.uploaderId
      ? { id: r.uploaderId, username: r.uploaderUsername ?? '', displayName: r.uploaderName ?? '', avatarUrl: r.uploaderAvatar }
      : null,
    genre: r.genre,
    features: {
      bpm: r.bpm != null ? Math.round(r.bpm) : null,
      key: key ? keyLabel(key) : null,
      camelot: key ? toCamelot(key).code : null,
      energy: r.energy,
    },
    playCount: r.plays,
    releaseDate: r.releaseDate,
    isPlayable: r.isPlayable,
  };
}

export const userRef = (id: string | null, username: string | null, displayName: string | null, avatarUrl: string | null): UserRef | null =>
  id ? { id, username: username ?? '', displayName: displayName ?? '', avatarUrl } : null;

function aiInfoOf(generator: unknown): Playlist['ai'] {
  const g = generator as { prompts?: string[]; intent?: AiIntent; usedAi?: boolean } | null;
  return g?.intent ? { prompts: g.prompts ?? [], intent: g.intent, usedAi: Boolean(g.usedAi) } : null;
}

export function mixCoverOf(generator: unknown): MixCover | null {
  const cover = (generator as { cover?: MixCover } | null)?.cover;
  return cover && typeof cover.color === 'string' ? cover : null;
}

export interface PlaylistRow {
  id: string;
  name: string;
  description: string | null;
  coverUrl: string | null;
  dominantColor: string | null;
  kind: Playlist['kind'];
  isPublic: boolean;
  isCollaborative: boolean;
  mixEnabled: boolean;
  followersCount: number;
  generator: unknown;
  updatedAt: Date;
  ownerId: string | null;
  ownerUsername: string | null;
  ownerName: string | null;
  ownerAvatar: string | null;
  totalTracks: number;
  durationMs: number;
  mosaic: string[] | null;
}

export function playlistCard(r: Pick<PlaylistRow, 'id' | 'name' | 'description' | 'coverUrl' | 'generator' | 'ownerName' | 'mosaic' | 'dominantColor'>): Card {
  return {
    type: 'playlist',
    id: r.id,
    name: r.name,
    uri: uri('playlist', r.id),
    imageUrl: r.coverUrl,
    mosaic: r.mosaic ?? [],
    mixCover: mixCoverOf(r.generator),
    description: r.description,
    ownerName: r.ownerName ?? appName(),
    color: r.dominantColor,
  };
}

export interface AlbumCardRow {
  id: string;
  title: string;
  coverUrl: string | null;
  releaseType: Card['releaseType'];
  releaseDate: string | null;
  artists: ArtistRef[];
  dominantColor?: string | null;
}

export const albumCard = (r: AlbumCardRow): Card => ({
  type: 'album',
  id: r.id,
  name: r.title,
  uri: uri('album', r.id),
  imageUrl: r.coverUrl,
  artists: r.artists,
  releaseType: r.releaseType,
  releaseDate: r.releaseDate,
  color: r.dominantColor ?? null,
});

export interface ArtistCardRow {
  id: string;
  name: string;
  avatarUrl: string | null;
  verified: boolean;
}

export const artistCard = (r: ArtistCardRow): Card => ({
  type: 'artist',
  id: r.id,
  name: r.name,
  uri: uri('artist', r.id),
  imageUrl: r.avatarUrl,
  verified: r.verified,
});

export const trackCard = (t: Track): Card => ({
  type: 'track',
  id: t.id,
  name: t.title,
  uri: uri('track', t.id),
  imageUrl: t.album?.coverUrl ?? null,
  artists: t.artists,
  explicit: t.explicit,
  durationMs: t.durationMs,
});

export const userCard = (r: { id: string; displayName: string; avatarUrl: string | null }): Card => ({
  type: 'user',
  id: r.id,
  name: r.displayName,
  uri: uri('user', r.id),
  imageUrl: r.avatarUrl,
});

export function toPlaylist(r: PlaylistRow, viewerId: string | null, extras: { isSaved: boolean; collaborators: UserRef[]; isCollaborator: boolean }): Playlist {
  const isOwner = viewerId != null && r.ownerId === viewerId;
  const canEdit = isOwner || (r.isCollaborative && extras.isCollaborator);
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    coverUrl: r.coverUrl,
    mosaic: r.mosaic ?? [],
    mixCover: mixCoverOf(r.generator),
    kind: r.kind,
    owner: userRef(r.ownerId, r.ownerUsername, r.ownerName, r.ownerAvatar),
    ownerName: r.ownerName ?? appName(),
    dominantColor: r.dominantColor,
    isPublic: r.isPublic,
    isCollaborative: r.isCollaborative,
    mixEnabled: r.mixEnabled,
    followersCount: r.followersCount,
    totalTracks: r.totalTracks,
    durationMs: r.durationMs,
    updatedAt: toIso(r.updatedAt)!,
    collaborators: extras.collaborators,
    isSaved: extras.isSaved,
    permissions: { canEdit, canDelete: isOwner, canInvite: isOwner, canMix: isOwner && (r.kind === 'user' || r.kind === 'ai') },
    ai: r.kind === 'ai' && isOwner ? aiInfoOf(r.generator) : null,
  };
}
