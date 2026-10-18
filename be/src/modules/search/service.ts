/**
 * Search across every entity type with accent-insensitive, typo-tolerant matching.
 *
 * Matching: substring match (fast thanks to the GIN trigram indexes) OR trigram word-similarity
 * (catches typos such as "chil vibs" → "Chill Vibes"). Everything is compared after public.normalize_text()
 * (lower-case + accents removed), so "lac troi" finds "Lạc Trôi".
 * Ranking: textual similarity + exact/prefix bonus + a little popularity.
 */
import type { Card, SearchResults, Track } from '../../contracts';
import { sql, type Fragment } from '../../db/client';
import { withSettings } from '../../db/settings';
import { paging, uri } from '../../lib/dto';
import { albumCard, artistCard, playlistCard, toTrack, userCard, type AlbumCardRow, type ArtistCardRow, type PlaylistRow, type TrackRow } from '../catalog/dto';
import { ALBUM_ARTISTS, PLAYLIST_CARD_COLUMNS, TRACK_COLUMNS, TRACK_JOINS, visibleTo } from '../catalog/repo';

export type SearchType = 'all' | 'tracks' | 'artists' | 'albums' | 'playlists' | 'profiles' | 'podcasts' | 'episodes' | 'uploads';
type Db = typeof sql;

/** pg_trgm's default word-similarity threshold (0.6) misses common typos; 0.4 still keeps noise out. */
const TYPO_THRESHOLD = 0.4;

const match = (column: Fragment, q: string) =>
  sql`(${column} like '%' || public.normalize_text(${q}) || '%' or public.normalize_text(${q}) operator(extensions.<%) ${column})`;

const rank = (column: Fragment, q: string) => sql`(
  extensions.word_similarity(public.normalize_text(${q}), ${column})
  + case when ${column} = public.normalize_text(${q}) then 1
         when ${column} like public.normalize_text(${q}) || '%' then 0.4
         else 0 end)`;

/**
 * Each search is ONE query: the page of results plus the total number of matches (`count(*) over ()` counts
 * every matching row before LIMIT applies). When the page is past the end there are no rows to carry the
 * total, so it reads as 0 — fine for "load more" paging.
 */
const totalOf = (rows: readonly { total: number }[]) => rows[0]?.total ?? 0;

async function searchTracks(db: Db, q: string, viewerId: string | null, origin: 'catalog' | 'upload', limit: number, offset: number) {
  const artistHit = sql`exists (select 1 from track_artists ta3 join artists ar3 on ar3.id = ta3.artist_id
                                where ta3.track_id = t.id and ${match(sql`ar3.search_name`, q)})`;
  const where = sql`t.origin = ${origin} and t.is_playable and ${visibleTo(viewerId)} and (${match(sql`t.search_title`, q)} or ${artistHit})`;
  const rows = await db<(TrackRow & { score: number; total: number })[]>`
    select ${TRACK_COLUMNS},
           greatest(${rank(sql`t.search_title`, q)},
                    coalesce((select max(${rank(sql`ar4.search_name`, q)}) * 0.9 from track_artists ta4
                                join artists ar4 on ar4.id = ta4.artist_id where ta4.track_id = t.id), 0))
             + t.popularity / 400.0 as score,
           count(*) over ()::int as total
      from tracks t ${TRACK_JOINS}
     where ${where}
     order by score desc, t.popularity desc
     limit ${limit} offset ${offset}`;
  return { items: rows.map(toTrack), total: totalOf(rows), best: rows[0]?.score ?? 0 };
}

async function searchArtists(db: Db, q: string, limit: number, offset: number) {
  const rows = await db<(ArtistCardRow & { score: number; total: number })[]>`
    select ar.id, ar.name, ar.avatar_url, ar.verified,
           ${rank(sql`ar.search_name`, q)} + least(ar.provider_followers + ar.followers_count, 100000) / 400000.0 as score,
           count(*) over ()::int as total
      from artists ar where ar.owner_id is null and ${match(sql`ar.search_name`, q)}
     order by score desc limit ${limit} offset ${offset}`;
  return { items: rows.map(artistCard), total: totalOf(rows), best: rows[0]?.score ?? 0 };
}

async function searchAlbums(db: Db, q: string, limit: number, offset: number) {
  const rows = await db<(AlbumCardRow & { score: number; total: number })[]>`
    select al.id, al.title, al.cover_url, al.release_type, al.release_date, ${ALBUM_ARTISTS},
           ${rank(sql`al.search_title`, q)} + al.popularity / 400.0 as score,
           count(*) over ()::int as total
      from albums al where al.origin = 'catalog' and al.release_type <> 'single' and ${match(sql`al.search_title`, q)}
     order by score desc limit ${limit} offset ${offset}`;
  return { items: rows.map(albumCard), total: totalOf(rows), best: rows[0]?.score ?? 0 };
}

async function searchPlaylists(db: Db, q: string, viewerId: string | null, limit: number, offset: number) {
  const rows = await db<(PlaylistRow & { score: number; total: number })[]>`
    select ${PLAYLIST_CARD_COLUMNS}, ${rank(sql`p.search_name`, q)} + (p.kind = 'editorial')::int * 0.2 as score,
           count(*) over ()::int as total
      from playlists p left join profiles o on o.id = p.owner_id
     where (p.is_public or p.owner_id = ${viewerId}) and p.kind in ('user', 'ai', 'editorial', 'imported', 'radio')
       and ${match(sql`p.search_name`, q)}
     order by score desc, p.followers_count desc limit ${limit} offset ${offset}`;
  return { items: rows.map(playlistCard), total: totalOf(rows), best: rows[0]?.score ?? 0 };
}

