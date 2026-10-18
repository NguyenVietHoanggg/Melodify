/**
 * Radio: an endless-feeling playlist seeded from one song, artist, album or playlist
 * ("Go to song radio", "Go to artist radio", the "Popular radio" shelf).
 * Radios are shared playlists (same for everyone, like Spotify's "<Artist> Radio"), refreshed weekly.
 */
import { sql } from '../../db/client';
import { notFound } from '../../lib/http';
import { recommend, seedsForArtist } from './engine';

export type RadioSeed = 'track' | 'artist' | 'album' | 'playlist';

const RADIO_COLORS = ['#e13300', '#1e3264', '#8d67ab', '#148a08', '#e8115b', '#0d73ec', '#ba5d07', '#27856a', '#477d95', '#af2896'];
const colorFor = (id: string) => RADIO_COLORS[parseInt(id.replace(/-/g, '').slice(0, 6), 16) % RADIO_COLORS.length]!;

async function seedInfo(type: RadioSeed, id: string): Promise<{ name: string; imageUrl: string | null; seeds: string[] }> {
  if (type === 'artist') {
    const [a] = await sql<{ name: string; avatarUrl: string | null }[]>`select name, avatar_url from artists where id = ${id}`;
    if (!a) throw notFound();
    return { name: a.name, imageUrl: a.avatarUrl, seeds: await seedsForArtist(id, 5) };
  }
  if (type === 'track') {
    const [t] = await sql<{ title: string; coverUrl: string | null }[]>`
      select t.title, al.cover_url from tracks t left join albums al on al.id = t.album_id where t.id = ${id}`;
    if (!t) throw notFound();
    const co = await sql<{ trackB: string }[]>`select track_b from track_cooccurrence where track_a = ${id} order by weight desc limit 4`;
    return { name: t.title, imageUrl: t.coverUrl, seeds: [id, ...co.map((c) => c.trackB)] };
  }
  const table = type === 'album' ? sql`albums` : sql`playlists`;
  const nameCol = type === 'album' ? sql`title` : sql`name`;
  const [row] = await sql<{ name: string; imageUrl: string | null }[]>`select ${nameCol} as name, cover_url as image_url from ${table} where id = ${id}`;
  if (!row) throw notFound();
  const seeds =
    type === 'album'
      ? await sql<{ id: string }[]>`select id from tracks where album_id = ${id} order by popularity desc limit 10`
      : await sql<{ id: string }[]>`select track_id as id from playlist_tracks where playlist_id = ${id} order by random() limit 15`;
  return { name: row.name, imageUrl: row.imageUrl, seeds: seeds.map((s) => s.id) };
}

/** Returns the radio playlist id, creating or refreshing it when needed. */
export async function ensureRadio(type: RadioSeed, id: string, force = false): Promise<string> {
  const key = `radio:${type}:${id}`;
  const [existing] = await sql<{ id: string; fresh: boolean }[]>`
    select id, (expires_at > now()) as fresh from playlists where provider = 'melodify' and provider_id = ${key}`;
  if (existing?.fresh && !force) return existing.id;

  const info = await seedInfo(type, id);
  const recs = await recommend({ seedTrackIds: info.seeds, excludeTrackIds: [], limit: 50, maxPerArtist: 3, freshness: false, lambda: 0.7 });
  // Song radio starts with the song itself; artist radio opens with the artist's biggest tracks.
  const trackIds = [...new Set([...(type === 'track' ? [id] : info.seeds.slice(0, type === 'artist' ? 3 : 0)), ...recs])];
  const generator = {
    type: 'radio',
    seedType: type,
    seedId: id,
    cover: { style: 'radio', label: info.name, color: colorFor(id), imageUrl: info.imageUrl },
  };
  return sql.begin(async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      insert into playlists (kind, name, description, dominant_color, is_public, generator, expires_at, provider, provider_id)
      values ('radio', ${`${info.name} Radio`}, null, ${generator.cover.color}, true, ${tx.json(generator)},
              now() + interval '7 days', 'melodify', ${key})
      on conflict (provider, provider_id) do update set
        name = excluded.name, generator = excluded.generator, expires_at = excluded.expires_at, updated_at = now()
      returning id`;
    await tx`delete from playlist_tracks where playlist_id = ${row!.id}`;
    if (trackIds.length) {
      await tx`insert into playlist_tracks ${tx(trackIds.map((trackId, i) => ({ playlistId: row!.id, trackId, position: i + 1 })))}`;
    }
    return row!.id;
  });
}
