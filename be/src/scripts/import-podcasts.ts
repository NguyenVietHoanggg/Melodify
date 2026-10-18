/**
 * Imports real podcasts: find shows with the free iTunes Search API, then read each show's RSS feed.
 *
 *   npm run import:podcasts                 fetch + load
 *   npm run import:podcasts -- --stage=fetch   only download into be/.cache/podcasts.json
 *   npm run import:podcasts -- --stage=load    only load the cached file into the database
 *
 * Audio files stay on the podcasters' own servers (that's how podcast apps work); we store metadata only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { mapPool } from '../lib/async';
import { fetchFeed, type FeedShow } from '../modules/podcasts/rss';

const CACHE = path.resolve(import.meta.dirname, '../../.cache/podcasts.json');
const stage = process.argv.find((a) => a.startsWith('--stage='))?.split('=')[1] ?? 'all';
const MAX_SHOWS = 48;
const EPISODES_PER_SHOW = 30;

// A mix of Vietnamese and international shows across Spotify's main podcast categories.
const SEARCHES: { term: string; country: string; take: number }[] = [
  { term: 'Vietcetera', country: 'VN', take: 3 },
  { term: 'Spiderum', country: 'VN', take: 2 },
  { term: 'podcast tiếng việt', country: 'VN', take: 4 },
  { term: 'tâm lý học', country: 'VN', take: 3 },
  { term: 'kinh doanh khởi nghiệp', country: 'VN', take: 3 },
  { term: 'sách nói', country: 'VN', take: 2 },
  { term: 'chữa lành', country: 'VN', take: 2 },
  { term: 'lịch sử việt nam', country: 'VN', take: 2 },
  { term: 'đầu tư tài chính', country: 'VN', take: 2 },
  { term: 'học tiếng anh', country: 'VN', take: 2 },
  { term: 'kể chuyện đêm khuya', country: 'VN', take: 2 },
  { term: 'TED Talks Daily', country: 'US', take: 1 },
  { term: '6 Minute English', country: 'GB', take: 1 },
  { term: 'Huberman Lab', country: 'US', take: 1 },
  { term: 'Stuff You Should Know', country: 'US', take: 1 },
  { term: 'Radiolab', country: 'US', take: 1 },
  { term: 'Freakonomics Radio', country: 'US', take: 1 },
  { term: 'Planet Money', country: 'US', take: 1 },
  { term: 'Hidden Brain', country: 'US', take: 1 },
  { term: 'The Daily', country: 'US', take: 1 },
  { term: 'Lex Fridman Podcast', country: 'US', take: 1 },
  { term: 'Science Vs', country: 'US', take: 1 },
  { term: 'Darknet Diaries', country: 'US', take: 1 },
  { term: 'Song Exploder', country: 'US', take: 1 },
  { term: 'The Moth', country: 'US', take: 1 },
  { term: 'Philosophize This', country: 'US', take: 1 },
  { term: 'Lo-fi study music podcast', country: 'US', take: 1 },
];

interface ItunesResult { collectionId: number; collectionName: string; feedUrl?: string; trackCount?: number }

async function itunesSearch(term: string, country: string): Promise<ItunesResult[]> {
  const url = `https://itunes.apple.com/search?media=podcast&entity=podcast&limit=10&country=${country}&term=${encodeURIComponent(term)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (res.ok) return ((await res.json()) as { results: ItunesResult[] }).results;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  return [];
}

async function fetchStage(): Promise<FeedShow[]> {
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const s of SEARCHES) {
    const results = (await itunesSearch(s.term, s.country)).filter((r) => r.feedUrl && (r.trackCount ?? 1) > 0);
    let taken = 0;
    for (const r of results) {
      if (taken >= s.take || seen.has(r.feedUrl!)) continue;
      seen.add(r.feedUrl!);
      candidates.push(r.feedUrl!);
      taken++;
    }
    console.log(`  🔎 "${s.term}" → ${taken} show(s)`);
  }
  console.log(`Reading ${candidates.length} RSS feeds…`);
  const shows = (
    await mapPool(candidates, 6, async (url) => {
      try {
        const show = await fetchFeed(url, EPISODES_PER_SHOW);
        if (!show?.episodes.length) return null;
        console.log(`  ✓ ${show.title} (${show.episodes.length} episodes)`);
        return show;
      } catch (err) {
        console.log(`  ✗ ${url} — ${String((err as Error).message ?? err).slice(0, 80)}`);
        return null;
      }
    })
  )
    .filter((s): s is FeedShow => Boolean(s))
    .slice(0, MAX_SHOWS);
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify({ fetchedAt: new Date().toISOString(), shows }));
  console.log(`Saved ${shows.length} shows to ${path.relative(process.cwd(), CACHE)}`);
  return shows;
}

async function loadStage(shows: FeedShow[]) {
  // Imported lazily so `--stage=fetch` works without a configured database.
  const { saveShow } = await import('../modules/podcasts/store');
  const { sql } = await import('../db/client');
  let n = 0;
  await mapPool(shows, 4, async (show) => {
    await saveShow(show, { computeColor: true });
    n++;
  });
  // The Podcasts tile on the Search page shows the most popular show's artwork.
  const { assignCategoryArt } = await import('../modules/browse/categoryArt');
  await assignCategoryArt();
  const [{ shows: s, episodes: e } = { shows: 0, episodes: 0 }] = await sql<{ shows: number; episodes: number }[]>`
    select (select count(*)::int from shows) as shows, (select count(*)::int from episodes) as episodes`;
  console.log(`Loaded ${n} shows. Database now has ${s} shows / ${e} episodes.`);
  await sql.end();
}

const shows =
  stage === 'load'
    ? (JSON.parse(fs.readFileSync(CACHE, 'utf8')) as { shows: FeedShow[] }).shows
    : await fetchStage();
if (stage !== 'fetch') await loadStage(shows);