async function searchProfiles(db: Db, q: string, limit: number, offset: number) {
  const name = sql`public.normalize_text(pr.display_name)`;
  const rows = await db<{ id: string; displayName: string; avatarUrl: string | null; total: number }[]>`
    select pr.id, pr.display_name, pr.avatar_url, count(*) over ()::int as total
      from profiles pr where ${match(name, q)}
     order by ${rank(name, q)} desc, pr.followers_count desc limit ${limit} offset ${offset}`;
  return { items: rows.map(userCard), total: totalOf(rows) };
}

async function searchShows(db: Db, q: string, limit: number, offset: number) {
  const rows = await db<{ id: string; title: string; publisher: string | null; imageUrl: string | null; total: number }[]>`
    select s.id, s.title, s.publisher, s.image_url, count(*) over ()::int as total
      from shows s where ${match(sql`s.search_title`, q)}
     order by ${rank(sql`s.search_title`, q)} desc limit ${limit} offset ${offset}`;
  const items: Card[] = rows.map((s) => ({ type: 'show', id: s.id, name: s.title, uri: uri('show', s.id), imageUrl: s.imageUrl, publisher: s.publisher }));
  return { items, total: totalOf(rows) };
}

async function searchEpisodes(db: Db, q: string, limit: number, offset: number) {
  const rows = await db<{ id: string; title: string; imageUrl: string | null; showImage: string | null; publisher: string | null; durationMs: number; releaseDate: Date | null; description: string | null; total: number }[]>`
    select e.id, e.title, e.image_url, s.image_url as show_image, s.title as publisher, e.duration_ms, e.release_date,
           left(regexp_replace(coalesce(e.description, ''), '<[^>]+>', '', 'g'), 200) as description,
           count(*) over ()::int as total
      from episodes e join shows s on s.id = e.show_id
     where ${match(sql`e.search_title`, q)}
     order by ${rank(sql`e.search_title`, q)} desc, e.release_date desc limit ${limit} offset ${offset}`;
  const items: Card[] = rows.map((e) => ({
    type: 'episode', id: e.id, name: e.title, uri: uri('episode', e.id), imageUrl: e.imageUrl ?? e.showImage,
    publisher: e.publisher, durationMs: e.durationMs, releaseDate: e.releaseDate?.toISOString() ?? null, description: e.description,
  }));
  return { items, total: totalOf(rows) };
}

const empty = <T>(limit: number) => paging<T>([], 0, limit, 0);

export async function search(q: string, viewerId: string | null, type: SearchType, limit: number, offset: number): Promise<SearchResults> {
  const all = type === 'all';
  const n = all ? 10 : limit;
  const o = all ? 0 : offset;
  const want = (t: SearchType) => all || type === t;

  // The relaxed typo threshold is set on the connection first, and the ~8 searches travel right behind it
  // in the same batch: one network round-trip for the whole search page.
  const r = await withSettings({ 'pg_trgm.word_similarity_threshold': String(TYPO_THRESHOLD) }, async (db) => {
    const [tracks, artists, albums, playlists, profiles, shows, episodes, uploads] = await Promise.all([
      want('tracks') ? searchTracks(db, q, viewerId, 'catalog', all ? 4 : n, o) : null,
      want('artists') ? searchArtists(db, q, n, o) : null,
      want('albums') ? searchAlbums(db, q, n, o) : null,
      want('playlists') ? searchPlaylists(db, q, viewerId, n, o) : null,
      want('profiles') ? searchProfiles(db, q, n, o) : null,
      want('podcasts') ? searchShows(db, q, n, o) : null,
      want('episodes') ? searchEpisodes(db, q, n, o) : null,
      want('uploads') ? searchTracks(db, q, viewerId, 'upload', all ? 4 : n, o) : null,
    ]);
    return { tracks, artists, albums, playlists, profiles, shows, episodes, uploads };
  });

  // "Top result": the single best match across types, with a nudge for artists (that's usually the intent).
  let topResult: Card | null = null;
  if (all) {
    const contenders: { card: Card; score: number }[] = [];
    if (r.artists?.items[0]) contenders.push({ card: r.artists.items[0], score: r.artists.best + 0.15 });
    if (r.tracks?.items[0]) {
      const t = r.tracks.items[0] as Track;
      contenders.push({ card: { type: 'track', id: t.id, name: t.title, uri: uri('track', t.id), imageUrl: t.album?.coverUrl ?? null, artists: t.artists, explicit: t.explicit }, score: r.tracks.best });
    }
    if (r.albums?.items[0]) contenders.push({ card: r.albums.items[0], score: r.albums.best });
    if (r.playlists?.items[0]) contenders.push({ card: r.playlists.items[0], score: r.playlists.best - 0.1 });
    topResult = contenders.sort((a, b) => b.score - a.score)[0]?.card ?? null;
  }

  const page = <T>(x: { items: T[]; total: number } | null, lim: number) => (x ? paging(x.items, x.total, lim, o) : empty<T>(lim));
  return {
    query: q,
    topResult,
    tracks: page(r.tracks, all ? 4 : n),
    artists: page(r.artists, n),
    albums: page(r.albums, n),
    playlists: page(r.playlists, n),
    profiles: page(r.profiles, n),
    shows: page(r.shows, n),
    episodes: page(r.episodes, n),
    uploads: page(r.uploads, all ? 4 : n),
  };
}
