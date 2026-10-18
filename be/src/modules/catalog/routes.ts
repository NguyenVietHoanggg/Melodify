import { Router } from 'express';
import { z } from 'zod';
import type { PlaylistTrack } from '../../contracts';
import { sql } from '../../db/client';
import { paging } from '../../lib/dto';
import { notFound, pagingSchema, parse } from '../../lib/http';
import { autoTransition, buildRecipe, TRANSITION_PRESETS, type TransitionPreset } from '../music/transitions';
import type { MixFeatures } from '../music/reorder';
import { getLyrics } from '../lyrics/service';
import {
  artistPlaylists, artistReleases, artistTopTracks, getAlbum, getArtist, getPlaylist, getTrack,
  playlistItems, relatedArtists, toPlaylistTrack, type PlaylistItemRow, type ReleaseGroup,
} from './repo';

export const catalogRouter = Router();

/** Accepts any 8-4-4-4-12 id (zod's strict uuid() rejects our fixed built-in ids like 0000…0001). */
export const idParams = z.object({ id: z.guid() });

catalogRouter.get('/tracks/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const track = await getTrack(id, req.userId);
  if (!track) throw notFound();
  res.json(track);
});

catalogRouter.get('/tracks/:id/lyrics', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const lyrics = await getLyrics(id);
  if (!lyrics) throw notFound();
  res.json(lyrics);
});

/** "View credits" dialog. */
catalogRouter.get('/tracks/:id/credits', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const [track, [src]] = await Promise.all([
    getTrack(id, req.userId),
    sql<{ provider: string; providerId: string | null; providerGenre: string | null; moods: string[]; externalUrl: string | null }[]>`
      select t.provider, t.provider_id, t.provider_genre, t.moods, ar.external_url
        from tracks t
        left join track_artists ta on ta.track_id = t.id and ta.position = 0
        left join artists ar on ar.id = ta.artist_id
       where t.id = ${id}`,
  ]);
  if (!track) throw notFound();
  res.json({
    track,
    performedBy: track.artists,
    genre: src?.providerGenre ?? track.genre,
    moods: src?.moods ?? [],
    source: { provider: src?.provider ?? 'upload', url: src?.externalUrl ?? null },
  });
});

catalogRouter.get('/albums/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const album = await getAlbum(id, req.userId);
  if (!album) throw notFound();
  const firstArtist = album.artists[0];
  const moreBy = firstArtist
    ? (await artistReleases(firstArtist.id, 'all', 12)).filter((c) => c.id !== album.id)
    : [];
  res.json({ album, moreBy });
});

/** Everything the artist page needs in ONE response (screen-shaped API = fewer round trips). */
catalogRouter.get('/artists/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const [artist, topTracks, all, related, featuring] = await Promise.all([
    getArtist(id, req.userId),
    artistTopTracks(id, req.userId, 10),
    artistReleases(id, 'all', 50),
    relatedArtists(id, 10),
    artistPlaylists(id, 10),
  ]);
  if (!artist) throw notFound();
  res.json({
    artist,
    topTracks,
    releases: {
      popular: [...all].sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '')).slice(0, 10),
      albums: all.filter((c) => c.releaseType === 'album' || c.releaseType === 'ep'),
      singles: all.filter((c) => c.releaseType === 'single' || c.releaseType === 'ep'),
      compilations: all.filter((c) => c.releaseType === 'compilation'),
    },
    related,
    featuring,
  });
});

catalogRouter.get('/artists/:id/discography', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const { group } = parse(z.object({ group: z.enum(['all', 'album', 'single', 'compilation']).default('all') }), req.query);
  res.json({ items: await artistReleases(id, group as ReleaseGroup, 200) });
});

catalogRouter.get('/artists/:id/related', async (req, res) => {
  const { id } = parse(idParams, req.params);
  res.json({ items: await relatedArtists(id, 30) });
});

catalogRouter.get('/playlists/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const playlist = await getPlaylist(id, req.userId);
  if (!playlist) throw notFound();
  res.json(playlist);
});

const features = (r: PlaylistItemRow): MixFeatures => ({
  id: r.id,
  bpm: r.bpm,
  key: r.musicalKey != null && (r.keyMode === 0 || r.keyMode === 1) ? { pitch: r.musicalKey, mode: r.keyMode as 0 | 1 } : null,
  energy: r.energy,
});

/** Custom transition saved by the owner, valid only while the same track still follows. */
function transitionFor(row: PlaylistItemRow, next: PlaylistItemRow | undefined) {
  if (!next) return null;
  const custom = row.transition as { preset?: string; durationMs?: number; nextTrackId?: string } | null;
  if (custom?.preset && custom.nextTrackId === next.id && TRANSITION_PRESETS.includes(custom.preset as TransitionPreset)) {
    return buildRecipe(custom.preset as TransitionPreset, custom.durationMs ?? 8000, features(row), features(next), false);
  }
  return autoTransition(features(row), features(next));
}

catalogRouter.get('/playlists/:id/tracks', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const { offset, limit } = parse(pagingSchema.extend({ limit: z.coerce.number().int().min(1).max(500).default(100) }), req.query);
  // Fetch one extra row so the last item of the page knows which track follows it (for Mix transitions).
  const [playlist, rows] = await Promise.all([getPlaylist(id, req.userId), playlistItems(id, req.userId, offset, limit + 1)]);
  if (!playlist) throw notFound();
  const page = rows.slice(0, limit);
  const items: PlaylistTrack[] = page.map((r, i) => ({
    ...toPlaylistTrack(r),
    transition: playlist.mixEnabled ? transitionFor(r, rows[i + 1]) : null,
  }));
  res.json(paging(items, playlist.totalTracks, limit, offset));
});

