/**
 * Writes a provider-agnostic CatalogBundle into Postgres.
 * Idempotent: every insert is an upsert keyed by (provider, provider_id), so re-running an import only
 * updates what changed — it never duplicates rows and never touches Melodify's own counters (play_count…).
 */
import { sql } from '../../db/client';
import { chunk } from '../../lib/async';
import type { CatalogBundle } from '../../providers/types';
import { parseKey } from '../music/keys';
import { estimateFeatures, toMacroGenre } from '../music/taxonomy';
import { featureVector, toPgVector } from '../reco/vector';

type Log = (...args: unknown[]) => void;

/** 0–100 percentile rank — the same scale as Spotify's `popularity`. */
function percentiles(scores: number[]): number[] {
  const sorted = [...scores].sort((a, b) => a - b);
  const n = sorted.length;
  return scores.map((s) => {
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid]! < s) lo = mid + 1;
      else hi = mid;
    }
    return n > 1 ? Math.round((100 * lo) / (n - 1)) : 50;
  });
}

export async function loadBundle(bundle: CatalogBundle, log: Log = console.log) {
  const { provider } = bundle;

  // ── 1. Artists ──────────────────────────────────────────────────────────────
  const artistId = new Map<string, string>();
  for (const batch of chunk(bundle.artists, 500)) {
    const rows = batch.map((a) => ({
      provider,
      providerId: a.providerId,
      name: a.name,
      bio: a.bio,
      avatarUrl: a.avatarUrl,
      bannerUrl: a.bannerUrl,
      dominantColor: a.dominantColor,
      verified: a.verified,
      providerFollowers: a.providerFollowers,
      externalUrl: a.externalUrl,
    }));
    const res = await sql<{ id: string; providerId: string }[]>`
      insert into artists ${sql(rows)}
      on conflict (provider, provider_id) do update set
        name = excluded.name, bio = excluded.bio, avatar_url = excluded.avatar_url, banner_url = excluded.banner_url,
        dominant_color = coalesce(excluded.dominant_color, artists.dominant_color), verified = excluded.verified,
        provider_followers = excluded.provider_followers, external_url = excluded.external_url
      returning id, provider_id`;
    for (const r of res) artistId.set(r.providerId, r.id);
  }
  log(`artists upserted: ${artistId.size}`);

  // ── 2. Albums (releases) ────────────────────────────────────────────────────
  const albumId = new Map<string, string>();
  for (const batch of chunk(bundle.albums, 500)) {
    const rows = batch.map((a) => ({
      provider,
      providerId: a.providerId,
      title: a.title,
      releaseType: a.releaseType,
      releaseDate: a.releaseDate,
      coverUrl: a.coverUrl,
      dominantColor: a.dominantColor,
      label: a.label,
      copyright: a.copyright,
      origin: 'catalog',
    }));
    const res = await sql<{ id: string; providerId: string }[]>`
      insert into albums ${sql(rows)}
      on conflict (provider, provider_id) do update set
        title = excluded.title, release_type = excluded.release_type, release_date = excluded.release_date,
        cover_url = excluded.cover_url, dominant_color = coalesce(excluded.dominant_color, albums.dominant_color),
        copyright = excluded.copyright
      returning id, provider_id`;
    for (const r of res) albumId.set(r.providerId, r.id);
  }
  const albumArtistRows = bundle.albums.flatMap((a) =>
    a.artistProviderIds
      .map((pid, position) => ({ albumId: albumId.get(a.providerId), artistId: artistId.get(pid), position }))
      .filter((r) => r.albumId && r.artistId),
  );
  for (const batch of chunk(albumArtistRows, 1000)) {
    await sql`insert into album_artists ${sql(batch)} on conflict do nothing`;
  }
  log(`releases upserted: ${albumId.size}`);

  // ── 3. Tracks: estimate audio features, compute popularity & the feature vector ──
  const popularity = percentiles(bundle.tracks.map((t) => Math.log1p(t.providerPlayCount) + 2 * Math.log1p(t.favoriteCount)));
  const trackRows = bundle.tracks.map((t, i) => {
    const genre = toMacroGenre(t.providerGenre);
    const key = parseKey(t.musicalKey);
    const est = estimateFeatures({ genre, mood: t.mood, bpm: t.bpm, title: t.title, tags: t.tags });
    const vector = featureVector({
      genre, ...est, bpm: t.bpm, musicalKey: key?.pitch ?? null, keyMode: key?.mode ?? null,
      releaseDate: t.releaseDate, popularity: popularity[i]!,
    });
    return {
      provider,
      providerId: t.providerId,
      origin: 'catalog',
      visibility: 'public',
      albumId: albumId.get(t.albumProviderId) ?? null,
      title: t.title,
      trackNumber: t.trackNumber,
      discNumber: 1,
      durationMs: t.durationMs,
      explicit: t.explicit,
      isrc: t.isrc,
      genre,
      providerGenre: t.providerGenre,
      moods: t.mood ? [t.mood] : [],
      tags: t.tags,
      bpm: t.bpm,
      musicalKey: key?.pitch ?? null,
      keyMode: key?.mode ?? null,
      energy: est.energy,
      valence: est.valence,
      danceability: est.danceability,
      acousticness: est.acousticness,
      instrumentalness: est.instrumentalness,
      releaseDate: t.releaseDate,
      popularity: popularity[i]!,
      providerPlayCount: t.providerPlayCount,
      embedding: toPgVector(vector),
      analysisStatus: 'skipped',
    };
  });
  const trackId = new Map<string, string>();
  for (const batch of chunk(trackRows, 300)) {
    const res = await sql<{ id: string; providerId: string }[]>`
      insert into tracks ${sql(batch)}
      on conflict (provider, provider_id) do update set
        album_id = excluded.album_id, title = excluded.title, track_number = excluded.track_number,
        duration_ms = excluded.duration_ms, explicit = excluded.explicit, genre = excluded.genre,
        provider_genre = excluded.provider_genre, moods = excluded.moods, tags = excluded.tags, bpm = excluded.bpm,
        musical_key = excluded.musical_key, key_mode = excluded.key_mode, energy = excluded.energy,
        valence = excluded.valence, danceability = excluded.danceability, acousticness = excluded.acousticness,
        instrumentalness = excluded.instrumentalness, release_date = excluded.release_date,
        popularity = excluded.popularity, provider_play_count = excluded.provider_play_count,
        embedding = excluded.embedding
      returning id, provider_id`;
    for (const r of res) trackId.set(r.providerId, r.id);
  }
  const trackArtistRows = bundle.tracks.flatMap((t) =>
    t.artistProviderIds
      .map((pid, position) => ({ trackId: trackId.get(t.providerId), artistId: artistId.get(pid), position, role: position === 0 ? 'main' : 'featured' }))
      .filter((r) => r.trackId && r.artistId),
  );
  for (const batch of chunk(trackArtistRows, 1000)) {
    await sql`insert into track_artists ${sql(batch)} on conflict do nothing`;
  }
  log(`tracks upserted: ${trackId.size}`);

  // ── 4. Derived catalog stats ────────────────────────────────────────────────
  await sql`
    update albums a set popularity = s.p
      from (select album_id, max(popularity) as p from tracks where album_id is not null group by album_id) s
     where a.id = s.album_id`;
  await sql`
    update artists ar set
      genres = s.genres,
      -- Starting "monthly listeners" from provider stats; a job adds Melodify's own listeners on top later.
      monthly_listeners = greatest(ar.monthly_listeners, (s.plays / 6 + ar.provider_followers)::int)
      from (
        select ta.artist_id,
               array_remove(array_agg(distinct t.genre), null) as genres,
               sum(t.provider_play_count) as plays
          from track_artists ta join tracks t on t.id = ta.track_id
         group by ta.artist_id
      ) s
     where ar.id = s.artist_id`;

  // ── 5. Imported (human-curated) playlists ───────────────────────────────────
  for (const p of bundle.playlists) {
    const ids = p.trackProviderIds.map((pid) => trackId.get(pid)).filter((x): x is string => Boolean(x));
    if (ids.length < 5) continue;
    await sql.begin(async (tx) => {
      const [row] = await tx<{ id: string }[]>`
        insert into playlists (kind, name, description, cover_url, dominant_color, is_public, provider, provider_id)
        values ('imported', ${p.name}, ${p.description?.slice(0, 300) ?? null}, ${p.coverUrl}, ${p.dominantColor}, true, ${provider}, ${p.providerId})
        on conflict (provider, provider_id) do update set
          name = excluded.name, description = excluded.description, cover_url = excluded.cover_url,
          dominant_color = coalesce(excluded.dominant_color, playlists.dominant_color)
        returning id`;
      await tx`delete from playlist_tracks where playlist_id = ${row!.id}`;
      await tx`insert into playlist_tracks ${tx(ids.map((tid, i) => ({ playlistId: row!.id, trackId: tid, position: i + 1 })))}`;
    });
  }
  log(`playlists upserted: ${bundle.playlists.length}`);
}
