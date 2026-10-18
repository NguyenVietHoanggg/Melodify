/**
 * Server-authoritative playback. Every device sends INTENTS (play, next, seek…); this service applies the
 * rules (queue order, shuffle, repeat, ads, skip limits, autoplay) and every device renders the result.
 *
 * Concurrency: commands for one user run one at a time (per-user lock), and "next" carries the uid the
 * client believes is playing — if two devices press Next together, the second one is rejected as stale
 * instead of skipping two songs (optimistic concurrency).
 */
import { EventEmitter } from 'node:events';
import type { ContextType, DeviceInfo, Entitlements, PlayerView, RepeatMode, ShuffleMode, UserSettings } from '../../contracts';
import { sql } from '../../db/client';
import { conflict, forbidden, notFound, paymentRequired, tooMany } from '../../lib/http';
import { logger } from '../../lib/logger';
import { getEntitlements, type Platform } from '../billing/plans';
import { touchPlayed } from '../library/service';
import { transitionCost, type MixFeatures } from '../music/reorder';
import { balancedShuffle, interleaveRecommendations } from '../music/shuffle';
import { recommend } from '../reco/engine';
import { getProduct, getSettings } from '../users/service';
import { adDue, adDuration, pickAd } from './ads';
import { loadContext } from './context';
import { emptyState, entry, livePosition, newUid, type Entry, type SessionState } from './state';
import { buildView } from './view';

/** Fired after every state change; the realtime hub pushes the new view to the user's devices. */
export const playerEvents = new EventEmitter();
playerEvents.setMaxListeners(0);

// ── Per-user context (product, entitlements, settings), cached briefly ──────
interface UserCtx {
  entitlements: Entitlements;
  settings: UserSettings;
  at: number;
}
const userCtxCache = new Map<string, UserCtx>();

/** Plan or settings changed: drop cached entitlements and push a fresh view to every device. */
export function invalidateUser(userId: string) {
  userCtxCache.delete(`${userId}:web`);
  userCtxCache.delete(`${userId}:mobile`);
  playerEvents.emit('changed', userId);
}

async function userCtx(userId: string, platform: Platform): Promise<UserCtx> {
  const key = `${userId}:${platform}`;
  const hit = userCtxCache.get(key);
  if (hit && Date.now() - hit.at < 30_000) return hit;
  const [product, settings] = await Promise.all([getProduct(userId), getSettings(userId)]);
  const value = { entitlements: getEntitlements(product, platform), settings, at: Date.now() };
  userCtxCache.set(key, value);
  return value;
}

// ── Session storage: memory first, Postgres for durability ──────────────────
const sessions = new Map<string, SessionState>();
const saveTimers = new Map<string, NodeJS.Timeout>();

async function load(userId: string): Promise<SessionState> {
  const cached = sessions.get(userId);
  if (cached) return cached;
  const [row] = await sql<{ state: SessionState }[]>`select state from player_sessions where user_id = ${userId}`;
  // After a server restart nothing is actually playing anymore.
  const s = row ? { ...emptyState(), ...row.state, isPlaying: false } : emptyState();
  sessions.set(userId, s);
  return s;
}

function scheduleSave(userId: string, s: SessionState) {
  clearTimeout(saveTimers.get(userId));
  saveTimers.set(userId, setTimeout(() => {
    saveTimers.delete(userId);
    sql`insert into player_sessions (user_id, state, updated_at) values (${userId}, ${sql.json(s as never)}, now())
        on conflict (user_id) do update set state = excluded.state, updated_at = now()`.catch((err) => logger.warn({ err }, 'player session save failed'));
  }, 800));
}

function commit(userId: string, s: SessionState) {
  s.version += 1;
  scheduleSave(userId, s);
  playerEvents.emit('changed', userId);
}

const locks = new Map<string, Promise<void>>();
async function withLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(userId) ?? Promise.resolve();
  let release!: () => void;
  const mine = prev.then(() => new Promise<void>((r) => (release = r)));
  locks.set(userId, mine);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(userId) === mine) locks.delete(userId);
  }
}

