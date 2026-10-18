import type { Episode, EpisodePage, Paging, Show, ShowPage } from '../../contracts';
import { sql } from '../../db/client';
import { BUILTIN, paging } from '../../lib/dto';
import { notFound } from '../../lib/http';
import { EPISODE_COLUMNS, showCards, toEpisode } from './repo';

interface ShowRow {
  id: string;
  title: string;
  publisher: string | null;
  imageUrl: string | null;
  description: string | null;
  dominantColor: string | null;
  categories: string[];
  explicit: boolean;
  websiteUrl: string | null;
  language: string | null;
  totalEpisodes: number;
  isFollowing: boolean;
}

async function loadShow(id: string, userId: string | null): Promise<ShowRow> {
  const [s] = await sql<ShowRow[]>`
    select s.id, s.title, s.publisher, s.image_url, s.description, s.dominant_color, s.categories, s.explicit, s.website_url, s.language,
           (select count(*)::int from episodes e where e.show_id = s.id) as total_episodes,
           exists (select 1 from library_items li where li.user_id = ${userId} and li.item_type = 'show' and li.item_id = s.id) as is_following
      from shows s where s.id = ${id}`;
  if (!s) throw notFound();
  return s;
}

const toShow = (s: ShowRow): Show => ({
  id: s.id, title: s.title, publisher: s.publisher, imageUrl: s.imageUrl, description: s.description,
  dominantColor: s.dominantColor, categories: s.categories, explicit: s.explicit, totalEpisodes: s.totalEpisodes, isFollowing: s.isFollowing,
});

export async function showEpisodes(showId: string, userId: string | null, opts: { sort: 'newest' | 'oldest'; limit: number; offset: number }): Promise<Paging<Episode>> {
  const order = opts.sort === 'oldest' ? sql`e.release_date asc nulls first` : sql`e.release_date desc nulls last`;
  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    sql<Parameters<typeof toEpisode>[0][]>`select ${EPISODE_COLUMNS(userId)} where e.show_id = ${showId} order by ${order} limit ${opts.limit} offset ${opts.offset}`,
    sql<{ total: number }[]>`select count(*)::int as total from episodes where show_id = ${showId}`,
  ]);
  return paging(rows.map(toEpisode), total, opts.limit, opts.offset);
}

export async function getShowPage(id: string, userId: string | null): Promise<ShowPage> {
  const s = await loadShow(id, userId);
  const [episodes, related] = await Promise.all([
    showEpisodes(id, userId, { sort: 'newest', limit: 20, offset: 0 }),
    // "You might also like": same category first, then same language, then the most followed.
    showCards(
      sql`s.id <> ${id}`,
      sql`(s.categories && ${s.categories}::text[]) desc, (s.language is not distinct from ${s.language}) desc, s.followers_count desc, s.updated_at desc`,
      10,
    ),
  ]);
  return { show: { ...toShow(s), websiteUrl: s.websiteUrl, language: s.language }, episodes, related };
}

export async function getEpisodePage(id: string, userId: string | null): Promise<EpisodePage> {
  const [row] = await sql<Parameters<typeof toEpisode>[0][]>`select ${EPISODE_COLUMNS(userId)} where e.id = ${id}`;
  if (!row) throw notFound();
  const episode = toEpisode(row);
  const [show, more] = await Promise.all([
    loadShow(episode.show.id, userId),
    sql<Parameters<typeof toEpisode>[0][]>`
      select ${EPISODE_COLUMNS(userId)} where e.show_id = ${episode.show.id} and e.id <> ${id}
       order by e.release_date desc nulls last limit 6`,
  ]);
  return { episode, show: toShow(show), more: more.map(toEpisode) };
}

// ── Your Episodes ────────────────────────────────────────────────────────────
export async function savedEpisodes(userId: string, limit: number, offset: number): Promise<Paging<Episode>> {
  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    sql<Parameters<typeof toEpisode>[0][]>`
      select ${EPISODE_COLUMNS(userId)} where se.episode_id is not null order by se.added_at desc limit ${limit} offset ${offset}`,
    sql<{ total: number }[]>`select count(*)::int as total from saved_episodes where user_id = ${userId}`,
  ]);
  return paging(rows.map(toEpisode), total, limit, offset);
}

export async function saveEpisodes(userId: string, ids: string[], save: boolean) {
  if (!save) {
    await sql`delete from saved_episodes where user_id = ${userId} and episode_id = any(${ids}::uuid[])`;
    return;
  }
  await sql`
    insert into saved_episodes (user_id, episode_id)
    select ${userId}, e.id from episodes e where e.id = any(${ids}::uuid[])
    on conflict do nothing`;
  // "Your Episodes" shows up in the library once something is saved.
  await sql`insert into library_items (user_id, item_type, item_id) values (${userId}, 'collection', ${BUILTIN.episodes}) on conflict do nothing`;
}

export async function savedEpisodeIds(userId: string, ids: string[]): Promise<boolean[]> {
  const rows = await sql<{ episodeId: string }[]>`select episode_id from saved_episodes where user_id = ${userId} and episode_id = any(${ids}::uuid[])`;
  const set = new Set(rows.map((r) => r.episodeId));
  return ids.map((id) => set.has(id));
}

/** "Mark as played" / "Mark as unplayed". */
export async function setEpisodeProgress(userId: string, id: string, completed: boolean, positionMs?: number) {
  const [e] = await sql<{ durationMs: number }[]>`select duration_ms from episodes where id = ${id}`;
  if (!e) throw notFound();
  const pos = completed ? e.durationMs : Math.max(0, Math.min(positionMs ?? 0, e.durationMs));
  await sql`
    insert into episode_progress (user_id, episode_id, position_ms, completed) values (${userId}, ${id}, ${pos}, ${completed})
    on conflict (user_id, episode_id) do update set position_ms = excluded.position_ms, completed = excluded.completed, updated_at = now()`;
}
