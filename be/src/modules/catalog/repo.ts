/**
 * Read queries for the catalog. Every list of tracks goes through `hydrateTracks` (one SQL query for N
 * tracks) — never one query per track (the classic "N+1 queries" performance bug).
 */
import type { Album, Artist, Card, Playlist, PlaylistTrack, Track, UserRef } from '../../contracts';
import { sql, type Fragment } from '../../db/client';
import { toIso } from '../../lib/dto';
import {
  albumCard, artistCard, playlistCard, toPlaylist, toTrack, userRef,
  type AlbumCardRow, type ArtistCardRow, type PlaylistRow, type TrackRow,
} from './dto';

// ── Tracks ───────────────────────────────────────────────────────────────────
export const TRACK_COLUMNS = sql`
  t.id, t.title, t.duration_ms, t.explicit, t.origin, t.visibility, t.genre, t.bpm, t.musical_key, t.key_mode,
  t.energy, (t.play_count + t.provider_play_count) as plays, t.release_date, t.is_playable,
  al.id as album_id, al.title as album_title, al.cover_url,
  coalesce((select json_agg(json_build_object('id', ar.id, 'name', ar.name) order by ta.position)
              from track_artists ta join artists ar on ar.id = ta.artist_id
             where ta.track_id = t.id), '[]'::json) as artists,
  up.id as uploader_id, up.username as uploader_username, up.display_name as uploader_name,
  up.avatar_url as uploader_avatar`;

export const TRACK_JOINS = sql`left join albums al on al.id = t.album_id left join profiles up on up.id = t.uploader_id`;

/** Catalog tracks and public uploads are visible to everyone; private uploads only to their uploader. */
export const visibleTo = (viewerId: string | null) => sql`(t.visibility = 'public' or t.uploader_id = ${viewerId})`;

export async function hydrateTracks(ids: readonly string[], viewerId: string | null): Promise<Map<string, Track>> {
  if (!ids.length) return new Map();
  const rows = await sql<TrackRow[]>`
    select ${TRACK_COLUMNS} from tracks t ${TRACK_JOINS}
     where t.id = any(${[...ids]}::uuid[]) and ${visibleTo(viewerId)}`;
  return new Map(rows.map((r) => [r.id, toTrack(r)]));
}

/** Tracks matching `filter`, already hydrated and sorted — one round-trip instead of "ids, then hydrate". */
export async function queryTracks(filter: Fragment, order: Fragment, limit: number, viewerId: string | null): Promise<Track[]> {
  const rows = await sql<TrackRow[]>`
    select ${TRACK_COLUMNS} from tracks t ${TRACK_JOINS}
     where ${filter} and ${visibleTo(viewerId)}
     order by ${order} limit ${limit}`;
  return rows.map(toTrack);
}

/** Hydrate keeping the requested order (and silently dropping ids the viewer may not see). */
export async function tracksInOrder(ids: readonly string[], viewerId: string | null): Promise<Track[]> {
  const map = await hydrateTracks(ids, viewerId);
  return ids.map((id) => map.get(id)).filter((t): t is Track => Boolean(t));
}

export async function getTrack(id: string, viewerId: string | null): Promise<Track | null> {
  return (await hydrateTracks([id], viewerId)).get(id) ?? null;
}

// ── Albums ───────────────────────────────────────────────────────────────────
export const ALBUM_ARTISTS = sql`
  coalesce((select json_agg(json_build_object('id', ar.id, 'name', ar.name) order by aa.position)
              from album_artists aa join artists ar on ar.id = aa.artist_id
             where aa.album_id = al.id), '[]'::json) as artists`;