// ── Devices (provided by the realtime hub, which knows who is online) ───────
let deviceProvider: (userId: string) => DeviceInfo[] = () => [];
export const setDeviceProvider = (fn: (userId: string) => DeviceInfo[]) => {
  deviceProvider = fn;
};

// ── Helpers ─────────────────────────────────────────────────────────────────
async function primaryArtists(trackIds: string[]): Promise<Map<string, string>> {
  if (!trackIds.length) return new Map();
  const rows = await sql<{ trackId: string; artistId: string }[]>`
    select track_id, artist_id from track_artists where position = 0 and track_id = any(${trackIds}::uuid[])`;
  return new Map(rows.map((r) => [r.trackId, r.artistId]));
}

async function featuresOf(trackIds: string[]): Promise<Map<string, MixFeatures>> {
  if (!trackIds.length) return new Map();
  const rows = await sql<{ id: string; bpm: number | null; musicalKey: number | null; keyMode: number | null; energy: number | null }[]>`
    select id, bpm, musical_key, key_mode, energy from tracks where id = any(${trackIds}::uuid[])`;
  return new Map(rows.map((r) => [r.id, {
    id: r.id, bpm: r.bpm, energy: r.energy,
    key: r.musicalKey != null && (r.keyMode === 0 || r.keyMode === 1) ? { pitch: r.musicalKey, mode: r.keyMode as 0 | 1 } : null,
  }]));
}

/** Shuffle the context (balanced by artist, recently heard songs pushed back) and, for Smart Shuffle, mix in recommendations. */
async function shuffledOrder(userId: string, s: SessionState, ids: string[], mode: ShuffleMode): Promise<Entry[]> {
  const [artists, recentRows] = await Promise.all([
    primaryArtists(ids),
    sql<{ trackId: string; at: Date }[]>`
      select track_id, max(started_at) as at from play_events
       where user_id = ${userId} and track_id = any(${ids}::uuid[]) and started_at > now() - interval '2 days'
       group by track_id`,
  ]);
  const recent = new Map(recentRows.map((r) => [r.trackId, 1 - (Date.now() - r.at.getTime()) / (2 * 86_400_000)]));
  const order = balancedShuffle(ids, (id) => artists.get(id), { recency: (id) => recent.get(id) ?? 0 });
  const base = order.map((id) => entry('track', id, 'context'));
  if (mode !== 'smart' || !ids.length) return base;

  // Smart Shuffle: about one recommendation for every three songs, each placed where it blends best.
  const recIds = await recommend({
    seedTrackIds: [...ids].sort(() => Math.random() - 0.5).slice(0, 40),
    excludeTrackIds: s.contextTrackIds,
    userId,
    limit: Math.min(60, Math.max(3, Math.ceil(ids.length / 3))),
    maxPerArtist: 2,
  });
  const feats = await featuresOf([...ids, ...recIds]);
  const merged = interleaveRecommendations(base, recIds, 3, (prev, next, pool) => {
    const fp = prev ? feats.get(prev.id) : undefined;
    const fn = next ? feats.get(next.id) : undefined;
    let best = 0;
    let bestCost = Infinity;
    pool.forEach((rid, i) => {
      const fr = feats.get(rid);
      if (!fr) return;
      const cost = (fp ? transitionCost(fp, fr) : 0) + (fn ? transitionCost(fr, fn) : 0);
      if (cost < bestCost) {
        bestCost = cost;
        best = i;
      }
    });
    return best;
  });
  return merged.map((x) => (typeof x === 'string' ? entry('track', x, 'smart_shuffle') : x));
}

