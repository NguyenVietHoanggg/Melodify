/**
 * The social layer:
 *  • public profiles (/user/:id) with Spotify's sections and privacy switches,
 *  • following people,
 *  • "Listening activity" — what the people you follow are playing,
 *  • "What's New" — releases from artists / shows / creators you follow,
 *  • Recents — your own listening history.
 */
import type { Card, FeedItem, FriendActivity, PlayContext, RecentItem, Section, Track, UserProfile, UserSettings } from '../../contracts';
import { sql } from '../../db/client';
import { headerColorFromUrls } from '../../lib/colors';
import { uri } from '../../lib/dto';
import { badRequest, forbidden, notFound } from '../../lib/http';
import { albumCard, playlistCard, trackCard, userCard, type AlbumCardRow, type PlaylistRow } from '../catalog/dto';
import { ALBUM_ARTISTS, PLAYLIST_CARD_COLUMNS, albumCards, artistCards, canViewPlaylist, playlistCards, tracksInOrder } from '../catalog/repo';
import { episodeCards, showCards } from '../podcasts/repo';
import { DEFAULT_SETTINGS } from '../users/service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const byIds = <T extends { id: string }>(ids: string[], items: T[]) => {
  const map = new Map(items.map((x) => [x.id, x]));
  return ids.map((id) => map.get(id)).filter((x): x is T => Boolean(x));
};

// Avatar → header colour is an image download + analysis, so remember it.
const colorCache = new Map<string, string | null>();
async function avatarColor(url: string | null): Promise<string | null> {
  if (!url) return null;
  if (!colorCache.has(url)) {
    if (colorCache.size > 2000) colorCache.clear();
    colorCache.set(url, await headerColorFromUrls([url], 5000));
  }
  return colorCache.get(url) ?? null;
}

// ── Profile building blocks ──────────────────────────────────────────────────
const PUBLIC_PLAYLISTS = (ownerId: string) => sql`p.owner_id = ${ownerId} and p.is_public and p.kind in ('user', 'ai')`;

async function publicPlaylists(ownerId: string, limit: number, offset = 0): Promise<Card[]> {
  const rows = await sql<(PlaylistRow & { followersCount: number })[]>`
    select ${PLAYLIST_CARD_COLUMNS}, p.followers_count from playlists p left join profiles o on o.id = p.owner_id
     where ${PUBLIC_PLAYLISTS(ownerId)} order by p.updated_at desc limit ${limit} offset ${offset}`;
  return rows.map((r) => ({ ...playlistCard(r), followersCount: r.followersCount }));
}

type PersonRow = { id: string; displayName: string; avatarUrl: string | null };

async function followerCards(userId: string, limit: number, offset = 0): Promise<Card[]> {
  const rows = await sql<PersonRow[]>`
    select p.id, p.display_name, p.avatar_url from user_follows f join profiles p on p.id = f.follower_id
     where f.followee_id = ${userId} order by f.created_at desc limit ${limit} offset ${offset}`;
  return rows.map(userCard);
}

/** Spotify's "Following" mixes artists (followed = saved to the library) and people. */
async function followingCards(userId: string, limit: number, offset = 0): Promise<Card[]> {
  const [artists, people] = await Promise.all([
    artistCards(
      sql`ar.id in (select item_id from library_items where user_id = ${userId} and item_type = 'artist')`,
      sql`(select li.added_at from library_items li where li.user_id = ${userId} and li.item_type = 'artist' and li.item_id = ar.id) desc`,
      limit + offset,
    ),
    sql<PersonRow[]>`
      select p.id, p.display_name, p.avatar_url from user_follows f join profiles p on p.id = f.followee_id
       where f.follower_id = ${userId} order by f.created_at desc limit ${limit + offset}`,
  ]);
  return [...artists, ...people.map(userCard)].slice(offset, offset + limit);
}

async function topArtistsThisMonth(userId: string, limit: number): Promise<Card[]> {
  const rows = await sql<{ artistId: string }[]>`
    select ta.artist_id from play_events pe join track_artists ta on ta.track_id = pe.track_id
     where pe.user_id = ${userId} and pe.counted and not pe.is_private and pe.started_at > now() - interval '28 days'
     group by ta.artist_id order by count(*) desc, max(pe.started_at) desc limit ${limit}`;
  const ids = rows.map((r) => r.artistId);
  return ids.length ? byIds(ids, await artistCards(sql`ar.id = any(${ids}::uuid[])`, sql`ar.id`, limit)) : [];
}