export async function getAlbum(id: string, viewerId: string | null): Promise<Album | null> {
  // Header, tracks and "saved?" are independent: one round-trip.
  const [[a], rows, [saved]] = await Promise.all([
    sql<(AlbumCardRow & { label: string | null; copyright: string | null })[]>`
      select al.id, al.title, al.cover_url, al.release_type, al.release_date, al.dominant_color, al.label, al.copyright,
             ${ALBUM_ARTISTS}
        from albums al where al.id = ${id}`,
    sql<TrackRow[]>`
      select ${TRACK_COLUMNS} from tracks t ${TRACK_JOINS}
       where t.album_id = ${id} and ${visibleTo(viewerId)}
       order by t.disc_number, t.track_number, t.created_at`,
    viewerId
      ? sql<{ s: boolean }[]>`select exists(select 1 from library_items where user_id = ${viewerId} and item_type = 'album' and item_id = ${id}) as s`
      : [{ s: false }],
  ]);
  if (!a || !rows.length) return null;
  const tracks = rows.map(toTrack);
  return {
    id: a.id,
    title: a.title,
    coverUrl: a.coverUrl,
    releaseType: a.releaseType ?? 'album',
    releaseDate: a.releaseDate,
    artists: a.artists,
    dominantColor: a.dominantColor ?? null,
    label: a.label,
    copyright: a.copyright,
    totalTracks: tracks.length,
    durationMs: tracks.reduce((s, t) => s + t.durationMs, 0),
    tracks,
    isSaved: saved?.s ?? false,
  };
}

export async function albumCards(filter: Fragment, order: Fragment, limit: number): Promise<Card[]> {
  const rows = await sql<AlbumCardRow[]>`
    select al.id, al.title, al.cover_url, al.release_type, al.release_date, al.dominant_color, ${ALBUM_ARTISTS}
      from albums al
     where al.origin = 'catalog' and exists (select 1 from tracks t where t.album_id = al.id and t.is_playable) and ${filter}
     order by ${order}
     limit ${limit}`;
  return rows.map(albumCard);
}

// ── Artists ──────────────────────────────────────────────────────────────────
interface ArtistRow {
  id: string;
  name: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  dominantColor: string | null;
  verified: boolean;
  genres: string[];
  followersCount: number;
  providerFollowers: number;
  monthlyListeners: number;
  bio: string | null;
  externalUrl: string | null;
  ownerId: string | null;
}

export async function getArtist(id: string, viewerId: string | null): Promise<Artist | null> {
  const [a] = await sql<(ArtistRow & { following: boolean })[]>`
    select ar.*, exists(select 1 from library_items li where li.user_id = ${viewerId} and li.item_type = 'artist' and li.item_id = ar.id) as following
      from artists ar where ar.id = ${id}`;
  if (!a) return null;
  return {
    id: a.id,
    name: a.name,
    avatarUrl: a.avatarUrl,
    bannerUrl: a.bannerUrl,
    dominantColor: a.dominantColor,
    verified: a.verified,
    genres: a.genres,
    followersCount: a.followersCount + a.providerFollowers,
    monthlyListeners: a.monthlyListeners,
    bio: a.bio,
    externalUrl: a.externalUrl,
    isCreator: a.ownerId != null,
    isFollowing: a.following,
  };
}

export async function artistTopTracks(artistId: string, viewerId: string | null, limit = 10): Promise<Track[]> {
  const rows = await sql<TrackRow[]>`
    select ${TRACK_COLUMNS} from tracks t
      join track_artists ta2 on ta2.track_id = t.id and ta2.artist_id = ${artistId}
      ${TRACK_JOINS}
     where t.is_playable and ${visibleTo(viewerId)}
     order by (t.play_count + t.provider_play_count) desc, t.popularity desc
     limit ${limit}`;
  return rows.map(toTrack);
}

export type ReleaseGroup = 'all' | 'album' | 'single' | 'compilation';

export async function artistReleases(artistId: string, group: ReleaseGroup, limit = 50): Promise<Card[]> {
  const types = group === 'album' ? ['album', 'ep'] : group === 'single' ? ['single', 'ep'] : group === 'compilation' ? ['compilation'] : ['album', 'single', 'ep', 'compilation'];
  return albumCards(
    sql`al.release_type = any(${types}) and exists (select 1 from album_artists aa where aa.album_id = al.id and aa.artist_id = ${artistId})`,
    sql`al.release_date desc nulls last, al.popularity desc`,
    limit,
  );
}