async function startEntry(userId: string, s: SessionState, e: Entry, deviceId: string | null, settings: UserSettings, positionMs = 0) {
  const source = e.source === 'ad' ? 'context' : e.source;
  // Independent queries → sent together (one round-trip).
  const [progress, event] = await Promise.all([
    e.kind === 'episode' && positionMs === 0
      ? sql<{ positionMs: number; completed: boolean }[]>`
          select position_ms, completed from episode_progress where user_id = ${userId} and episode_id = ${e.id}`
      : null,
    e.kind !== 'ad'
      ? sql<{ id: number }[]>`
          insert into play_events (user_id, track_id, episode_id, context_type, context_id, source, device_id, is_private)
          values (${userId}, ${e.kind === 'track' ? e.id : null}, ${e.kind === 'episode' ? e.id : null},
                  ${s.context?.type ?? null}, ${s.context?.id ?? null}, ${source}, ${deviceId}, ${settings.privateSession})
          returning id`
      : null,
  ]);
  const resume = progress?.[0];
  s.current = e;
  s.currentStartedAt = Date.now();
  s.positionMs = resume && !resume.completed ? resume.positionMs : positionMs;
  s.updatedAt = Date.now();
  s.playEventId = event?.[0]?.id ?? null;
}

/**
 * Close the play event of what was playing. A play becomes a counted "stream" after 30 seconds.
 * The event is detached from the session right away; the bookkeeping writes run while the caller picks
 * and starts the next item (callers await both together instead of one after the other).
 */
function finishCurrent(userId: string, s: SessionState, reason: string, positionMs: number): Promise<unknown> {
  const cur = s.current;
  const eventId = s.playEventId;
  s.playEventId = null;
  if (!cur || cur.kind === 'ad' || !eventId) return Promise.resolve();
  const counted = positionMs >= 30_000 || reason === 'completed';
  const ms = Math.max(0, Math.round(positionMs));
  const writes = Promise.all([
    sql`update play_events set ms_played = ${ms}, ended_reason = ${reason}, counted = ${counted} where id = ${eventId}`,
    counted && cur.kind === 'track' ? sql`update tracks set play_count = play_count + 1 where id = ${cur.id}` : null,
    cur.kind === 'episode'
      ? sql`
          insert into episode_progress (user_id, episode_id, position_ms, completed) values (${userId}, ${cur.id}, ${ms}, ${reason === 'completed'})
          on conflict (user_id, episode_id) do update set position_ms = excluded.position_ms, completed = excluded.completed, updated_at = now()`
      : null,
  ]);
  writes.catch(() => {}); // awaited by the caller; this only avoids an "unhandled rejection" if the caller fails first
  return writes;
}

/** Pick what plays after the current item and start it (inserting an ad break for Free listeners). */
async function advance(userId: string, s: SessionState, ctx: UserCtx, deviceId: string | null, reason: string) {
  const cur = s.current;
  if (cur && cur.kind !== 'ad') {
    s.history.push(cur);
    if (s.history.length > 50) s.history.shift();
    if (cur.kind === 'track') s.tracksSinceAd += 1;
  }

  let next: Entry | null = null;
  let fromQueue = false;
  if (s.repeat === 'track' && reason === 'completed' && cur && cur.kind !== 'ad') {
    next = { ...cur, uid: newUid() };
  } else if (s.queue.length) {
    next = s.queue.shift()!;
    fromQueue = true;
  } else if (s.order.length) {
    next = s.order.shift()!;
  } else if (s.repeat === 'context' && s.contextTrackIds.length) {
    const kind = s.context?.type === 'show' || s.context?.type === 'episode' ? 'episode' : 'track';
    s.order = kind === 'track' && s.shuffle !== 'off'
      ? await shuffledOrder(userId, s, s.contextTrackIds, s.shuffle)
      : s.contextTrackIds.map((id) => entry(kind, id, 'context'));
    next = s.order.shift() ?? null;
  } else if (ctx.settings.autoplay && cur?.kind !== 'episode') {
    // Autoplay: keep the vibe going with songs similar to the last few (smooth transition from the last one).
    const recentTracks = s.history.filter((h) => h.kind === 'track').slice(-5).reverse().map((h) => h.id);
    const recs = recentTracks.length
      ? await recommend({
          seedTrackIds: recentTracks,
          excludeTrackIds: [...s.history.map((h) => h.id), ...s.contextTrackIds],
          userId, limit: 20, transitionFromId: recentTracks[0], maxPerArtist: 2,
        })
      : [];
    s.order = recs.map((id) => entry('track', id, 'autoplay'));
    next = s.order.shift() ?? null;
  }

  if (!next) {
    // End of the line: stay on the last item, paused at the start.
    s.current = cur && cur.kind !== 'ad' ? cur : (s.history.at(-1) ?? null);
    s.isPlaying = false;
    s.positionMs = 0;
    s.updatedAt = Date.now();
    return;
  }

  if (next.kind === 'track' && ctx.entitlements.ads && adDue(s)) {
    const ad = await pickAd(userId);
    if (ad) {
      (fromQueue ? s.queue : s.order).unshift(next);
      s.adImpressionId = ad.impressionId;
      next = entry('ad', ad.adId, 'ad');
    }
  }
  await startEntry(userId, s, next, deviceId, ctx.settings);
  s.isPlaying = true;
}

