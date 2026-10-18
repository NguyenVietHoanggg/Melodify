/**
 * Lyrics: stored per track (uploaders can provide their own). For catalog tracks we look them up once on
 * LRCLIB (an open lyrics database, https://lrclib.net) and cache the answer — including "not found", so
 * we don't ask again for 30 days.
 *
 * Synced lyrics come as LRC:  "[01:23.45] some line"  → { t: 83450, text: "some line" }
 */
import { sql } from '../../db/client';
import { logger } from '../../lib/logger';
import { parseLrc, type LyricsLine } from './lrc';

export type { LyricsLine };

export interface Lyrics {
  kind: 'synced' | 'plain' | 'none';
  lines: LyricsLine[];
  provider: string | null;
  color: string | null;
}

interface LrclibHit {
  trackName: string;
  artistName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

async function lrclib(title: string, artist: string, durationSec: number): Promise<LrclibHit | null> {
  const headers = { 'user-agent': 'Melodify learning project (https://github.com/)' };
  try {
    const exact = new URL('https://lrclib.net/api/get');
    exact.search = new URLSearchParams({ track_name: title, artist_name: artist, duration: String(Math.round(durationSec)) }).toString();
    const res = await fetch(exact, { headers, signal: AbortSignal.timeout(8000) });
    if (res.ok) return (await res.json()) as LrclibHit;
    // Fall back to a fuzzy search and take the closest duration (±4 s).
    const search = new URL('https://lrclib.net/api/search');
    search.search = new URLSearchParams({ track_name: title, artist_name: artist }).toString();
    const r2 = await fetch(search, { headers, signal: AbortSignal.timeout(8000) });
    if (!r2.ok) return null;
    const hits = (await r2.json()) as LrclibHit[];
    return hits.filter((h) => Math.abs(h.duration - durationSec) <= 4).sort((a, b) => Math.abs(a.duration - durationSec) - Math.abs(b.duration - durationSec))[0] ?? null;
  } catch (err) {
    logger.debug({ err }, 'lrclib lookup failed');
    return null;
  }
}

export async function getLyrics(trackId: string): Promise<Lyrics | null> {
  const [track] = await sql<{ title: string; durationMs: number; origin: string; artist: string | null; color: string | null }[]>`
    select t.title, t.duration_ms, t.origin, ar.name as artist, al.dominant_color as color
      from tracks t
      left join track_artists ta on ta.track_id = t.id and ta.position = 0
      left join artists ar on ar.id = ta.artist_id
      left join albums al on al.id = t.album_id
     where t.id = ${trackId}`;
  if (!track) return null;

  const [cached] = await sql<{ kind: Lyrics['kind']; lines: LyricsLine[]; provider: string; fresh: boolean }[]>`
    select kind, lines, provider, (kind <> 'none' or updated_at > now() - interval '30 days') as fresh
      from lyrics where track_id = ${trackId}`;
  if (cached?.fresh || track.origin === 'upload') {
    return cached ? { kind: cached.kind, lines: cached.lines, provider: cached.provider, color: track.color } : { kind: 'none', lines: [], provider: null, color: track.color };
  }

  const hit = track.artist ? await lrclib(track.title, track.artist, track.durationMs / 1000) : null;
  let kind: Lyrics['kind'] = 'none';
  let lines: LyricsLine[] = [];
  if (hit?.syncedLyrics) {
    kind = 'synced';
    lines = parseLrc(hit.syncedLyrics);
  } else if (hit?.plainLyrics) {
    kind = 'plain';
    lines = hit.plainLyrics.split(/\r?\n/).map((text) => ({ text }));
  }
  await sql`
    insert into lyrics (track_id, kind, lines, provider, updated_at) values (${trackId}, ${kind}, ${sql.json(lines as never)}, 'lrclib', now())
    on conflict (track_id) do update set kind = excluded.kind, lines = excluded.lines, provider = excluded.provider, updated_at = now()`;
  return { kind, lines, provider: kind === 'none' ? null : 'LRCLIB', color: track.color };
}
