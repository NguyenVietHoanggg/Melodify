import type { ArtistRef, LibraryEntry, MixCover } from '../../contracts';
import { sql } from '../../db/client';
import { BUILTIN, appName, toIso, uri } from '../../lib/dto';
import { badRequest } from '../../lib/http';
import { mixCoverOf } from '../catalog/dto';

export type LibraryType = 'playlist' | 'album' | 'artist' | 'show';
export type LibrarySort = 'recents' | 'added' | 'alpha' | 'creator';
export const MAX_PINS = 4;

interface Row {
  type: LibraryEntry['type'];
  id: string;
  name: string;
  imageUrl: string | null;
  generator: unknown;
  ownerName: string | null;
  artists: ArtistRef[] | null;
  releaseType: LibraryEntry['releaseType'] | null;
  publisher: string | null;
  isOwn: boolean;
  itemCount: number | null;
  pinnedAt: Date | null;
  addedAt: Date;
  lastPlayedAt: Date | null;
  folderId: string | null;
  mosaic: string[] | null;
}

const COLLECTIONS: Record<string, { key: 'liked' | 'episodes' | 'uploads' }> = {
  [BUILTIN.liked]: { key: 'liked' },
  [BUILTIN.episodes]: { key: 'episodes' },
  [BUILTIN.uploads]: { key: 'uploads' },
};

export async function getLibrary(userId: string, opts: { filter?: string; sort: LibrarySort; q?: string }): Promise<LibraryEntry[]> {
  const rows = await sql<Row[]>`
    with li as (select * from library_items where user_id = ${userId})
    select 'playlist' as type, p.id, p.name, p.cover_url as image_url, p.generator, o.display_name as owner_name,
           null::json as artists, null as release_type, null as publisher, (p.owner_id = ${userId}) as is_own,
           (select count(*)::int from playlist_tracks x where x.playlist_id = p.id) as item_count,
           li.pinned_at, li.added_at, li.last_played_at, li.folder_id,
           array(select c.cover_url from (
                   select al.cover_url, min(x.position) as pos from playlist_tracks x
                     join tracks t on t.id = x.track_id join albums al on al.id = t.album_id
                    where x.playlist_id = p.id and al.cover_url is not null
                    group by al.cover_url order by pos limit 4) c) as mosaic
      from li join playlists p on li.item_type = 'playlist' and p.id = li.item_id
      left join profiles o on o.id = p.owner_id
    union all
    select 'album', al.id, al.title, al.cover_url, null, null,
           coalesce((select json_agg(json_build_object('id', ar.id, 'name', ar.name) order by aa.position)
                       from album_artists aa join artists ar on ar.id = aa.artist_id where aa.album_id = al.id), '[]'::json),
           al.release_type, null, false, null, li.pinned_at, li.added_at, li.last_played_at, li.folder_id, null
      from li join albums al on li.item_type = 'album' and al.id = li.item_id
    union all
    select 'artist', ar.id, ar.name, ar.avatar_url, null, null, null, null, null, false, null,
           li.pinned_at, li.added_at, li.last_played_at, li.folder_id, null
      from li join artists ar on li.item_type = 'artist' and ar.id = li.item_id
    union all
    select 'show', s.id, s.title, s.image_url, null, null, null, null, s.publisher, false, null,
           li.pinned_at, li.added_at, li.last_played_at, li.folder_id, null
      from li join shows s on li.item_type = 'show' and s.id = li.item_id
    union all
    select 'collection', li.item_id, '', null, null, null, null, null, null, true,
           case li.item_id
             when ${BUILTIN.liked}::uuid then (select count(*)::int from saved_tracks where user_id = ${userId})
             when ${BUILTIN.episodes}::uuid then (select count(*)::int from saved_episodes where user_id = ${userId})
             else (select count(*)::int from tracks where uploader_id = ${userId} and is_playable)
           end,
           li.pinned_at, li.added_at, li.last_played_at, li.folder_id, null
      from li where li.item_type = 'collection'
    union all
    select 'folder', f.id, f.name, null, null, null, null, null, null, true,
           (select count(*)::int from library_items x where x.folder_id = f.id), f.pinned_at, f.created_at, null, null, null
      from library_folders f where f.user_id = ${userId}`;

  let entries: LibraryEntry[] = rows.map((r) => {
    const collection = r.type === 'collection' ? COLLECTIONS[r.id]?.key : undefined;
    const base: LibraryEntry = {
      type: r.type,
      id: r.id,
      name: r.name,
      uri: collection ? uri('collection', collection) : uri(r.type, r.id),
      imageUrl: r.imageUrl,
      pinned: r.pinnedAt != null,
      addedAt: toIso(r.addedAt)!,
      lastPlayedAt: toIso(r.lastPlayedAt),
      folderId: r.folderId,
      isOwn: r.isOwn,
    };
    if (r.mosaic?.length) base.mosaic = r.mosaic;
    const mixCover: MixCover | null = mixCoverOf(r.generator);
    if (mixCover) base.mixCover = mixCover;
    if (r.type === 'playlist') base.ownerName = r.ownerName ?? appName();
    if (r.artists) base.artists = r.artists;
    if (r.releaseType) base.releaseType = r.releaseType;
    if (r.publisher) base.publisher = r.publisher;
    if (r.itemCount != null) base.itemCount = r.itemCount;
    if (collection) base.collection = collection;
    return base;
  });

  // Built-in collections only appear when they have content (or are pinned) — like Spotify's "Your Episodes".
  entries = entries.filter((e) => e.type !== 'collection' || e.collection === 'liked' || (e.itemCount ?? 0) > 0 || e.pinned);
  if (opts.filter) {
    const map: Record<string, LibraryEntry['type'][]> = {
      playlists: ['playlist', 'collection', 'folder'],
      artists: ['artist'],
      albums: ['album'],
      podcasts: ['show'],
    };
    const allowed = map[opts.filter];
    if (allowed) entries = entries.filter((e) => allowed.includes(e.type) && !(e.type === 'collection' && opts.filter !== 'playlists'));
  }
  if (opts.q) {
    const q = opts.q.toLocaleLowerCase('vi');
    entries = entries.filter((e) => `${e.name} ${e.ownerName ?? ''} ${(e.artists ?? []).map((a) => a.name).join(' ')}`.toLocaleLowerCase('vi').includes(q));
  }
  const recency = (e: LibraryEntry) => Math.max(Date.parse(e.addedAt), e.lastPlayedAt ? Date.parse(e.lastPlayedAt) : 0);
  const creator = (e: LibraryEntry) => e.ownerName ?? e.artists?.[0]?.name ?? e.publisher ?? e.name;
  const cmp: Record<LibrarySort, (a: LibraryEntry, b: LibraryEntry) => number> = {
    recents: (a, b) => recency(b) - recency(a),
    added: (a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt),
    alpha: (a, b) => a.name.localeCompare(b.name, 'vi'),
    creator: (a, b) => creator(a).localeCompare(creator(b), 'vi'),
  };
  return entries.sort((a, b) => Number(b.pinned) - Number(a.pinned) || cmp[opts.sort](a, b));
}