// ── Public API ──────────────────────────────────────────────────────────────
export interface Caller {
  userId: string;
  deviceId: string | null;
  platform: Platform;
}

async function skipsLeft(s: SessionState, ent: Entitlements): Promise<number | null> {
  if (ent.skipsPerHour === null) return null;
  const hourAgo = Date.now() - 3_600_000;
  return Math.max(0, ent.skipsPerHour - s.skips.filter((t) => t > hourAgo).length);
}

export async function getView(c: Caller): Promise<PlayerView> {
  const s = await load(c.userId);
  const ctx = await userCtx(c.userId, c.platform);
  return buildView({
    userId: c.userId, deviceId: c.deviceId, state: s, devices: deviceProvider(c.userId),
    entitlements: ctx.entitlements, settings: ctx.settings, skipsLeft: await skipsLeft(s, ctx.entitlements),
  });
}

export interface PlayInput {
  context?: { type: ContextType; id: string | null };
  offset?: { index?: number; trackId?: string };
  positionMs?: number;
}

/** An ad counts as heard once ~60% of it has played (speech engines read at different speeds). */
async function adHeard(s: SessionState): Promise<boolean> {
  if (s.current?.kind !== 'ad') return true;
  const duration = await adDuration(s.current.id);
  return Date.now() - (s.currentStartedAt ?? 0) >= duration * 0.6;
}

async function completeAd(s: SessionState) {
  if (s.adImpressionId) await sql`update ad_impressions set completed_at = now() where id = ${s.adImpressionId}`;
  s.tracksSinceAd = 0;
  s.lastAdAt = Date.now();
  s.adImpressionId = null;
}

