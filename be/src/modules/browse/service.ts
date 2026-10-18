/**
 * Screen-shaped endpoints for Home, Search's "Browse all" and category pages.
 * Every section is DATA (titleKey + items); the UI decides how it looks and translates the titles.
 */
import type { Card, Category, Section } from '../../contracts';
import { sql, type Fragment } from '../../db/client';
import { appName, uri } from '../../lib/dto';
import { playlistCard, trackCard, type PlaylistRow } from '../catalog/dto';
import { PLAYLIST_CARD_COLUMNS, albumCards, artistCards, playlistCards, queryTracks } from '../catalog/repo';
import { episodeCards, showCards } from '../podcasts/repo';
import { ensureMixes } from '../reco/mixes';
import { topArtistIds, tasteTracks } from '../reco/taste';

type Locale = 'vi' | 'en';

const section = (s: Section): Section | null => (s.items.length || s.tracks?.length ? s : null);

// ── Building blocks ──────────────────────────────────────────────────────────
async function trendingTracks(limit: number, filter: Fragment = sql`true`): Promise<Card[]> {
  const tracks = await queryTracks(
    sql`t.origin = 'catalog' and t.is_playable and ${filter}`,
    sql`(t.popularity + greatest(0, 30 - extract(day from now() - coalesce(t.release_date, '2000-01-01'::date)) / 10)) desc`,
    limit * 2,
    null,
  );
  // at most one song per artist so the shelf isn't dominated by one name
  const seen = new Set<string>();
  return tracks.filter((t) => {
    const a = t.artists[0]?.id ?? t.id;
    if (seen.has(a)) return false;
    seen.add(a);
    return true;
  }).slice(0, limit).map(trackCard);
}

const popularArtists = (limit: number) =>
  artistCards(sql`exists (select 1 from track_artists ta join tracks t on t.id = ta.track_id where ta.artist_id = ar.id and t.is_playable)`,
    sql`(ar.monthly_listeners + ar.followers_count) desc`, limit);

const popularAlbums = (limit: number) => albumCards(sql`al.release_date > now() - interval '3 years'`, sql`al.popularity desc, al.release_date desc`, limit);
const newReleases = (limit: number) => albumCards(sql`al.release_date is not null`, sql`al.release_date desc, al.popularity desc`, limit);

const editorial = (limit: number, extra: Fragment = sql`true`) =>
  playlistCards(sql`p.kind = 'editorial' and ${extra}`, sql`p.followers_count desc, p.created_at`, limit);

async function popularRadios(limit: number, artistIds?: string[]): Promise<Card[]> {
  const rows = await sql<PlaylistRow[]>`
    select ${PLAYLIST_CARD_COLUMNS} from playlists p left join profiles o on o.id = p.owner_id
      join artists ar on ar.id::text = p.generator ->> 'seedId'
     where p.kind = 'radio' and p.generator ->> 'seedType' = 'artist'
       ${artistIds ? sql`and ar.id = any(${artistIds}::uuid[])` : sql``}
     order by ar.monthly_listeners desc limit ${limit}`;
  return rows.map(playlistCard);
}

async function communityPicks(limit: number): Promise<Card[]> {
  const tracks = await queryTracks(
    sql`t.origin = 'upload' and t.visibility = 'public' and t.is_playable`,
    sql`(t.play_count * 2 + extract(epoch from t.created_at) / 86400) desc`,
    limit,
    null,
  );
  return tracks.map(trackCard);
}

/** Contexts the user played most recently (playlists, albums, artists, Liked Songs…) as cards. */
async function recentContexts(userId: string, limit: number): Promise<Card[]> {
  // History and library together (one round-trip); the library only fills in when there's little history.
  const [refs, lib] = await Promise.all([
    sql<{ contextType: string; contextId: string }[]>`
      select context_type, context_id from play_events
       where user_id = ${userId} and context_id is not null and context_type in ('playlist', 'album', 'artist', 'collection', 'show')
       group by context_type, context_id order by max(started_at) desc limit ${limit}`,
    sql<{ itemType: string; itemId: string }[]>`
      select item_type, item_id from library_items where user_id = ${userId} and item_type in ('playlist', 'album', 'artist')
       order by added_at desc limit ${limit}`,
  ]);
  if (refs.length < limit) {
    for (const l of lib) {
      if (refs.length >= limit) break;
      if (!refs.some((r) => r.contextType === l.itemType && r.contextId === l.itemId)) refs.push({ contextType: l.itemType, contextId: l.itemId });
    }
  }
  const ids = (t: string) => refs.filter((r) => r.contextType === t).map((r) => r.contextId).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  const [pl, al, ar] = await Promise.all([
    ids('playlist').length ? playlistCards(sql`p.id = any(${ids('playlist')}::uuid[])`, sql`p.id`, 50) : [],
    ids('album').length ? albumCards(sql`al.id = any(${ids('album')}::uuid[])`, sql`al.id`, 50) : [],
    ids('artist').length ? artistCards(sql`ar.id = any(${ids('artist')}::uuid[])`, sql`ar.id`, 50) : [],
  ]);
  const byKey = new Map<string, Card>();
  pl.forEach((c) => byKey.set(`playlist:${c.id}`, c));
  al.forEach((c) => byKey.set(`album:${c.id}`, c));
  ar.forEach((c) => byKey.set(`artist:${c.id}`, c));
  byKey.set('collection:liked', { type: 'collection', id: 'liked', name: '', uri: uri('collection', 'liked'), imageUrl: null });
  return refs.map((r) => byKey.get(`${r.contextType}:${r.contextId}`)).filter((c): c is Card => Boolean(c));
}

