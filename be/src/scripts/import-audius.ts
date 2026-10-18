/**
 * Import a starter catalog from Audius.
 *
 *   npm run import:audius                 # fetch + load
 *   npm run import:audius -- --stage=fetch  # only download into be/.cache (no database needed)
 *   npm run import:audius -- --stage=load   # only write the cached bundle into Postgres
 *
 * Two stages so a failed DB load never forces us to re-download everything.
 */
import fs from 'node:fs';
import path from 'node:path';
import { headerColorFromUrls } from '../lib/colors';
import { mapPool } from '../lib/async';
import { EXCLUDED_PROVIDER_GENRES, toMacroGenre } from '../modules/music/taxonomy';
import {
  audiusApi, imageCandidates, isPlayableAudiusTrack, mapArtist, mapTrack,
  type AudiusPlaylist, type AudiusTrack,
} from '../providers/audius';
import type { CatalogAlbum, CatalogBundle, CatalogPlaylist, CatalogTrack } from '../providers/types';

const CACHE_FILE = path.resolve(import.meta.dirname, '../../.cache/audius-catalog.json');
const stage = process.argv.find((a) => a.startsWith('--stage='))?.split('=')[1] ?? 'all';

/** Audius genre names (as their API spells them). */
const GENRES = [
  'Electronic', 'House', 'Tech House', 'Deep House', 'Progressive House', 'Techno', 'Trance', 'Drum & Bass',
  'Dubstep', 'Future Bass', 'Downtempo', 'Disco', 'Hip-Hop/Rap', 'Trap', 'Pop', 'Hyperpop', 'R&B/Soul', 'Funk',
  'Lo-Fi', 'Ambient', 'Alternative', 'Experimental', 'Rock', 'Metal', 'Punk', 'Acoustic', 'Folk', 'Country',
  'Jazz', 'Blues', 'Classical', 'Soundtrack', 'World', 'Latin', 'Reggae', 'Dancehall',
];
const TIMES = ['month', 'year', 'allTime'] as const;
const PER_GENRE = 60;
const MAX_PLAYLISTS = 60;
const MAX_ALBUMS = 150;

const log = (...args: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...args);
const isMusic = (t: AudiusTrack) =>
  isPlayableAudiusTrack(t) && !EXCLUDED_PROVIDER_GENRES.has((t.genre ?? '').toLowerCase()) && toMacroGenre(t.genre) !== null;