export function play(c: Caller, input: PlayInput): Promise<PlayerView> {
  return withLock(c.userId, async () => {
    const s = await load(c.userId);
    const ctx = await userCtx(c.userId, c.platform);
    // Starting something new can't be used to escape an unfinished ad: the ad stays first in line.
    const pendingAd = s.current?.kind === 'ad' && !(await adHeard(s)) ? s.current : null;
    if (s.current?.kind === 'ad' && !pendingAd) await completeAd(s);

    if (!input.context) {
      // Plain "resume" on this device.
      if (s.current) {
        s.isPlaying = true;
        s.activeDeviceId = c.deviceId ?? s.activeDeviceId;
        s.updatedAt = Date.now();
        commit(c.userId, s);
      }
      return getView(c);
    }

    const loaded = await loadContext(input.context.type, input.context.id, c.userId);
    if (!loaded.ids.length) throw notFound('empty_context');
    let start = 0;
    if (input.offset?.trackId) start = Math.max(0, loaded.ids.indexOf(input.offset.trackId));
    else if (input.offset?.index !== undefined) start = Math.min(Math.max(0, input.offset.index), loaded.ids.length - 1);
    else if (s.shuffle !== 'off' && loaded.kind === 'track') start = Math.floor(Math.random() * loaded.ids.length);

    const finishing = pendingAd ? null : finishCurrent(c.userId, s, 'replaced', livePosition(s));
    if (!pendingAd && s.current && s.current.kind !== 'ad') s.history.push(s.current);
    s.context = loaded.context;
    s.contextTrackIds = loaded.ids;
    const first = loaded.ids[start]!;
    const rest = loaded.ids.filter((_, i) => i !== start);
    const smart = s.shuffle === 'smart' && ctx.entitlements.smartShuffle;
    if (s.shuffle === 'smart' && !ctx.entitlements.smartShuffle) s.shuffle = 'shuffle';
    s.order = loaded.kind === 'track' && s.shuffle !== 'off'
      ? await shuffledOrder(c.userId, s, rest, smart ? 'smart' : 'shuffle')
      : loaded.ids.slice(start + 1).map((id) => entry(loaded.kind, id, 'context'));

    let firstEntry = entry(loaded.kind, first, 'context');
    if (pendingAd) {
      s.order.unshift(firstEntry); // the chosen song plays right after the ad finishes
    } else {
      if (loaded.kind === 'track' && ctx.entitlements.ads && adDue(s)) {
        const ad = await pickAd(c.userId);
        if (ad) {
          s.order.unshift(firstEntry);
          s.adImpressionId = ad.impressionId;
          firstEntry = entry('ad', ad.adId, 'ad');
        }
      }
      await startEntry(c.userId, s, firstEntry, c.deviceId, ctx.settings, input.positionMs ?? 0);
    }
    await finishing;
    s.isPlaying = true;
    s.activeDeviceId = c.deviceId ?? s.activeDeviceId;
    const libType = loaded.context.type === 'collection' ? 'collection' : loaded.context.type;
    if (loaded.context.id && ['playlist', 'album', 'artist', 'show'].includes(libType)) {
      void touchPlayed(c.userId, libType, loaded.context.id).catch(() => {});
    }
    commit(c.userId, s);
    return getView(c);
  });
}

export function next(c: Caller, input: { reason: 'skipped' | 'completed'; positionMs?: number; expectedUid?: string }): Promise<PlayerView> {
  return withLock(c.userId, async () => {
    const s = await load(c.userId);
    const ctx = await userCtx(c.userId, c.platform);
    if (input.expectedUid && s.current?.uid !== input.expectedUid) throw conflict('stale_state');

    if (s.current?.kind === 'ad') {
      if (input.reason === 'skipped') throw forbidden('ad_not_skippable');
      if (!(await adHeard(s))) throw conflict('ad_not_finished');
      await completeAd(s);
    } else if (input.reason === 'skipped' && ctx.entitlements.skipsPerHour !== null) {
      const hourAgo = Date.now() - 3_600_000;
      s.skips = s.skips.filter((t) => t > hourAgo);
      if (s.skips.length >= ctx.entitlements.skipsPerHour) throw tooMany('skip_limit');
      s.skips.push(Date.now());
    }
    await Promise.all([
      finishCurrent(c.userId, s, input.reason, input.positionMs ?? livePosition(s)),
      advance(c.userId, s, ctx, c.deviceId ?? s.activeDeviceId, input.reason),
    ]);
    if (!s.activeDeviceId) s.activeDeviceId = c.deviceId;
    commit(c.userId, s);
    return getView(c);
  });
}