async function topTracksThisMonth(userId: string, limit: number): Promise<Track[]> {
  const rows = await sql<{ trackId: string }[]>`
    select pe.track_id from play_events pe
     where pe.user_id = ${userId} and pe.counted and not pe.is_private and pe.track_id is not null
       and pe.started_at > now() - interval '28 days'
     group by pe.track_id order by count(*) desc, max(pe.started_at) desc limit ${limit}`;
  return tracksInOrder(rows.map((r) => r.trackId), userId);
}

async function recentlyPlayedArtists(userId: string, limit: number): Promise<Card[]> {
  const rows = await sql<{ artistId: string }[]>`
    select ta.artist_id from play_events pe join track_artists ta on ta.track_id = pe.track_id
     where pe.user_id = ${userId} and not pe.is_private and pe.started_at > now() - interval '28 days'
     group by ta.artist_id order by max(pe.started_at) desc limit ${limit}`;
  const ids = rows.map((r) => r.artistId);
  return ids.length ? byIds(ids, await artistCards(sql`ar.id = any(${ids}::uuid[])`, sql`ar.id`, limit)) : [];
}

async function publicUploads(userId: string, viewerId: string | null, limit: number, offset = 0): Promise<Track[]> {
  const rows = await sql<{ id: string }[]>`
    select id from tracks where uploader_id = ${userId} and origin = 'upload' and visibility = 'public' and is_playable
     order by created_at desc limit ${limit} offset ${offset}`;
  return tracksInOrder(rows.map((r) => r.id), viewerId);
}

interface ProfileRow extends PersonRow {
  username: string;
  followersCount: number;
  followingCount: number;
  settings: Partial<UserSettings>;
}

async function loadProfile(userId: string) {
  const [p] = await sql<ProfileRow[]>`
    select id, username, display_name, avatar_url, followers_count, following_count, settings from profiles where id = ${userId}`;
  if (!p) throw notFound();
  return { ...p, settings: { ...DEFAULT_SETTINGS, ...p.settings } };
}

export async function getProfile(userId: string, viewerId: string | null): Promise<UserProfile> {
  const p = await loadProfile(userId);
  const isMe = viewerId === userId;
  const showPlaylists = isMe || p.settings.showPlaylistsOnProfile;
  const showFollows = isMe || p.settings.showFollowsOnProfile;
  const none = Promise.resolve([] as never[]);

  const [color, counts, isFollowing, playlists, followers, following, topArtists, topTracks, recent, uploads] = await Promise.all([
    avatarColor(p.avatarUrl),
    sql<{ playlists: number; artists: number }[]>`
      select (select count(*)::int from playlists p where ${PUBLIC_PLAYLISTS(userId)}) as playlists,
             (select count(*)::int from library_items where user_id = ${userId} and item_type = 'artist') as artists`,
    viewerId && !isMe
      ? sql`select 1 from user_follows where follower_id = ${viewerId} and followee_id = ${userId}`.then((r) => r.length > 0)
      : Promise.resolve(false),
    showPlaylists ? publicPlaylists(userId, 10) : none,
    showFollows ? followerCards(userId, 10) : none,
    showFollows ? followingCards(userId, 10) : none,
    isMe ? topArtistsThisMonth(userId, 10) : none,
    isMe ? topTracksThisMonth(userId, 4) : none,
    !isMe && p.settings.showRecentArtistsOnProfile ? recentlyPlayedArtists(userId, 10) : none,
    publicUploads(userId, viewerId, 5),
  ]);

  const base = `/user/${userId}`;
  const sections: Section[] = [
    { id: 'top-artists', layout: 'shelf', titleKey: 'profile.topArtistsThisMonth', subtitleKey: 'profile.onlyVisibleToYou', items: topArtists, seeAllPath: `${base}/top-artists` },
    { id: 'top-tracks', layout: 'tracks', titleKey: 'profile.topTracksThisMonth', subtitleKey: 'profile.onlyVisibleToYou', items: [], tracks: topTracks, seeAllPath: `${base}/top-tracks` },
    { id: 'uploads', layout: 'tracks', titleKey: 'profile.publicUploads', items: [], tracks: uploads, seeAllPath: `${base}/uploads` },
    { id: 'public-playlists', layout: 'shelf', titleKey: 'profile.publicPlaylists', items: playlists, seeAllPath: `${base}/playlists` },
    { id: 'recent-artists', layout: 'shelf', titleKey: 'profile.recentlyPlayedArtists', items: recent },
    { id: 'followers', layout: 'shelf', titleKey: 'profile.followers', items: followers, seeAllPath: `${base}/followers` },
    { id: 'following', layout: 'shelf', titleKey: 'profile.following', items: following, seeAllPath: `${base}/following` },
  ];
  return {
    id: p.id,
    username: p.username,
    displayName: p.displayName,
    avatarUrl: p.avatarUrl,
    color,
    followersCount: p.followersCount,
    followingCount: p.followingCount + (counts[0]?.artists ?? 0),
    publicPlaylistsCount: counts[0]?.playlists ?? 0,
    isFollowing,
    isMe,
    sections: sections.filter((s) => s.items.length || s.tracks?.length),
  };
}