async function mixCards(userId: string, sectionName: 'made_for_you' | 'top_mixes', limit: number): Promise<Card[]> {
  return playlistCards(
    sql`p.generated_for = ${userId} and p.kind = 'mix' and p.generator ->> 'section' = ${sectionName}`,
    sql`p.generator ->> 'key'`,
    limit,
  );
}

// ── Home ─────────────────────────────────────────────────────────────────────
export type HomeFilter = 'all' | 'music' | 'podcasts' | 'community';

export async function getHome(userId: string | null, filter: HomeFilter, locale: Locale, displayName?: string): Promise<Section[]> {
  if (filter === 'community') {
    return [
      section({ id: 'community-picks', layout: 'shelf', titleKey: 'home.communityPicks', items: await communityPicks(20), seeAllPath: '/community' }),
    ].filter(Boolean) as Section[];
  }
  if (filter === 'podcasts') {
    const followed = userId ? sql`exists (select 1 from library_items li where li.user_id = ${userId} and li.item_type = 'show' and li.item_id = e.show_id)` : sql`false`;
    const [yours, shows, latest] = await Promise.all([
      userId ? episodeCards(followed, 6) : [],
      showCards(sql`true`, sql`s.followers_count desc, s.updated_at desc`, 20),
      episodeCards(sql`true`, 8),
    ]);
    return [
      userId ? section({ id: 'your-episodes', layout: 'episodes', titleKey: 'home.newEpisodes', items: yours }) : null,
      section({ id: 'popular-shows', layout: 'shelf', titleKey: 'home.popularPodcasts', items: shows }),
      section({ id: 'latest-episodes', layout: 'episodes', titleKey: 'home.episodesForYou', items: latest }),
    ].filter(Boolean) as Section[];
  }

  if (!userId) {
    // What open.spotify.com shows to logged-out visitors.
    const [trending, artists, albums, radios, charts, playlists] = await Promise.all([
      trendingTracks(20), popularArtists(20), popularAlbums(20), popularRadios(20),
      editorial(10, sql`p.generator ->> 'categoryId' = 'charts'`), editorial(20, sql`p.generator ->> 'categoryId' <> 'charts'`),
    ]);
    return [
      section({ id: 'trending', layout: 'shelf', titleKey: 'home.trendingSongs', items: trending, seeAllPath: '/section/trending' }),
      section({ id: 'popular-artists', layout: 'shelf', titleKey: 'home.popularArtists', items: artists, seeAllPath: '/section/popular-artists' }),
      section({ id: 'popular-albums', layout: 'shelf', titleKey: 'home.popularAlbums', items: albums, seeAllPath: '/section/popular-albums' }),
      section({ id: 'popular-radio', layout: 'shelf', titleKey: 'home.popularRadio', items: radios, seeAllPath: '/section/popular-radio' }),
      section({ id: 'charts', layout: 'shelf', titleKey: 'home.featuredCharts', items: charts }),
      section({ id: 'editorial', layout: 'shelf', titleKey: 'home.playlistsFromApp', titleParams: { app: appName() }, items: playlists, seeAllPath: '/section/editorial' }),
    ].filter(Boolean) as Section[];
  }

  // Only the mix shelves wait for the mixes, and only the artist shelves wait for the taste profile:
  // everything else starts right away, so the page costs about three database round-trips.
  const mixesReady = ensureMixes(userId, locale);
  const favorites = tasteTracks(userId, 150).then((taste) => topArtistIds(taste, 12));
  const [recent, madeForYou, topMixes, favArtists, radios, trending, charts, fresh, playlists, community, shows] = await Promise.all([
    recentContexts(userId, 20),
    mixesReady.then(() => mixCards(userId, 'made_for_you', 12)),
    mixesReady.then(() => mixCards(userId, 'top_mixes', 12)),
    favorites.then((ids) => (ids.length ? artistCards(sql`ar.id = any(${ids}::uuid[])`, sql`array_position(${ids}::uuid[], ar.id)`, 12) : [])),
    // Stations of your favourite artists first, topped up with popular ones so the shelf is never nearly empty.
    favorites.then(async (ids) => {
      const [yours, popular] = await Promise.all([ids.length ? popularRadios(12, ids) : [], popularRadios(12)]);
      return [...yours, ...popular.filter((p) => !yours.some((y) => y.id === p.id))].slice(0, 12);
    }),
    trendingTracks(20),
    editorial(10, sql`p.generator ->> 'categoryId' = 'charts'`),
    newReleases(20),
    editorial(20, sql`p.generator ->> 'categoryId' <> 'charts'`),
    filter === 'all' ? communityPicks(12) : Promise.resolve([] as Card[]),
    filter === 'all' ? showCards(sql`exists (select 1 from library_items li where li.user_id = ${userId} and li.item_type = 'show' and li.item_id = s.id)`, sql`s.updated_at desc`, 12) : Promise.resolve([] as Card[]),
  ]);
  return [
    section({ id: 'shortcuts', layout: 'shortcuts', titleKey: '', items: recent.slice(0, 8) }),
    section({ id: 'made-for-you', layout: 'shelf', titleKey: 'home.madeFor', titleParams: { name: displayName ?? '' }, items: madeForYou, seeAllPath: '/section/made-for-you' }),
    section({ id: 'jump-back-in', layout: 'shelf', titleKey: 'home.jumpBackIn', items: recent.slice(8, 20) }),
    section({ id: 'top-mixes', layout: 'shelf', titleKey: 'home.yourTopMixes', items: topMixes, seeAllPath: '/section/top-mixes' }),
    section({ id: 'recently-played', layout: 'shelf', titleKey: 'home.recentlyPlayed', items: recent.slice(0, 12), seeAllPath: '/section/recently-played' }),
    section({ id: 'favorite-artists', layout: 'shelf', titleKey: 'home.yourFavoriteArtists', items: favArtists }),
    section({ id: 'stations', layout: 'shelf', titleKey: 'home.recommendedStations', items: radios, seeAllPath: '/section/popular-radio' }),
    section({ id: 'trending', layout: 'shelf', titleKey: 'home.trendingSongs', items: trending, seeAllPath: '/section/trending' }),
    section({ id: 'charts', layout: 'shelf', titleKey: 'home.charts', items: charts }),
    section({ id: 'new-releases', layout: 'shelf', titleKey: 'home.newReleases', items: fresh, seeAllPath: '/section/new-releases' }),
    section({ id: 'community-picks', layout: 'shelf', titleKey: 'home.communityPicks', items: community, seeAllPath: '/community' }),
    section({ id: 'your-shows', layout: 'shelf', titleKey: 'home.yourShows', items: shows }),
    section({ id: 'editorial', layout: 'shelf', titleKey: 'home.playlistsFromApp', titleParams: { app: appName() }, items: playlists, seeAllPath: '/section/editorial' }),
  ].filter(Boolean) as Section[];
}