export function previous(c: Caller, input: { positionMs?: number }): Promise<PlayerView> {
  return withLock(c.userId, async () => {
    const s = await load(c.userId);
    const ctx = await userCtx(c.userId, c.platform);
    if (s.current?.kind === 'ad') throw forbidden('ad_playing');
    const pos = input.positionMs ?? livePosition(s);
    // Spotify rule: more than 3 seconds in → restart the song; otherwise go to the previous one.
    if (pos > 3000 || !s.history.length) {
      s.positionMs = 0;
      s.updatedAt = Date.now();
    } else {
      const finishing = finishCurrent(c.userId, s, 'skipped', pos);
      const prev = s.history.pop()!;
      if (s.current) (s.current.source === 'queue' ? s.queue : s.order).unshift(s.current);
      await Promise.all([finishing, startEntry(c.userId, s, { ...prev, uid: newUid() }, c.deviceId ?? s.activeDeviceId, ctx.settings)]);
      s.isPlaying = true;
    }
    commit(c.userId, s);
    return getView(c);
  });
}

export function pause(c: Caller, positionMs?: number): Promise<PlayerView> {
  return withLock(c.userId, async () => {
    const s = await load(c.userId);
    // Free listeners hear the ad through: no pausing it (it would also stall the ad timer).
    if (s.current?.kind === 'ad' && s.isPlaying) throw forbidden('ad_playing');
    s.positionMs = positionMs ?? livePosition(s);
    s.isPlaying = false;
    s.updatedAt = Date.now();
    if (s.current?.kind === 'episode') {
      await sql`
        insert into episode_progress (user_id, episode_id, position_ms) values (${c.userId}, ${s.current.id}, ${Math.round(s.positionMs)})
        on conflict (user_id, episode_id) do update set position_ms = excluded.position_ms, updated_at = now()`;
    }
    commit(c.userId, s);
    return getView(c);
  });
}

export function seek(c: Caller, positionMs: number): Promise<PlayerView> {
  return withLock(c.userId, async () => {
    const s = await load(c.userId);
    if (s.current?.kind === 'ad') throw forbidden('ad_playing');
    s.positionMs = Math.max(0, positionMs);
    s.updatedAt = Date.now();
    commit(c.userId, s);
    return getView(c);
  });
}

/** Periodic position report from the playing device (no broadcast — other devices extrapolate). */
export async function heartbeat(c: Caller, positionMs: number) {
  const s = await load(c.userId);
  if (s.activeDeviceId && c.deviceId !== s.activeDeviceId) return;
  s.positionMs = positionMs;
  s.updatedAt = Date.now();
  scheduleSave(c.userId, s);
}

export function setShuffle(c: Caller, mode: ShuffleMode): Promise<PlayerView> {
  return withLock(c.userId, async () => {
    const s = await load(c.userId);
    const ctx = await userCtx(c.userId, c.platform);
    if (mode === 'smart' && !ctx.entitlements.smartShuffle) throw paymentRequired('premium_required');
    const isTrackContext = !(s.context?.type === 'show' || s.context?.type === 'episode');
    if (isTrackContext && s.contextTrackIds.length) {
      if (mode === 'off') {
        const at = s.current ? s.contextTrackIds.indexOf(s.current.id) : -1;
        s.order = (at >= 0 ? s.contextTrackIds.slice(at + 1) : s.contextTrackIds).map((id) => entry('track', id, 'context'));
      } else {
        const rest = s.contextTrackIds.filter((id) => id !== s.current?.id);
        s.order = await shuffledOrder(c.userId, s, rest, mode);
      }
    }
    s.shuffle = mode;
    commit(c.userId, s);
    return getView(c);
  });
}

export function setRepeat(c: Caller, mode: RepeatMode): Promise<PlayerView> {
  return withLock(c.userId, async () => {
    const s = await load(c.userId);
    s.repeat = mode;
    commit(c.userId, s);
    return getView(c);
  });
}

export function addToQueue(c: Caller, items: { kind: 'track' | 'episode'; id: string }[]): Promise<PlayerView> {
  return withLock(c.userId, async () => {
    const s = await load(c.userId);
    s.queue.push(...items.map((i) => entry(i.kind, i.id, 'queue')));
    if (s.queue.length > 200) s.queue = s.queue.slice(-200);
    commit(c.userId, s);
    return getView(c);
  });
}