export type ProfileList = 'playlists' | 'followers' | 'following' | 'top-artists' | 'top-tracks' | 'uploads';

/** "Show all" pages of a profile, with the same privacy rules as the profile itself. */
export async function getProfileList(userId: string, viewerId: string | null, list: ProfileList, limit: number, offset: number): Promise<Section> {
  const p = await loadProfile(userId);
  const isMe = viewerId === userId;
  const deny = () => {
    throw forbidden('private_profile_section');
  };
  const titleParams = { name: p.displayName };
  switch (list) {
    case 'playlists':
      if (!isMe && !p.settings.showPlaylistsOnProfile) deny();
      return { id: list, layout: 'shelf', titleKey: 'profile.publicPlaylists', titleParams, items: await publicPlaylists(userId, limit, offset) };
    case 'followers':
      if (!isMe && !p.settings.showFollowsOnProfile) deny();
      return { id: list, layout: 'shelf', titleKey: 'profile.followers', titleParams, items: await followerCards(userId, limit, offset) };
    case 'following':
      if (!isMe && !p.settings.showFollowsOnProfile) deny();
      return { id: list, layout: 'shelf', titleKey: 'profile.following', titleParams, items: await followingCards(userId, limit, offset) };
    case 'top-artists':
      if (!isMe) deny();
      return { id: list, layout: 'shelf', titleKey: 'profile.topArtistsThisMonth', subtitleKey: 'profile.onlyVisibleToYou', items: offset ? [] : await topArtistsThisMonth(userId, 50) };
    case 'top-tracks':
      if (!isMe) deny();
      return { id: list, layout: 'tracks', titleKey: 'profile.topTracksThisMonth', subtitleKey: 'profile.onlyVisibleToYou', items: [], tracks: offset ? [] : await topTracksThisMonth(userId, 50) };
    case 'uploads':
      return { id: list, layout: 'tracks', titleKey: 'profile.publicUploads', titleParams, items: [], tracks: await publicUploads(userId, viewerId, limit, offset) };
  }
}

// ── Following people ─────────────────────────────────────────────────────────
export async function setFollowUser(me: string, target: string, follow: boolean) {
  if (me === target) throw badRequest('cannot_follow_self');
  if (!follow) {
    await sql`delete from user_follows where follower_id = ${me} and followee_id = ${target}`;
    return;
  }
  const [exists] = await sql`select 1 from profiles where id = ${target}`;
  if (!exists) throw notFound();
  const inserted = await sql`insert into user_follows (follower_id, followee_id) values (${me}, ${target}) on conflict do nothing returning 1`;
  if (inserted.length) await sql`insert into notifications (user_id, type, payload) values (${target}, 'follow', ${sql.json({ userId: me })})`;
}

export async function followingUsers(me: string, ids: string[]): Promise<boolean[]> {
  if (!ids.length) return [];
  const rows = await sql<{ followeeId: string }[]>`
    select followee_id from user_follows where follower_id = ${me} and followee_id = any(${ids}::uuid[])`;
  const set = new Set(rows.map((r) => r.followeeId));
  return ids.map((id) => set.has(id));
}

