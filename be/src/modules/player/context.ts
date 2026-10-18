/** What "play this context" means for each kind of thing you can press play on. */
import type { ContextType, PlayContext } from '../../contracts';
import { sql } from '../../db/client';
import { BUILTIN, uri } from '../../lib/dto';
import { notFound } from '../../lib/http';
import { canViewPlaylist } from '../catalog/repo';

export interface LoadedContext {
  context: PlayContext;
  /** Ordered ids; for show contexts these are episode ids. */
  ids: string[];
  kind: 'track' | 'episode';
}

const visible = (userId: string | null) => sql`(t.visibility = 'public' or t.uploader_id = ${userId})`;

export async function loadContext(type: ContextType, id: string | null, userId: string): Promise<LoadedContext> {
  switch (type) {
    case 'playlist': {
      const [[p], rows] = await Promise.all([
        sql<{ name: string }[]>`select p.name from playlists p where p.id = ${id} and ${canViewPlaylist(userId)}`,
        sql<{ id: string }[]>`
          select t.id from playlist_tracks pt join tracks t on t.id = pt.track_id
           where pt.playlist_id = ${id} and t.is_playable and ${visible(userId)} order by pt.position`,
      ]);
      if (!p) throw notFound('context_not_found');
      return { context: { type, id, uri: uri('playlist', id), name: p.name }, ids: rows.map((r) => r.id), kind: 'track' };
    }
    case 'album': {
      const [[a], rows] = await Promise.all([
        sql<{ title: string }[]>`select title from albums where id = ${id}`,
        sql<{ id: string }[]>`
          select t.id from tracks t where t.album_id = ${id} and t.is_playable and ${visible(userId)}
           order by t.disc_number, t.track_number, t.created_at`,
      ]);
      if (!a) throw notFound('context_not_found');
      return { context: { type, id, uri: uri('album', id), name: a.title }, ids: rows.map((r) => r.id), kind: 'track' };
    }
    case 'artist': {
      // Artist context = popular tracks first, then the rest of the catalogue.
      const [[a], rows] = await Promise.all([
        sql<{ name: string }[]>`select name from artists where id = ${id}`,
        sql<{ id: string }[]>`
          select t.id from tracks t join track_artists ta on ta.track_id = t.id and ta.artist_id = ${id}
           where t.is_playable and ${visible(userId)}
           order by (t.play_count + t.provider_play_count) desc limit 200`,
      ]);
      if (!a) throw notFound('context_not_found');
      return { context: { type, id, uri: uri('artist', id), name: a.name }, ids: rows.map((r) => r.id), kind: 'track' };
    }
    case 'collection': {
      if (id === 'uploads' || id === BUILTIN.uploads) {
        const rows = await sql<{ id: string }[]>`select id from tracks where uploader_id = ${userId} and is_playable order by created_at desc`;
        return { context: { type, id: 'uploads', uri: uri('collection', 'uploads'), name: null }, ids: rows.map((r) => r.id), kind: 'track' };
      }
      if (id === 'episodes' || id === BUILTIN.episodes) {
        const rows = await sql<{ id: string }[]>`select episode_id as id from saved_episodes where user_id = ${userId} order by added_at desc`;
        return { context: { type, id: 'episodes', uri: uri('collection', 'episodes'), name: null }, ids: rows.map((r) => r.id), kind: 'episode' };
      }
      const rows = await sql<{ id: string }[]>`
        select t.id from saved_tracks s join tracks t on t.id = s.track_id
         where s.user_id = ${userId} and t.is_playable and ${visible(userId)} order by s.added_at desc`;
      return { context: { type, id: 'liked', uri: uri('collection', 'liked'), name: null }, ids: rows.map((r) => r.id), kind: 'track' };
    }
    case 'show': {
      const [[s], rows] = await Promise.all([
        sql<{ title: string }[]>`select title from shows where id = ${id}`,
        sql<{ id: string }[]>`select id from episodes where show_id = ${id} order by release_date desc nulls last`,
      ]);
      if (!s) throw notFound('context_not_found');
      return { context: { type, id, uri: uri('show', id), name: s.title }, ids: rows.map((r) => r.id), kind: 'episode' };
    }
    case 'episode': {
      const [e] = await sql<{ id: string; title: string }[]>`select id, title from episodes where id = ${id}`;
      if (!e) throw notFound('context_not_found');
      return { context: { type, id, uri: uri('episode', id), name: e.title }, ids: [e.id], kind: 'episode' };
    }
    case 'uploads': {
      const rows = await sql<{ id: string }[]>`
        select id from tracks where origin = 'upload' and visibility = 'public' and is_playable order by created_at desc limit 200`;
      return { context: { type, id: null, uri: uri('uploads', null), name: null }, ids: rows.map((r) => r.id), kind: 'track' };
    }
    default: {
      // 'track' (and search results): a single song; Autoplay keeps the music going afterwards.
      const [t] = await sql<{ id: string; title: string }[]>`select t.id, t.title from tracks t where t.id = ${id} and t.is_playable and ${visible(userId)}`;
      if (!t) throw notFound('context_not_found');
      return { context: { type: 'track', id: t.id, uri: uri('track', t.id), name: t.title }, ids: [t.id], kind: 'track' };
    }
  }
}
