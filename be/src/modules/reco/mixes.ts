/**
 * Personalised playlists ("Made For You"): Daily Mix 1–6, Discover Weekly, Release Radar, On Repeat,
 * plus "Your top mixes" (artist / genre / decade / mood mixes). Stored as real playlists
 * (kind = 'mix', generated_for = user) and regenerated lazily when they expire.
 */
import type { MixCover } from '../../contracts';
import { sql } from '../../db/client';
import { logger } from '../../lib/logger';
import { kmeans } from './cluster';
import { recommend } from './engine';
import { tasteTracks, topArtistIds, topGenres, type TasteTrack } from './taste';

const PALETTE = ['#e13300', '#1e3264', '#8d67ab', '#148a08', '#e8115b', '#0d73ec', '#ba5d07', '#27856a'];
const GENRE_LABEL: Record<string, { vi: string; en: string }> = {
  pop: { vi: 'Pop', en: 'Pop' }, hiphop: { vi: 'Hip-Hop', en: 'Hip-Hop' }, rnb: { vi: 'R&B', en: 'R&B' },
  electronic: { vi: 'Điện tử', en: 'Electronic' }, house: { vi: 'House', en: 'House' }, techno: { vi: 'Techno', en: 'Techno' },
  bass: { vi: 'Bass', en: 'Bass' }, rock: { vi: 'Rock', en: 'Rock' }, alternative: { vi: 'Indie', en: 'Indie' },
  lofi: { vi: 'Lo-fi', en: 'Lo-fi' }, ambient: { vi: 'Ambient', en: 'Ambient' }, jazz: { vi: 'Jazz', en: 'Jazz' },
  classical: { vi: 'Cổ điển', en: 'Classical' }, acoustic: { vi: 'Acoustic', en: 'Acoustic' },
  world: { vi: 'World', en: 'World' }, soundtrack: { vi: 'Nhạc phim', en: 'Soundtrack' },
};

type Locale = 'vi' | 'en';

interface MixSpec {
  key: string;
  name: string;
  description: string;
  cover: MixCover;
  trackIds: string[];
  expiresAt: Date;
  section: 'made_for_you' | 'top_mixes';
}

const inHours = (h: number) => new Date(Date.now() + h * 3600_000);
function nextWeekday(day: number): Date {
  // day: 0 = Sunday … 5 = Friday. Next occurrence at 06:00 Vietnam time (UTC+7) = 23:00 UTC the day before.
  const d = new Date();
  d.setUTCHours(23, 0, 0, 0);
  const target = (day + 6) % 7; // the UTC day that is 06:00 of `day` in UTC+7
  while (d.getUTCDay() !== target || d <= new Date()) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

async function artistInfo(ids: string[]) {
  if (!ids.length) return new Map<string, { name: string; avatarUrl: string | null }>();
  const rows = await sql<{ id: string; name: string; avatarUrl: string | null }[]>`select id, name, avatar_url from artists where id = any(${ids}::uuid[])`;
  return new Map(rows.map((r) => [r.id, r]));
}

function andMore(names: string[], locale: Locale) {
  const list = names.slice(0, 3).join(', ');
  return locale === 'vi' ? `${list} và nhiều nghệ sĩ khác` : `${list} and more`;
}

/** Interleave familiar and new tracks: F N F N … (Daily Mix recipe). */
function interleave(a: string[], b: string[]) {
  const out: string[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i]!);
    if (b[i]) out.push(b[i]!);
  }
  return [...new Set(out)];
}