/** "Fans also like": nearest artists by the average feature vector of their tracks, boosted by co-listening. */
export async function relatedArtists(artistId: string, limit = 10): Promise<Card[]> {
  const rows = await sql<ArtistCardRow[]>`
    with me as (
      select extensions.avg(t.embedding) as v from tracks t join track_artists ta on ta.track_id = t.id
       where ta.artist_id = ${artistId} and t.embedding is not null
    ),
    others as (
      select ta.artist_id, extensions.avg(t.embedding) as v from tracks t join track_artists ta on ta.track_id = t.id
       where ta.artist_id <> ${artistId} and t.embedding is not null and t.origin = 'catalog'
       group by ta.artist_id
    ),
    co as (
      select ta_b.artist_id, sum(c.weight) as w
        from track_artists ta_a
        join track_cooccurrence c on c.track_a = ta_a.track_id
        join track_artists ta_b on ta_b.track_id = c.track_b
       where ta_a.artist_id = ${artistId} and ta_b.artist_id <> ${artistId}
       group by ta_b.artist_id
    )
    select ar.id, ar.name, ar.avatar_url, ar.verified
      from others o
      join artists ar on ar.id = o.artist_id
      left join co on co.artist_id = o.artist_id
     cross join me
     order by (1 - (o.v operator(extensions.<=>) me.v)) + least(coalesce(co.w, 0), 10) / 20.0 desc
     limit ${limit}`;
  return rows.map(artistCard);
}

/** "Featuring <artist>" / "Discovered on": playlists that contain the artist. */
export async function artistPlaylists(artistId: string, limit = 10): Promise<Card[]> {
  const rows = await sql<PlaylistRow[]>`
    select ${PLAYLIST_CARD_COLUMNS}
      from playlists p
      left join profiles o on o.id = p.owner_id
      join lateral (
        select count(*) as n from playlist_tracks pt join track_artists ta on ta.track_id = pt.track_id
         where pt.playlist_id = p.id and ta.artist_id = ${artistId}
      ) hits on hits.n > 0
     where p.is_public and p.kind in ('editorial', 'imported', 'user')
     order by (p.kind = 'editorial') desc, hits.n desc, p.followers_count desc
     limit ${limit}`;
  return rows.map(playlistCard);
}

export async function artistCards(filter: Fragment, order: Fragment, limit: number): Promise<Card[]> {
  const rows = await sql<ArtistCardRow[]>`
    select ar.id, ar.name, ar.avatar_url, ar.verified from artists ar
     where ar.owner_id is null and ${filter} order by ${order} limit ${limit}`;
  return rows.map(artistCard);
}

// ── Playlists ────────────────────────────────────────────────────────────────
export const PLAYLIST_CARD_COLUMNS = sql`
  p.id, p.name, p.description, p.cover_url, p.dominant_color, p.kind, p.generator,
  o.display_name as owner_name,
  array(select c.cover_url from (
          select al.cover_url, min(x.position) as pos
            from playlist_tracks x join tracks t on t.id = x.track_id join albums al on al.id = t.album_id
           where x.playlist_id = p.id and al.cover_url is not null
           group by al.cover_url order by pos limit 4) c) as mosaic`;

const PLAYLIST_COLUMNS = sql`
  p.id, p.name, p.description, p.cover_url, p.dominant_color, p.kind, p.is_public, p.is_collaborative,
  p.mix_enabled, p.followers_count, p.generator, p.updated_at, p.generated_for,
  o.id as owner_id, o.username as owner_username, o.display_name as owner_name, o.avatar_url as owner_avatar,
  (select count(*)::int from playlist_tracks x where x.playlist_id = p.id) as total_tracks,
  (select coalesce(sum(t.duration_ms), 0) from playlist_tracks x join tracks t on t.id = x.track_id where x.playlist_id = p.id) as duration_ms,
  array(select c.cover_url from (
          select al.cover_url, min(x.position) as pos
            from playlist_tracks x join tracks t on t.id = x.track_id join albums al on al.id = t.album_id
           where x.playlist_id = p.id and al.cover_url is not null
           group by al.cover_url order by pos limit 4) c) as mosaic`;

