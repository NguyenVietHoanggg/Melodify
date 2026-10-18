/**
 * Artwork for the "Browse all" tiles on the Search page. Each category gets a popular cover from its
 * own songs, and no two tiles share the same image (greedy: categories in display order, each takes
 * its best cover that nobody took yet). Podcasts get the most popular show's artwork.
 */
import { sql } from '../../db/client';

export async function assignCategoryArt(): Promise<number> {
  const categories = await sql<{ id: string; kind: string; query: { genres?: string[]; moods?: string[] } }[]>`
    select id, kind, query from categories order by position`;
  const used = new Set<string>();
  let updated = 0;
  for (const c of categories) {
    const candidates =
      c.kind === 'podcasts'
        ? await sql<{ url: string }[]>`
            select image_url as url from shows where image_url is not null order by followers_count desc, updated_at desc limit 20`
        : await sql<{ url: string }[]>`
            select al.cover_url as url from tracks t join albums al on al.id = t.album_id
             where t.origin = 'catalog' and t.is_playable and al.cover_url is not null
               and (${!c.query.genres?.length} or t.genre = any(${c.query.genres ?? []}::text[]))
               and (${!c.query.moods?.length} or t.moods && ${c.query.moods ?? []}::text[])
             group by al.cover_url order by max(t.popularity) desc limit 40`;
    const pick = candidates.find((x) => !used.has(x.url));
    if (!pick) continue;
    used.add(pick.url);
    await sql`update categories set image_url = ${pick.url} where id = ${c.id}`;
    updated++;
  }
  return updated;
}