function capPerArtist(taste: TasteTrack[], max: number, limit: number) {
  const count = new Map<string, number>();
  const out: TasteTrack[] = [];
  for (const t of taste) {
    const k = t.artistId ?? t.trackId;
    if ((count.get(k) ?? 0) >= max) continue;
    count.set(k, (count.get(k) ?? 0) + 1);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Every kind of mix is built independently, so they all run at the same time (Promise.all): the whole
 * "Made For You" set costs a handful of database round-trips instead of one after another per mix.
 */
async function buildSpecs(userId: string, locale: Locale): Promise<MixSpec[]> {
  const taste = await tasteTracks(userId, 300);
  if (taste.length < 5) return [];
  const allTaste = taste.map((t) => t.trackId);
  const groups = await Promise.all([
    dailyMixes(userId, locale, taste, allTaste),
    discoverWeekly(userId, locale, taste, allTaste),
    releaseRadar(userId, locale, taste, allTaste),
    onRepeat(userId, locale),
    artistMixes(userId, locale, taste),
    genreMixes(userId, locale, taste),
    decadeMix(userId, taste),
    moodMix(userId, locale, taste),
  ]);
  return groups.flat().filter((s) => s.trackIds.length >= 5);
}

// ── Daily Mixes: one per taste cluster ────────────────────────────────────────
async function dailyMixes(userId: string, locale: Locale, taste: TasteTrack[], allTaste: string[]): Promise<MixSpec[]> {
  const k = Math.min(6, Math.max(1, Math.floor(taste.length / 12)));
  const assign = kmeans(taste.map((t) => t.vector), taste.map((t) => t.weight), k);
  const clusters = [...Array(k).keys()]
    .map((c) => taste.filter((_, i) => assign[i] === c))
    .filter((members) => members.length >= 3)
    .sort((a, b) => b.reduce((s, t) => s + t.weight, 0) - a.reduce((s, t) => s + t.weight, 0));
  const [clusterArtists, fresh] = await Promise.all([
    artistInfo([...new Set(clusters.flatMap((c) => topArtistIds(c, 3)))]),
    Promise.all(clusters.map((members) => recommend({
      seedTrackIds: capPerArtist(members, 3, 25).map((t) => t.trackId).slice(0, 15),
      excludeTrackIds: allTaste, userId, limit: 25, maxPerArtist: 2,
    }))),
  ]);
  return clusters.map((members, i) => {
    const familiar = capPerArtist(members, 3, 25).map((t) => t.trackId);
    const artists = topArtistIds(members, 3).map((id) => clusterArtists.get(id)).filter(Boolean) as { name: string; avatarUrl: string | null }[];
    return {
      key: `daily-${i + 1}`,
      name: `Daily Mix ${i + 1}`,
      description: andMore(artists.map((a) => a.name), locale),
      cover: { style: 'daily', label: `Daily Mix ${i + 1}`, color: PALETTE[i % PALETTE.length]!, imageUrl: artists[0]?.avatarUrl ?? null },
      trackIds: interleave(familiar, fresh[i]!),
      expiresAt: inHours(24),
      section: 'made_for_you',
    };
  });
}

// ── Discover Weekly: never-heard tracks close to the whole taste ──────────────
async function discoverWeekly(userId: string, locale: Locale, taste: TasteTrack[], allTaste: string[]): Promise<MixSpec[]> {
  const heard = await sql<{ trackId: string }[]>`select distinct track_id from play_events where user_id = ${userId} and track_id is not null`;
  const discover = await recommend({
    seedTrackIds: taste.slice(0, 40).map((t) => t.trackId),
    excludeTrackIds: [...allTaste, ...heard.map((h) => h.trackId)],
    userId, limit: 30, maxPerArtist: 1, lambda: 0.65,
  });
  if (discover.length < 10) return [];
  return [{
    key: 'discover-weekly',
    name: 'Discover Weekly',
    description: locale === 'vi' ? 'Danh sách phát hằng tuần gồm nhạc mới và những viên ngọc ẩn, dành riêng cho bạn. Cập nhật mỗi thứ Hai.' : 'Your weekly mixtape of fresh music. Enjoy new music and deep cuts picked for you. Updates every Monday.',
    cover: { style: 'discover', label: 'Discover Weekly', color: '#477d95', imageUrl: null },
    trackIds: discover,
    expiresAt: nextWeekday(1),
    section: 'made_for_you',
  }];
}

// ── Release Radar: newest releases from artists you follow or listen to ───────
async function releaseRadar(userId: string, locale: Locale, taste: TasteTrack[], allTaste: string[]): Promise<MixSpec[]> {
  const radarArtists = topArtistIds(taste, 30);
  const radar = await sql<{ id: string }[]>`
    select distinct on (ta.artist_id) t.id from tracks t join track_artists ta on ta.track_id = t.id
     where t.is_playable
       and (ta.artist_id = any(${radarArtists}::uuid[])
            or ta.artist_id in (select item_id from library_items where user_id = ${userId} and item_type = 'artist'))
     order by ta.artist_id, t.release_date desc nulls last`;
  const newSimilar = await recommend({ seedTrackIds: taste.slice(0, 20).map((t) => t.trackId), excludeTrackIds: [...allTaste, ...radar.map((r) => r.id)], userId, limit: 15, maxPerArtist: 1 });
  const radarIds = [...radar.map((r) => r.id).slice(0, 15), ...newSimilar];
  if (radarIds.length < 8) return [];
  return [{
    key: 'release-radar',
    name: 'Release Radar',
    description: locale === 'vi' ? 'Bắt kịp những bản phát hành mới nhất từ các nghệ sĩ bạn theo dõi. Cập nhật mỗi thứ Sáu.' : 'Catch all the latest music from artists you follow, plus new singles picked for you. Updates every Friday.',
    cover: { style: 'release_radar', label: 'Release Radar', color: '#608108', imageUrl: null },
    trackIds: radarIds,
    expiresAt: nextWeekday(5),
    section: 'made_for_you',
  }];
}

// ── On Repeat: what you can't stop playing (last 30 days) ─────────────────────
async function onRepeat(userId: string, locale: Locale): Promise<MixSpec[]> {
  const repeat = await sql<{ trackId: string }[]>`
    select track_id from play_events
     where user_id = ${userId} and counted and track_id is not null and started_at > now() - interval '30 days'
     group by track_id having count(*) >= 2 order by count(*) desc limit 30`;
  if (repeat.length < 5) return [];
  return [{
    key: 'on-repeat',
    name: 'On Repeat',
    description: locale === 'vi' ? 'Những bài hát bạn đang nghe đi nghe lại nhiều nhất.' : "Songs you love right now.",
    cover: { style: 'on_repeat', label: 'On Repeat', color: '#e8115b', imageUrl: null },
    trackIds: repeat.map((r) => r.trackId),
    expiresAt: inHours(24),
    section: 'made_for_you',
  }];
}

// ── Your top mixes ────────────────────────────────────────────────────────────
async function artistMixes(userId: string, locale: Locale, taste: TasteTrack[]): Promise<MixSpec[]> {
  const topArtists = [...(await artistInfo(topArtistIds(taste, 3))).entries()];
  return Promise.all(topArtists.map(async ([artistId, info], i): Promise<MixSpec> => {
    const own = await sql<{ id: string }[]>`
      select t.id from tracks t join track_artists ta on ta.track_id = t.id and ta.artist_id = ${artistId}
       where t.is_playable order by t.popularity desc limit 10`;
    const similar = await recommend({ seedTrackIds: own.map((o) => o.id), excludeTrackIds: own.map((o) => o.id), userId, limit: 40, maxPerArtist: 2, freshness: false });
    return {
      key: `artist-mix-${artistId}`,
      name: `${info.name} Mix`,
      description: andMore([info.name], locale),
      cover: { style: 'artist', label: `${info.name} Mix`, color: PALETTE[(i + 3) % PALETTE.length]!, imageUrl: info.avatarUrl },
      trackIds: interleave(own.map((o) => o.id), similar),
      expiresAt: inHours(24 * 3),
      section: 'top_mixes',
    };
  }));
}

function genreMixes(userId: string, locale: Locale, taste: TasteTrack[]): Promise<MixSpec[]> {
  return Promise.all(topGenres(taste, 2).map(async (genre, i): Promise<MixSpec> => {
    const seeds = taste.filter((t) => t.genre === genre).slice(0, 15).map((t) => t.trackId);
    const ids = await recommend({ seedTrackIds: seeds, userId, limit: 40, maxPerArtist: 2, freshness: false });
    const label = `${GENRE_LABEL[genre]?.[locale] ?? genre} Mix`;
    return {
      key: `genre-mix-${genre}`, name: label, description: '',
      cover: { style: 'genre', label, color: PALETTE[(i + 5) % PALETTE.length]!, imageUrl: null },
      trackIds: [...seeds.slice(0, 10), ...ids], expiresAt: inHours(24 * 3), section: 'top_mixes',
    };
  }));
}

async function decadeMix(userId: string, taste: TasteTrack[]): Promise<MixSpec[]> {
  const decades = new Map<number, TasteTrack[]>();
  for (const t of taste) if (t.releaseYear) decades.set(Math.floor(t.releaseYear / 10) * 10, [...(decades.get(Math.floor(t.releaseYear / 10) * 10) ?? []), t]);
  const [decade, decadeTracks] = [...decades.entries()].sort((a, b) => b[1].length - a[1].length)[0] ?? [];
  if (!decade || !decadeTracks || decadeTracks.length < 5) return [];
  const ids = await recommend({ seedTrackIds: decadeTracks.slice(0, 15).map((t) => t.trackId), userId, limit: 40, maxPerArtist: 2, freshness: false });
  const label = `${decade}s Mix`;
  return [{
    key: `decade-mix-${decade}`, name: label, description: '',
    cover: { style: 'decade', label, color: '#8d67ab', imageUrl: null },
    trackIds: ids, expiresAt: inHours(24 * 3), section: 'top_mixes',
  }];
}

async function moodMix(userId: string, locale: Locale, taste: TasteTrack[]): Promise<MixSpec[]> {
  const avgEnergy = taste.reduce((s, t) => s + (t.energy ?? 0.5) * t.weight, 0) / taste.reduce((s, t) => s + t.weight, 0);
  const chill = avgEnergy < 0.55;
  const moodSeeds = taste.filter((t) => (chill ? (t.energy ?? 0.5) < 0.5 : (t.energy ?? 0.5) >= 0.6)).slice(0, 15).map((t) => t.trackId);
  if (moodSeeds.length < 5) return [];
  const ids = await recommend({ seedTrackIds: moodSeeds, userId, limit: 40, maxPerArtist: 2, freshness: false });
  const label = chill ? (locale === 'vi' ? 'Chill Mix' : 'Chill Mix') : (locale === 'vi' ? 'Upbeat Mix' : 'Upbeat Mix');
  return [{
    key: `mood-mix-${chill ? 'chill' : 'upbeat'}`, name: label, description: '',
    cover: { style: 'mood', label, color: chill ? '#27856a' : '#e13300', imageUrl: null },
    trackIds: ids, expiresAt: inHours(24 * 3), section: 'top_mixes',
  }];
}

/** Upsert the mix playlist and replace its songs — one statement, so it's atomic AND a single round-trip. */
async function save(userId: string, spec: MixSpec) {
  const generator = { type: 'mix', key: spec.key, section: spec.section, cover: spec.cover };
  await sql`
    with mix as (
      insert into playlists (owner_id, kind, name, description, dominant_color, is_public, generated_for, generator, expires_at, provider, provider_id)
      values (null, 'mix', ${spec.name}, ${spec.description || null}, ${spec.cover.color}, false, ${userId},
              ${sql.json(generator as never)}, ${spec.expiresAt}, 'melodify-mix', ${`${userId}:${spec.key}`})
      on conflict (provider, provider_id) do update set
        name = excluded.name, description = excluded.description, dominant_color = excluded.dominant_color,
        generator = excluded.generator, expires_at = excluded.expires_at, updated_at = now()
      returning id
    ), cleared as (
      delete from playlist_tracks where playlist_id = (select id from mix)
    )
    insert into playlist_tracks (playlist_id, track_id, position)
    select (select id from mix), x.track_id, x.ord
      from unnest(${spec.trackIds.slice(0, 60)}::uuid[]) with ordinality as x(track_id, ord)`;
}

const running = new Map<string, Promise<void>>();
/** Users whose listening isn't enough for any mix yet: don't recompute on every home visit. */
const notEnoughUntil = new Map<string, number>();

/** Regenerate a user's mixes. Concurrent callers share the same in-flight generation. */
export function refreshMixes(userId: string, locale: Locale): Promise<void> {
  const existing = running.get(userId);
  if (existing) return existing;
  const job = (async () => {
    const started = Date.now();
    const specs = await buildSpecs(userId, locale);
    await Promise.all(specs.map((spec) => save(userId, spec)));
    // Drop mixes that no longer apply (e.g. a taste cluster disappeared).
    const keep = specs.map((s) => `${userId}:${s.key}`);
    await sql`delete from playlists where provider = 'melodify-mix' and generated_for = ${userId} and not (provider_id = any(${keep}))`;
    if (specs.length) notEnoughUntil.delete(userId);
    else notEnoughUntil.set(userId, Date.now() + 10 * 60_000);
    logger.info({ userId, mixes: specs.length, ms: Date.now() - started }, 'mixes regenerated');
  })().finally(() => running.delete(userId));
  running.set(userId, job);
  return job;
}

/**
 * First visit: generate and wait for it (but never more than a couple of seconds — if it takes longer, the
 * mixes simply appear on the next visit). Later visits: serve what exists and refresh expired mixes in the
 * background, so the home page never waits.
 */
export async function ensureMixes(userId: string, locale: Locale): Promise<void> {
  if ((notEnoughUntil.get(userId) ?? 0) > Date.now()) return;
  const [state] = await sql<{ total: number; expired: number }[]>`
    select count(*)::int as total, count(*) filter (where expires_at < now())::int as expired
      from playlists where provider = 'melodify-mix' and generated_for = ${userId}`;
  if (!state || state.total === 0) {
    const job = refreshMixes(userId, locale).catch((err) => logger.warn({ err }, 'mix generation failed'));
    await Promise.race([job, new Promise((resolve) => setTimeout(resolve, 2500))]);
  } else if (state.expired > 0) {
    void refreshMixes(userId, locale).catch((err) => logger.warn({ err }, 'mix refresh failed'));
  }
}