export async function saveItem(userId: string, type: LibraryType, id: string) {
  const table = { playlist: sql`playlists`, album: sql`albums`, artist: sql`artists`, show: sql`shows` }[type];
  const [exists] = await sql`select 1 from ${table} where id = ${id}`;
  if (!exists) throw badRequest('item_not_found');
  await Promise.all([
    sql`insert into library_items (user_id, item_type, item_id) values (${userId}, ${type}, ${id}) on conflict do nothing`,
    // Saving an album also likes every song on it. Each song gets a slightly older timestamp than the one
    // before, so Liked Songs (newest first) lists them in the album's own order.
    type === 'album'
      ? sql`
          insert into saved_tracks (user_id, track_id, added_at)
          select ${userId}, t.id,
                 now() - make_interval(secs => (row_number() over (order by t.disc_number, t.track_number, t.created_at)) / 1000.0)
            from tracks t
           where t.album_id = ${id} and t.is_playable and (t.visibility = 'public' or t.uploader_id = ${userId})
          on conflict do nothing`
      : null,
  ]);
}

export async function removeItem(userId: string, type: LibraryType | 'collection', id: string) {
  if (type === 'playlist') {
    // Removing your OWN playlist from the library is a delete on Spotify; the UI asks for confirmation first.
    const [own] = await sql`select 1 from playlists where id = ${id} and owner_id = ${userId}`;
    if (own) throw badRequest('use_delete_for_own_playlist');
  }
  await Promise.all([
    sql`delete from library_items where user_id = ${userId} and item_type = ${type} and item_id = ${id}`,
    // …and removing the album un-likes its songs again (the two always go together).
    type === 'album'
      ? sql`delete from saved_tracks where user_id = ${userId} and track_id in (select id from tracks where album_id = ${id})`
      : null,
  ]);
}

export async function setPinned(userId: string, type: string, id: string, pinned: boolean) {
  if (pinned) {
    const [{ n } = { n: 0 }] = await sql<{ n: number }[]>`
      select (select count(*) from library_items where user_id = ${userId} and pinned_at is not null)
           + (select count(*) from library_folders where user_id = ${userId} and pinned_at is not null) as n`;
    if (n >= MAX_PINS) throw badRequest('pin_limit_reached', undefined, { max: MAX_PINS });
  }
  if (type === 'folder') {
    await sql`update library_folders set pinned_at = ${pinned ? sql`now()` : null} where id = ${id} and user_id = ${userId}`;
  } else {
    await sql`update library_items set pinned_at = ${pinned ? sql`now()` : null} where user_id = ${userId} and item_type = ${type} and item_id = ${id}`;
  }
}

export async function touchPlayed(userId: string, type: string, id: string) {
  await sql`update library_items set last_played_at = now() where user_id = ${userId} and item_type = ${type} and item_id = ${id}`;
}