// ── Names for play contexts ("playing from <playlist>") ──────────────────────
async function describeContexts(refs: { type: string | null; id: string | null }[], publicOnly: boolean): Promise<Map<string, PlayContext>> {
  const ids = (t: string) => [...new Set(refs.filter((r) => r.type === t && r.id && UUID.test(r.id)).map((r) => r.id!))];
  const none = Promise.resolve([] as { id: string; name: string }[]);
  const [pl, al, ar, sh] = await Promise.all([
    ids('playlist').length
      ? sql<{ id: string; name: string }[]>`select id, name from playlists where id = any(${ids('playlist')}::uuid[]) ${publicOnly ? sql`and is_public` : sql``}`
      : none,
    ids('album').length ? sql<{ id: string; name: string }[]>`select id, title as name from albums where id = any(${ids('album')}::uuid[])` : none,
    ids('artist').length ? sql<{ id: string; name: string }[]>`select id, name from artists where id = any(${ids('artist')}::uuid[])` : none,
    ids('show').length ? sql<{ id: string; name: string }[]>`select id, title as name from shows where id = any(${ids('show')}::uuid[])` : none,
  ]);
  const out = new Map<string, PlayContext>();
  const put = (type: 'playlist' | 'album' | 'artist' | 'show', rows: { id: string; name: string }[]) =>
    rows.forEach((r) => out.set(`${type}:${r.id}`, { type, id: r.id, uri: uri(type, r.id), name: r.name }));
  put('playlist', pl);
  put('album', al);
  put('artist', ar);
  put('show', sh);
  out.set('collection:liked', { type: 'collection', id: 'liked', uri: uri('collection', 'liked'), name: null });
  return out;
}

// ── Listening activity ───────────────────────────────────────────────────────
export async function friendActivity(me: string): Promise<FriendActivity[]> {
  const rows = await sql<(PersonRow & { username: string; trackId: string; contextType: string | null; contextId: string | null; startedAt: Date; endedReason: string | null })[]>`
    select p.id, p.username, p.display_name, p.avatar_url,
           ev.track_id, ev.context_type, ev.context_id, ev.started_at, ev.ended_reason
      from user_follows f
      join profiles p on p.id = f.followee_id
      join lateral (
        select pe.track_id, pe.context_type, pe.context_id, pe.started_at, pe.ended_reason
          from play_events pe
         where pe.user_id = p.id and pe.track_id is not null and not pe.is_private
           and pe.started_at > now() - interval '30 days'
         order by pe.started_at desc limit 1) ev on true
     where f.follower_id = ${me}
       and coalesce((p.settings ->> 'shareListeningActivity')::boolean, true)
       and not coalesce((p.settings ->> 'privateSession')::boolean, false)
     order by ev.started_at desc limit 50`;
  // tracksInOrder applies MY visibility: a friend's private upload never leaks into my panel.
  const [tracks, contexts] = await Promise.all([
    tracksInOrder([...new Set(rows.map((r) => r.trackId))], me),
    describeContexts(rows.map((r) => ({ type: r.contextType, id: r.contextId })), true),
  ]);
  const trackById = new Map(tracks.map((t) => [t.id, t]));
  const now = Date.now();
  return rows.flatMap((r) => {
    const track = trackById.get(r.trackId);
    if (!track) return [];
    const startedAt = new Date(r.startedAt).getTime();
    return [{
      user: { id: r.id, username: r.username, displayName: r.displayName, avatarUrl: r.avatarUrl },
      track,
      context: contexts.get(`${r.contextType}:${r.contextId}`) ?? null,
      at: new Date(startedAt).toISOString(),
      isNow: !r.endedReason && now - startedAt < track.durationMs + 120_000,
    }];
  });
}

// ── What's New ───────────────────────────────────────────────────────────────
export type FeedFilter = 'music' | 'podcasts' | 'community';

