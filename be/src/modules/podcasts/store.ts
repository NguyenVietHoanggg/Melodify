/** Writes normalised feeds into the database (import script + periodic refresh). */
import { sql } from '../../db/client';
import { mapPool } from '../../lib/async';
import { headerColorFromUrls } from '../../lib/colors';
import { logger } from '../../lib/logger';
import { fetchFeed, type FeedShow } from './rss';

export async function saveShow(show: FeedShow, opts: { computeColor?: boolean } = {}): Promise<string> {
  const color = opts.computeColor ? await headerColorFromUrls([show.imageUrl], 8000) : null;
  const [row] = await sql<{ id: string }[]>`
    insert into shows (provider, provider_id, title, publisher, description, image_url, dominant_color, language, explicit, categories, website_url, last_fetched_at)
    values ('rss', ${show.feedUrl}, ${show.title}, ${show.publisher}, ${show.description}, ${show.imageUrl}, ${color},
            ${show.language}, ${show.explicit}, ${show.categories}, ${show.websiteUrl}, now())
    on conflict (provider, provider_id) do update set
      title = excluded.title, publisher = excluded.publisher, description = excluded.description,
      image_url = excluded.image_url, dominant_color = coalesce(excluded.dominant_color, shows.dominant_color),
      language = excluded.language, explicit = excluded.explicit, categories = excluded.categories,
      website_url = excluded.website_url, last_fetched_at = now()
    returning id`;
  const showId = row!.id;
  for (const e of show.episodes) {
    await sql`
      insert into episodes (show_id, guid, title, description, audio_url, image_url, duration_ms, release_date, explicit, season_number, episode_number)
      values (${showId}, ${e.guid}, ${e.title}, ${e.description}, ${e.audioUrl}, ${e.imageUrl}, ${e.durationMs},
              ${e.releaseDate}, ${e.explicit}, ${e.season}, ${e.episode})
      on conflict (show_id, guid) do update set
        title = excluded.title, description = excluded.description, audio_url = excluded.audio_url,
        image_url = excluded.image_url, duration_ms = greatest(excluded.duration_ms, episodes.duration_ms),
        release_date = excluded.release_date, explicit = excluded.explicit`;
  }
  return showId;
}

/** New episodes appear in "What's New" — re-read feeds that haven't been checked for `maxAgeHours`. */
export async function refreshShows(maxAgeHours = 6, limit = 30) {
  const due = await sql<{ id: string; providerId: string; dominantColor: string | null }[]>`
    select id, provider_id, dominant_color from shows
     where provider = 'rss' and (last_fetched_at is null or last_fetched_at < now() - make_interval(hours => ${maxAgeHours}))
     order by last_fetched_at nulls first limit ${limit}`;
  let ok = 0;
  await mapPool(due, 4, async (s) => {
    try {
      const feed = await fetchFeed(s.providerId, 50);
      if (feed) {
        // Artwork colour failed last time (host down, slow…)? Try again while we're here.
        await saveShow(feed, { computeColor: !s.dominantColor });
        ok++;
      }
    } catch (err) {
      // Don't retry a broken feed every minute: mark it as checked.
      await sql`update shows set last_fetched_at = now() where id = ${s.id}`;
      logger.debug({ err: String(err), feed: s.providerId }, 'podcast refresh failed');
    }
  });
  if (due.length) logger.info({ checked: due.length, ok }, 'podcast feeds refreshed');
}