/** "Show all" pages for home shelves. */
export async function getSectionPage(id: string, userId: string | null, locale: Locale): Promise<Section | null> {
  const big = 50;
  switch (id) {
    case 'trending': return { id, layout: 'shelf', titleKey: 'home.trendingSongs', items: await trendingTracks(big) };
    case 'popular-artists': return { id, layout: 'shelf', titleKey: 'home.popularArtists', items: await popularArtists(big) };
    case 'popular-albums': return { id, layout: 'shelf', titleKey: 'home.popularAlbums', items: await popularAlbums(big) };
    case 'popular-radio': return { id, layout: 'shelf', titleKey: 'home.popularRadio', items: await popularRadios(big) };
    case 'new-releases': return { id, layout: 'shelf', titleKey: 'home.newReleases', items: await newReleases(big) };
    case 'editorial': return { id, layout: 'shelf', titleKey: 'home.playlistsFromApp', titleParams: { app: appName() }, items: await editorial(big) };
    case 'made-for-you':
      if (!userId) return null;
      await ensureMixes(userId, locale);
      return { id, layout: 'shelf', titleKey: 'home.madeForYou', items: await mixCards(userId, 'made_for_you', big) };
    case 'top-mixes':
      if (!userId) return null;
      return { id, layout: 'shelf', titleKey: 'home.yourTopMixes', items: await mixCards(userId, 'top_mixes', big) };
    case 'recently-played':
      if (!userId) return null;
      return { id, layout: 'shelf', titleKey: 'home.recentlyPlayed', items: await recentContexts(userId, big) };
    default: return null;
  }
}