async function fetchStage(): Promise<CatalogBundle> {
  const tracks = new Map<string, AudiusTrack>();

  // 1. Trending tracks per genre over several time windows, capped per genre to keep the catalog balanced.
  const perGenre = new Map<string, Map<string, AudiusTrack>>();
  const jobs = GENRES.flatMap((genre) => TIMES.map((time) => ({ genre, time })));
  await mapPool(jobs, 4, async ({ genre, time }, i) => {
    const list = await audiusApi.trendingTracks(genre, time, 50).catch(() => [] as AudiusTrack[]);
    const bucket = perGenre.get(genre) ?? new Map<string, AudiusTrack>();
    for (const t of list) if (isMusic(t)) bucket.set(t.id, t);
    perGenre.set(genre, bucket);
    if (i % 20 === 0) log(`trending ${i + 1}/${jobs.length}`);
  });
  for (const bucket of perGenre.values()) {
    [...bucket.values()].sort((a, b) => b.play_count - a.play_count).slice(0, PER_GENRE).forEach((t) => tracks.set(t.id, t));
  }
  log(`trending tracks kept: ${tracks.size}`);

  // 2. Trending playlists — real human-curated lists, the raw material for "people who like X also like Y".
  const rawPlaylists = new Map<string, AudiusPlaylist>();
  for (const time of ['week', 'month', 'allTime'] as const) {
    const list = await audiusApi.trendingPlaylists(time, 40).catch(() => [] as AudiusPlaylist[]);
    for (const p of list) if (!p.is_album && !p.is_private && !p.is_delete && !p.is_stream_gated) rawPlaylists.set(p.id, p);
  }
  const playlists: CatalogPlaylist[] = [];
  await mapPool([...rawPlaylists.values()].slice(0, MAX_PLAYLISTS), 4, async (p) => {
    const items = (await audiusApi.playlistTracks(p.id).catch(() => [] as AudiusTrack[])).filter(isMusic);
    if (items.length < 5) return;
    items.forEach((t) => tracks.set(t.id, t));
    playlists.push({
      providerId: p.id,
      name: p.playlist_name.trim(),
      description: p.description?.trim() || null,
      coverUrl: p.artwork?.['480x480'] ?? null,
      dominantColor: await headerColorFromUrls(imageCandidates(p.artwork, '150x150')),
      trackProviderIds: items.map((t) => t.id),
    });
  });
  log(`playlists: ${playlists.length}, tracks so far: ${tracks.size}`);

  // 3. Albums: tracks that belong to an Audius album get grouped like a real release (with track numbers).
  const albumIds = [...new Set([...tracks.values()].map((t) => t.album_backlink?.playlist_id).filter(Boolean))] as string[];
  const albums: CatalogAlbum[] = [];
  const albumOfTrack = new Map<string, { albumId: string; n: number }>();
  await mapPool(albumIds.slice(0, MAX_ALBUMS), 4, async (id) => {
    const [meta, items] = await Promise.all([audiusApi.playlist(id).catch(() => null), audiusApi.playlistTracks(id).catch(() => [])]);
    const playable = items.filter(isMusic);
    if (!meta || meta.is_delete || meta.is_private || playable.length === 0) return;
    playable.forEach((t, n) => {
      tracks.set(t.id, t);
      albumOfTrack.set(t.id, { albumId: `album:${id}`, n: n + 1 });
    });
    albums.push({
      providerId: `album:${id}`,
      title: meta.playlist_name.trim(),
      releaseType: playable.length <= 3 ? 'single' : playable.length <= 6 ? 'ep' : 'album',
      releaseDate: (meta.release_date ?? meta.created_at)?.slice(0, 10) ?? null,
      coverUrl: meta.artwork?.['480x480'] ?? null,
      dominantColor: await headerColorFromUrls(imageCandidates(meta.artwork, '150x150')),
      label: null,
      copyright: `© ${(meta.release_date ?? meta.created_at ?? '').slice(0, 4)} ${meta.user.name}`.trim(),
      artistProviderIds: [meta.user.id],
    });
  });
  log(`albums: ${albums.length}, total tracks: ${tracks.size}`);

  // 4. Every other track becomes its own single (on Spotify every track belongs to a release).
  const catalogTracks: CatalogTrack[] = [];
  const singles: AudiusTrack[] = [];
  for (const t of tracks.values()) {
    const a = albumOfTrack.get(t.id);
    if (a) catalogTracks.push(mapTrack(t, a.albumId, a.n));
    else {
      singles.push(t);
      catalogTracks.push(mapTrack(t, `single:${t.id}`, 1));
    }
  }
  await mapPool(singles, 12, async (t, i) => {
    albums.push({
      providerId: `single:${t.id}`,
      title: t.title.trim(),
      releaseType: 'single',
      releaseDate: (t.release_date ?? t.created_at)?.slice(0, 10) ?? null,
      coverUrl: t.artwork?.['480x480'] ?? null,
      dominantColor: await headerColorFromUrls(imageCandidates(t.artwork, '150x150')),
      label: null,
      copyright: `© ${(t.release_date ?? t.created_at ?? '').slice(0, 4)} ${t.user.name}`.trim(),
      artistProviderIds: [t.user.id],
    });
    if (i % 200 === 0) log(`single covers ${i}/${singles.length}`);
  });

  // 5. Artists (with header colors from their profile pictures).
  const users = new Map([...tracks.values()].map((t) => [t.user.id, t.user]));
  const artists = await mapPool([...users.values()], 12, async (u) => ({
    ...mapArtist(u),
    dominantColor: await headerColorFromUrls(imageCandidates(u.cover_photo, '640x').concat(imageCandidates(u.profile_picture, '150x150'))),
  }));
  log(`artists: ${artists.length}`);

  return { provider: 'audius', fetchedAt: new Date().toISOString(), artists, albums, tracks: catalogTracks, playlists };
}

async function main() {
  if (stage === 'fetch' || stage === 'all') {
    const bundle = await fetchStage();
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(bundle));
    const withBpm = bundle.tracks.filter((t) => t.bpm).length;
    log(`✓ cached ${bundle.tracks.length} tracks (${withBpm} with BPM), ${bundle.albums.length} releases, ` +
      `${bundle.artists.length} artists, ${bundle.playlists.length} playlists → ${path.relative(process.cwd(), CACHE_FILE)}`);
  }
  if (stage === 'load' || stage === 'all') {
    const bundle = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) as CatalogBundle;
    const { loadBundle } = await import('../modules/catalog/loader'); // imports the DB (needs be/.env)
    const { sql } = await import('../db/client');
    await loadBundle(bundle, log);
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
