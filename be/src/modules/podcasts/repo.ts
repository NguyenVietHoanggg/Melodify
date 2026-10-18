import type { Card, Episode } from '../../contracts';
import { sql, type Fragment } from '../../db/client';
import { toIso, uri } from '../../lib/dto';

interface EpisodeRow {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  durationMs: number;
  releaseDate: Date | null;
  explicit: boolean;
  showId: string;
  showTitle: string;
  publisher: string | null;
  showImage: string | null;
  positionMs: number | null;
  completed: boolean | null;
  isSaved: boolean;
}

export function toEpisode(r: EpisodeRow): Episode {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    imageUrl: r.imageUrl ?? r.showImage,
    durationMs: r.durationMs,
    releaseDate: toIso(r.releaseDate),
    explicit: r.explicit,
    show: { id: r.showId, title: r.showTitle, publisher: r.publisher, imageUrl: r.showImage },
    progress: r.positionMs != null ? { positionMs: r.positionMs, completed: r.completed ?? false } : null,
    isSaved: r.isSaved,
  };
}

export const EPISODE_COLUMNS = (userId: string | null) => sql`
  e.id, e.title, e.description, e.image_url, e.duration_ms, e.release_date, e.explicit,
  s.id as show_id, s.title as show_title, s.publisher, s.image_url as show_image,
  ep.position_ms, ep.completed, (se.episode_id is not null) as is_saved
  from episodes e
  join shows s on s.id = e.show_id
  left join episode_progress ep on ep.episode_id = e.id and ep.user_id = ${userId}
  left join saved_episodes se on se.episode_id = e.id and se.user_id = ${userId}`;

export async function hydrateEpisodes(ids: readonly string[], userId: string | null): Promise<Map<string, Episode>> {
  if (!ids.length) return new Map();
  const rows = await sql<EpisodeRow[]>`select ${EPISODE_COLUMNS(userId)} where e.id = any(${[...ids]}::uuid[])`;
  return new Map(rows.map((r) => [r.id, toEpisode(r)]));
}

// ── Cards (shelves, search, What's New) ─────────────────────────────────────
export async function showCards(filter: Fragment, order: Fragment, limit: number): Promise<Card[]> {
  const rows = await sql<{ id: string; title: string; publisher: string | null; imageUrl: string | null }[]>`
    select s.id, s.title, s.publisher, s.image_url from shows s where ${filter} order by ${order} limit ${limit}`;
  return rows.map((s) => ({ type: 'show', id: s.id, name: s.title, uri: uri('show', s.id), imageUrl: s.imageUrl, publisher: s.publisher }));
}

export async function episodeCards(filter: Fragment, limit: number): Promise<Card[]> {
  const rows = await sql<{ id: string; title: string; imageUrl: string | null; showImage: string | null; showTitle: string; durationMs: number; releaseDate: Date | null; description: string | null }[]>`
    select e.id, e.title, e.image_url, s.image_url as show_image, s.title as show_title, e.duration_ms, e.release_date,
           left(regexp_replace(coalesce(e.description, ''), '<[^>]+>', '', 'g'), 180) as description
      from episodes e join shows s on s.id = e.show_id
     where ${filter} order by e.release_date desc nulls last limit ${limit}`;
  return rows.map((e) => ({
    type: 'episode', id: e.id, name: e.title, uri: uri('episode', e.id), imageUrl: e.imageUrl ?? e.showImage,
    publisher: e.showTitle, durationMs: e.durationMs, releaseDate: e.releaseDate?.toISOString() ?? null, description: e.description,
  }));
}