// ── Browse categories ────────────────────────────────────────────────────────
interface CategoryRow {
  id: string;
  nameVi: string;
  nameEn: string;
  color: string;
  imageUrl: string | null;
  kind: string;
  query: { genres?: string[]; moods?: string[]; minBpm?: number; maxEnergy?: number };
}

const toCategory = (c: CategoryRow, locale: Locale): Category => ({
  id: c.id, name: locale === 'vi' ? c.nameVi : c.nameEn, color: c.color, imageUrl: c.imageUrl, kind: c.kind,
});

export async function getCategories(locale: Locale): Promise<Category[]> {
  const rows = await sql<CategoryRow[]>`select * from categories order by position`;
  return rows.map((c) => toCategory(c, locale));
}

export async function getCategoryPage(id: string, userId: string | null, locale: Locale) {
  const [c] = await sql<CategoryRow[]>`select * from categories where id = ${id}`;
  if (!c) return null;
  const category = toCategory(c, locale);
  const q = c.query ?? {};
  const trackFilter = sql`true
    ${q.genres?.length ? sql`and t.genre = any(${q.genres})` : sql``}
    ${q.moods?.length ? sql`and t.moods && ${q.moods}::text[]` : sql``}
    ${q.minBpm ? sql`and t.bpm >= ${q.minBpm}` : sql``}
    ${q.maxEnergy ? sql`and t.energy <= ${q.maxEnergy}` : sql``}`;
  const inCategory = sql`exists (select 1 from tracks t where t.album_id = al.id and ${trackFilter})`;
  const artistInCategory = sql`exists (select 1 from track_artists ta join tracks t on t.id = ta.track_id where ta.artist_id = ar.id and ${trackFilter})`;

  let sections: (Section | null)[];
  switch (c.kind) {
    case 'charts': {
      const [charts, artists] = await Promise.all([editorial(20, sql`p.generator ->> 'categoryId' = 'charts'`), popularArtists(20)]);
      sections = [
        section({ id: 'charts', layout: 'shelf', titleKey: 'category.charts', items: charts }),
        section({ id: 'top-artists', layout: 'shelf', titleKey: 'home.popularArtists', items: artists }),
      ];
      break;
    }
    case 'new': {
      const [playlists, albums] = await Promise.all([editorial(10, sql`p.generator ->> 'categoryId' = 'new-releases'`), newReleases(30)]);
      sections = [
        section({ id: 'new-playlists', layout: 'shelf', titleKey: 'category.playlists', items: playlists }),
        section({ id: 'new-albums', layout: 'shelf', titleKey: 'home.newReleases', items: albums }),
      ];
      break;
    }
    case 'made_for_you': {
      if (!userId) {
        sections = [];
        break;
      }
      await ensureMixes(userId, locale);
      const [mfy, top] = await Promise.all([mixCards(userId, 'made_for_you', 20), mixCards(userId, 'top_mixes', 20)]);
      sections = [
        section({ id: 'mfy', layout: 'shelf', titleKey: 'home.madeForYou', items: mfy }),
        section({ id: 'top-mixes', layout: 'shelf', titleKey: 'home.yourTopMixes', items: top }),
      ];
      break;
    }
    case 'community':
      sections = [section({ id: 'community', layout: 'shelf', titleKey: 'home.communityPicks', items: await communityPicks(40) })];
      break;
    case 'podcasts':
      sections = [section({ id: 'shows', layout: 'shelf', titleKey: 'home.popularPodcasts', items: await showCards(sql`true`, sql`s.followers_count desc`, 40) })];
      break;
    case 'discover':
      sections = [section({ id: 'discover', layout: 'shelf', titleKey: 'category.playlists', items: await editorial(20, sql`p.generator ->> 'categoryId' = 'discover'`) })];
      break;
    default: {
      const [playlists, top, artists, albums] = await Promise.all([
        editorial(20, sql`p.generator ->> 'categoryId' = ${id}`),
        trendingTracks(10, trackFilter),
        artistCards(artistInCategory, sql`ar.monthly_listeners desc`, 20),
        albumCards(inCategory, sql`al.release_date desc nulls last, al.popularity desc`, 20),
      ]);
      sections = [
        section({ id: 'playlists', layout: 'shelf', titleKey: 'category.playlists', items: playlists }),
        section({ id: 'top-tracks', layout: 'shelf', titleKey: 'category.topTracks', items: top }),
        section({ id: 'artists', layout: 'shelf', titleKey: 'category.artists', items: artists }),
        section({ id: 'albums', layout: 'shelf', titleKey: 'category.newReleases', items: albums }),
      ];
    }
  }
  return { category, sections: sections.filter(Boolean) as Section[] };
}