export function removeFromQueue(c: Caller, uids: string[]): Promise<PlayerView> {
  return withLock(c.userId, async () => {
    const s = await load(c.userId);
    const drop = new Set(uids);
    s.queue = s.queue.filter((e) => !drop.has(e.uid));
    s.order = s.order.filter((e) => !drop.has(e.uid));
    commit(c.userId, s);
    return getView(c);
  });
}

export function moveInQueue(c: Caller, uid: string, toIndex: number): Promise<PlayerView> {
  return withLock(c.userId, async () => {
    const s = await load(c.userId);
    const ctx = await userCtx(c.userId, c.platform);
    if (!ctx.entitlements.queueEdit) throw paymentRequired('premium_required');
    const from = s.queue.findIndex((e) => e.uid === uid);
    if (from < 0) throw notFound();
    const [moved] = s.queue.splice(from, 1);
    s.queue.splice(Math.min(Math.max(0, toIndex), s.queue.length), 0, moved!);
    commit(c.userId, s);
    return getView(c);
  });
}

export function clearQueue(c: Caller): Promise<PlayerView> {
  return withLock(c.userId, async () => {
    const s = await load(c.userId);
    s.queue = [];
    commit(c.userId, s);
    return getView(c);
  });
}

/** Click an item in the queue panel: jump straight to it (everything before it is skipped). */
export function playQueueItem(c: Caller, uid: string): Promise<PlayerView> {
  return withLock(c.userId, async () => {
    const s = await load(c.userId);
    const ctx = await userCtx(c.userId, c.platform);
    if (s.current?.kind === 'ad') throw forbidden('ad_playing');
    let target: Entry | undefined;
    const qi = s.queue.findIndex((e) => e.uid === uid);
    if (qi >= 0) {
      target = s.queue[qi];
      s.queue = s.queue.slice(qi + 1);
    } else {
      const oi = s.order.findIndex((e) => e.uid === uid);
      if (oi < 0) throw notFound();
      target = s.order[oi];
      s.order = s.order.slice(oi + 1);
    }
    const finishing = finishCurrent(c.userId, s, 'skipped', livePosition(s));
    if (s.current) s.history.push(s.current); // (an ad can't be current here: we threw above)
    await Promise.all([finishing, startEntry(c.userId, s, target!, c.deviceId ?? s.activeDeviceId, ctx.settings)]);
    s.isPlaying = true;
    s.activeDeviceId = s.activeDeviceId ?? c.deviceId;
    commit(c.userId, s);
    return getView(c);
  });
}

/** Spotify Connect: move playback to another device, keeping the position. */
export function transfer(c: Caller, targetDeviceId: string, playNow?: boolean): Promise<PlayerView> {
  return withLock(c.userId, async () => {
    const s = await load(c.userId);
    s.positionMs = livePosition(s);
    s.updatedAt = Date.now();
    s.activeDeviceId = targetDeviceId;
    if (playNow !== undefined) s.isPlaying = playNow && s.current != null;
    commit(c.userId, s);
    return getView(c);
  });
}

/** The active device disappeared (tab closed): stop and remember where we were. */
export async function deviceGone(userId: string, deviceId: string) {
  await withLock(userId, async () => {
    const s = await load(userId);
    if (s.activeDeviceId !== deviceId) return;
    s.positionMs = livePosition(s);
    s.isPlaying = false;
    s.updatedAt = Date.now();
    commit(userId, s);
  });
}

export async function flushSessions() {
  for (const [userId, timer] of saveTimers) {
    clearTimeout(timer);
    const s = sessions.get(userId);
    if (s) {
      await sql`insert into player_sessions (user_id, state, updated_at) values (${userId}, ${sql.json(s as never)}, now())
                on conflict (user_id) do update set state = excluded.state, updated_at = now()`;
    }
  }
}