/** Who may see a playlist: public ones, the owner, collaborators, and the user a mix was generated for. */
export const canViewPlaylist = (viewerId: string | null) => sql`(
  p.is_public or p.owner_id = ${viewerId} or p.generated_for = ${viewerId}
  or exists (select 1 from playlist_collaborators pc where pc.playlist_id = p.id and pc.user_id = ${viewerId}))`;

export async function getPlaylist(id: string, viewerId: string | null): Promise<Playlist | null> {
  // Header, collaborators and "saved?" are independent: one round-trip.
  const [[row], collaborators, [flags]] = await Promise.all([
    sql<(PlaylistRow & { generatedFor: string | null })[]>`
      select ${PLAYLIST_COLUMNS} from playlists p left join profiles o on o.id = p.owner_id
       where p.id = ${id} and ${canViewPlaylist(viewerId)}`,
    sql<{ id: string; username: string; displayName: string; avatarUrl: string | null }[]>`
      select pr.id, pr.username, pr.display_name, pr.avatar_url
        from playlist_collaborators pc join profiles pr on pr.id = pc.user_id
       where pc.playlist_id = ${id} order by pc.added_at`,
    viewerId
      ? sql<{ saved: boolean }[]>`
          select exists(select 1 from library_items where user_id = ${viewerId} and item_type = 'playlist' and item_id = ${id}) as saved`
      : [{ saved: false }],
  ]);
  if (!row) return null;
  return toPlaylist(row, viewerId, {
    isSaved: flags?.saved ?? false,
    collaborators: collaborators.map((c) => userRef(c.id, c.username, c.displayName, c.avatarUrl)!) as UserRef[],
    isCollaborator: collaborators.some((c) => c.id === viewerId),
  });
}

export interface PlaylistItemRow extends TrackRow {
  itemId: string;
  position: number;
  addedAt: Date;
  transition: unknown;
  keyMode: number | null;
  addedById: string | null;
  addedByUsername: string | null;
  addedByName: string | null;
  addedByAvatar: string | null;
}

export async function playlistItems(playlistId: string, viewerId: string | null, offset = 0, limit = 1000) {
  const rows = await sql<PlaylistItemRow[]>`
    select pt.id as item_id, pt.position, pt.added_at, pt.transition,
           ab.id as added_by_id, ab.username as added_by_username, ab.display_name as added_by_name, ab.avatar_url as added_by_avatar,
           ${TRACK_COLUMNS}
      from playlist_tracks pt
      join tracks t on t.id = pt.track_id
      left join profiles ab on ab.id = pt.added_by
      ${TRACK_JOINS}
     where pt.playlist_id = ${playlistId} and ${visibleTo(viewerId)}
     order by pt.position
     offset ${offset} limit ${limit}`;
  return rows;
}

export function toPlaylistTrack(r: PlaylistItemRow): Omit<PlaylistTrack, 'transition'> {
  return {
    ...toTrack(r),
    itemId: r.itemId,
    addedAt: toIso(r.addedAt)!,
    addedBy: userRef(r.addedById, r.addedByUsername, r.addedByName, r.addedByAvatar),
  };
}

export async function playlistCards(filter: Fragment, order: Fragment, limit: number, offset = 0): Promise<Card[]> {
  const rows = await sql<PlaylistRow[]>`
    select ${PLAYLIST_CARD_COLUMNS} from playlists p left join profiles o on o.id = p.owner_id
     where ${filter} order by ${order} limit ${limit} offset ${offset}`;
  return rows.map(playlistCard);
}