export async function contentFeed(me: string, filter?: FeedFilter): Promise<FeedItem[]> {
  const [seen] = await sql<{ feedSeenAt: Date | null }[]>`select feed_seen_at from profiles where id = ${me}`;
  const seenAt = seen?.feedSeenAt ? new Date(seen.feedSeenAt).getTime() : Date.now() - 14 * 86_400_000;
  const want = (f: FeedFilter) => !filter || filter === f;

  const [releases, episodes, uploads] = await Promise.all([
    want('music')
      ? sql<AlbumCardRow[]>`
          select al.id, al.title, al.cover_url, al.release_type, al.release_date, al.dominant_color, ${ALBUM_ARTISTS}
            from albums al
           where al.origin = 'catalog' and al.release_date between current_date - 180 and current_date
             and exists (select 1 from album_artists aa
                           join library_items li on li.item_id = aa.artist_id and li.item_type = 'artist' and li.user_id = ${me}
                          where aa.album_id = al.id)
             and exists (select 1 from tracks t where t.album_id = al.id and t.is_playable)
           order by al.release_date desc limit 50`.then((rows) => rows.map(albumCard))
      : Promise.resolve([]),
    want('podcasts')
      ? episodeCards(
          sql`e.release_date > now() - interval '60 days'
              and exists (select 1 from library_items li where li.user_id = ${me} and li.item_type = 'show' and li.item_id = s.id)`,
          50,
        )
      : Promise.resolve([]),
    want('community')
      ? sql<{ id: string }[]>`
          select t.id from tracks t
           where t.origin = 'upload' and t.visibility = 'public' and t.is_playable and t.created_at > now() - interval '90 days'
             and t.uploader_id in (select followee_id from user_follows where follower_id = ${me})
           order by t.created_at desc limit 50`.then(async (rows) => (await tracksInOrder(rows.map((r) => r.id), me)).map(trackCard))
      : Promise.resolve([]),
  ]);

  const item = (kind: FeedItem['kind'], card: Card, date: string | null | undefined): FeedItem => {
    const d = date ?? new Date().toISOString();
    return { kind, card, date: d, isNew: new Date(d).getTime() > seenAt };
  };
  // Upload cards don't carry a date; fetch them in one go.
  const uploadDates = uploads.length
    ? new Map(
        (await sql<{ id: string; createdAt: Date }[]>`select id, created_at from tracks where id = any(${uploads.map((c) => c.id)}::uuid[])`).map(
          (r) => [r.id, new Date(r.createdAt).toISOString()],
        ),
      )
    : new Map<string, string>();
  return [
    ...releases.map((c) => item('release', c, c.releaseDate)),
    ...episodes.map((c) => item('episode', c, c.releaseDate)),
    ...uploads.map((c) => item('upload', c, uploadDates.get(c.id))),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 60);
}

export async function unseenFeedCount(me: string): Promise<number> {
  return (await contentFeed(me)).filter((x) => x.isNew).length;
}

export async function markFeedSeen(me: string) {
  await sql`update profiles set feed_seen_at = now() where id = ${me}`;
}

// ── Recents ──────────────────────────────────────────────────────────────────
const CONTEXT_TYPES = ['playlist', 'album', 'artist', 'collection', 'show'];

export async function recents(me: string, limit = 50): Promise<RecentItem[]> {
  const refs = await sql<{ type: string; id: string; playedAt: Date }[]>`
    select case when context_type = any(${CONTEXT_TYPES}) and context_id is not null then context_type
                when episode_id is not null then 'episode' else 'track' end as type,
           case when context_type = any(${CONTEXT_TYPES}) and context_id is not null then context_id
                when episode_id is not null then episode_id::text else track_id::text end as id,
           max(started_at) as played_at
      from play_events
     where user_id = ${me} and not is_private and (track_id is not null or episode_id is not null)
       and started_at > now() - interval '90 days'
     group by 1, 2
     order by played_at desc limit ${limit}`;
  const ids = (t: string) => refs.filter((r) => r.type === t && UUID.test(r.id)).map((r) => r.id);
  const none = Promise.resolve([] as Card[]);
  const [pl, al, ar, sh, tr, ep] = await Promise.all([
    ids('playlist').length ? playlistCards(sql`p.id = any(${ids('playlist')}::uuid[]) and ${canViewPlaylist(me)}`, sql`p.id`, limit) : none,
    ids('album').length ? albumCards(sql`al.id = any(${ids('album')}::uuid[])`, sql`al.id`, limit) : none,
    ids('artist').length ? artistCards(sql`ar.id = any(${ids('artist')}::uuid[])`, sql`ar.id`, limit) : none,
    ids('show').length ? showCards(sql`s.id = any(${ids('show')}::uuid[])`, sql`s.id`, limit) : none,
    ids('track').length ? tracksInOrder(ids('track'), me).then((ts) => ts.map(trackCard)) : none,
    ids('episode').length ? episodeCards(sql`e.id = any(${ids('episode')}::uuid[])`, limit) : none,
  ]);
  const cards = new Map<string, Card>();
  for (const [type, list] of [['playlist', pl], ['album', al], ['artist', ar], ['show', sh], ['track', tr], ['episode', ep]] as const) {
    list.forEach((c) => cards.set(`${type}:${c.id}`, c));
  }
  for (const c of ['liked', 'episodes', 'uploads']) {
    cards.set(`collection:${c}`, { type: 'collection', id: c, name: '', uri: uri('collection', c), imageUrl: null });
  }
  return refs.flatMap((r) => {
    const card = cards.get(`${r.type}:${r.id}`);
    return card ? [{ card, playedAt: new Date(r.playedAt).toISOString() }] : [];
  });
}
