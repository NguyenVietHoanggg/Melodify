import { Router } from 'express';
import { z } from 'zod';
import type { Card } from '../../contracts';
import { sql } from '../../db/client';
import { uri } from '../../lib/dto';
import { parse, requireUser } from '../../lib/http';
import { albumCard, artistCard, playlistCard, trackCard, userCard, type AlbumCardRow, type ArtistCardRow, type PlaylistRow } from '../catalog/dto';
import { ALBUM_ARTISTS, PLAYLIST_CARD_COLUMNS, hydrateTracks } from '../catalog/repo';
import { search, type SearchType } from './service';

export const searchRouter = Router();

searchRouter.get('/search', async (req, res) => {
  const q = parse(
    z.object({
      q: z.string().trim().min(1).max(100),
      type: z.enum(['all', 'tracks', 'artists', 'albums', 'playlists', 'profiles', 'podcasts', 'episodes', 'uploads']).default('all'),
      limit: z.coerce.number().int().min(1).max(50).default(20),
      offset: z.coerce.number().int().min(0).max(1000).default(0),
    }),
    req.query,
  );
  res.json(await search(q.q, req.userId, q.type as SearchType, q.limit, q.offset));
});

const recentRef = z.object({ type: z.enum(['track', 'artist', 'album', 'playlist', 'show', 'episode', 'user']), id: z.guid() });

/** "Recent searches" on the Search page: what the user clicked in results. */
searchRouter.get('/me/search/recent', async (req, res) => {
  const userId = requireUser(req);
  const refs = await sql<{ itemType: string; itemId: string }[]>`
    select item_type, item_id from recent_searches where user_id = ${userId} order by searched_at desc limit 20`;
  const ids = (t: string) => refs.filter((r) => r.itemType === t).map((r) => r.itemId);
  const [tracks, artists, albums, playlists, users, shows] = await Promise.all([
    hydrateTracks(ids('track'), userId),
    sql<ArtistCardRow[]>`select id, name, avatar_url, verified from artists where id = any(${ids('artist')}::uuid[])`,
    sql<AlbumCardRow[]>`select al.id, al.title, al.cover_url, al.release_type, al.release_date, ${ALBUM_ARTISTS} from albums al where al.id = any(${ids('album')}::uuid[])`,
    sql<PlaylistRow[]>`select ${PLAYLIST_CARD_COLUMNS} from playlists p left join profiles o on o.id = p.owner_id where p.id = any(${ids('playlist')}::uuid[])`,
    sql<{ id: string; displayName: string; avatarUrl: string | null }[]>`select id, display_name, avatar_url from profiles where id = any(${ids('user')}::uuid[])`,
    sql<{ id: string; title: string; publisher: string | null; imageUrl: string | null }[]>`select id, title, publisher, image_url from shows where id = any(${ids('show')}::uuid[])`,
  ]);
  const byKey = new Map<string, Card>();
  tracks.forEach((t) => byKey.set(`track:${t.id}`, trackCard(t)));
  artists.forEach((a) => byKey.set(`artist:${a.id}`, artistCard(a)));
  albums.forEach((a) => byKey.set(`album:${a.id}`, albumCard(a)));
  playlists.forEach((p) => byKey.set(`playlist:${p.id}`, playlistCard(p)));
  users.forEach((u) => byKey.set(`user:${u.id}`, userCard(u)));
  shows.forEach((s) => byKey.set(`show:${s.id}`, { type: 'show', id: s.id, name: s.title, uri: uri('show', s.id), imageUrl: s.imageUrl, publisher: s.publisher }));
  res.json({ items: refs.map((r) => byKey.get(`${r.itemType}:${r.itemId}`)).filter(Boolean) });
});

searchRouter.post('/me/search/recent', async (req, res) => {
  const userId = requireUser(req);
  const { type, id } = parse(recentRef, req.body);
  await sql`
    insert into recent_searches (user_id, item_type, item_id) values (${userId}, ${type}, ${id})
    on conflict (user_id, item_type, item_id) do update set searched_at = now()`;
  res.status(204).end();
});

searchRouter.delete('/me/search/recent', async (req, res) => {
  const userId = requireUser(req);
  const body = recentRef.partial().parse(req.body ?? {});
  if (body.type && body.id) await sql`delete from recent_searches where user_id = ${userId} and item_type = ${body.type} and item_id = ${body.id}`;
  else await sql`delete from recent_searches where user_id = ${userId}`;
  res.status(204).end();
});
