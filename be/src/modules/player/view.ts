/** Turns the compact session (ids only) into the PlayerView every client renders. */
import type { AdInfo, DeviceInfo, Entitlements, PlayerView, QueueItem, TransitionRecipe, UserSettings } from '../../contracts';
import { sql } from '../../db/client';
import { hydrateTracks } from '../catalog/repo';
import { autoTransition, buildRecipe, TRANSITION_PRESETS, type TransitionPreset } from '../music/transitions';
import type { MixFeatures } from '../music/reorder';
import { hydrateEpisodes } from '../podcasts/repo';
import type { Entry, SessionState } from './state';
import { streamFor } from './streams';
import { adDue, allAds } from './ads';

const UPCOMING_LIMIT = 50;
const HISTORY_LIMIT = 20;

async function hydrateAds(ids: string[]): Promise<Map<string, AdInfo>> {
  if (!ids.length) return new Map();
  const ads = await allAds();
  const out = new Map<string, AdInfo>();
  for (const id of ids) {
    const a = ads.get(id);
    if (a) {
      const { advertiser, title, body, imageUrl, ctaLabel, clickUrl, bgColor, durationMs } = a;
      out.set(id, { id, advertiser, title, body, imageUrl, ctaLabel, clickUrl, bgColor, durationMs });
    }
  }
  return out;
}

async function features(trackIds: string[]): Promise<Map<string, MixFeatures>> {
  const rows = await sql<{ id: string; bpm: number | null; musicalKey: number | null; keyMode: number | null; energy: number | null }[]>`
    select id, bpm, musical_key, key_mode, energy from tracks where id = any(${trackIds}::uuid[])`;
  return new Map(rows.map((r) => [r.id, {
    id: r.id,
    bpm: r.bpm,
    key: r.musicalKey != null && (r.keyMode === 0 || r.keyMode === 1) ? { pitch: r.musicalKey, mode: r.keyMode as 0 | 1 } : null,
    energy: r.energy,
  }]));
}

/**
 * How the current track should hand over to the next one:
 *   1. a Premium "Mix" playlist → the owner's custom transition, or Auto;
 *   2. Automix setting on algorithmic queues (radio, mixes, Smart Shuffle, Autoplay) → Auto;
 *   3. the Crossfade setting → a plain fade of that many seconds;
 *   4. otherwise a straight cut (gapless).
 */
async function transitionFor(s: SessionState, a: Entry, b: Entry, settings: UserSettings, ent: Entitlements): Promise<TransitionRecipe | null> {
  if (a.kind !== 'track' || b.kind !== 'track') return null;
  const mixPlaylist = ent.mix && s.context?.type === 'playlist' ? s.context.id : null;
  const [f, [row]] = await Promise.all([
    features([a.id, b.id]),
    mixPlaylist
      ? sql<{ mixEnabled: boolean; transition: { preset?: string; durationMs?: number; nextTrackId?: string } | null }[]>`
          select p.mix_enabled,
                 (select pt.transition from playlist_tracks pt where pt.playlist_id = p.id and pt.track_id = ${a.id} limit 1) as transition
            from playlists p where p.id = ${mixPlaylist}`
      : [],
  ]);
  const fa = f.get(a.id);
  const fb = f.get(b.id);
  if (!fa || !fb) return null;

  if (mixPlaylist) {
    if (row?.mixEnabled) {
      const custom = row.transition;
      if (custom?.preset && custom.nextTrackId === b.id && TRANSITION_PRESETS.includes(custom.preset as TransitionPreset)) {
        return buildRecipe(custom.preset as TransitionPreset, custom.durationMs ?? 8000, fa, fb, false);
      }
      return autoTransition(fa, fb);
    }
  }
  const algorithmic = b.source === 'autoplay' || b.source === 'smart_shuffle' || b.source === 'radio';
  if (settings.automix && algorithmic) return autoTransition(fa, fb);
  if (settings.crossfadeSec > 0) return buildRecipe('fade', settings.crossfadeSec * 1000, fa, fb, false);
  return null;
}

export interface ViewInput {
  userId: string;
  deviceId: string | null;
  state: SessionState;
  devices: DeviceInfo[];
  entitlements: Entitlements;
  settings: UserSettings;
  skipsLeft: number | null;
}

export async function buildView({ userId, deviceId, state: s, devices, entitlements, settings, skipsLeft }: ViewInput): Promise<PlayerView> {
  const queue = s.queue.slice(0, 100);
  const upcoming = s.order.slice(0, UPCOMING_LIMIT);
  const history = s.history.slice(-HISTORY_LIMIT).reverse();
  const all = [s.current, ...queue, ...upcoming, ...history].filter((e): e is Entry => Boolean(e));
  const ids = (k: Entry['kind']) => [...new Set(all.filter((e) => e.kind === k).map((e) => e.id))];

  // Only the device that should make sound gets stream URLs (and the hand-over to the next song).
  const current = deviceId && deviceId === s.activeDeviceId ? s.current : null;
  const nextEntry = current ? (s.repeat === 'track' && current.kind !== 'ad' ? current : (s.queue[0] ?? s.order[0])) : undefined;
  // An ad break is coming next: don't let the client preload/crossfade into the song (the server inserts the ad).
  const adComing = Boolean(current) && entitlements.ads && current!.kind !== 'ad' && adDue({ ...s, tracksSinceAd: s.tracksSinceAd + 1 });
  const handOver = current && nextEntry && !adComing ? nextEntry : null;

  // Everything below is independent: send it all at once (one round-trip to the database instead of five).
  const [tracks, episodes, ads, currentStream, nextStream, transition] = await Promise.all([
    hydrateTracks(ids('track'), userId),
    hydrateEpisodes(ids('episode'), userId),
    hydrateAds(ids('ad')),
    current ? streamFor(current, settings.audioQuality) : null,
    handOver ? streamFor(handOver, settings.audioQuality) : null,
    handOver && s.repeat !== 'track' ? transitionFor(s, current!, handOver, settings, entitlements) : null,
  ]);
  const item = (e: Entry | null): QueueItem | null => {
    if (!e) return null;
    if (e.kind === 'track') return tracks.has(e.id) ? { uid: e.uid, kind: 'track', source: e.source, track: tracks.get(e.id)! } : null;
    if (e.kind === 'episode') return episodes.has(e.id) ? { uid: e.uid, kind: 'episode', source: e.source, episode: episodes.get(e.id)! } : null;
    return ads.has(e.id) ? { uid: e.uid, kind: 'ad', source: 'ad', ad: ads.get(e.id)! } : null;
  };
  const list = (es: Entry[]) => es.map(item).filter((x): x is QueueItem => Boolean(x));

  const adPlaying = s.current?.kind === 'ad';
  const view: PlayerView = {
    version: s.version,
    isPlaying: s.isPlaying,
    positionMs: s.positionMs,
    serverTime: s.updatedAt,
    shuffle: s.shuffle,
    repeat: s.repeat,
    context: s.context,
    current: item(s.current),
    queue: list(queue),
    upcoming: list(upcoming),
    history: list(history),
    activeDeviceId: s.activeDeviceId,
    devices: devices.map((d) => ({ ...d, isActive: d.id === s.activeDeviceId })),
    restrictions: {
      pause: !adPlaying,
      skipNext: !adPlaying && (skipsLeft === null || skipsLeft > 0),
      skipPrevious: !adPlaying,
      seek: !adPlaying,
      shuffle: !adPlaying,
      smartShuffle: entitlements.smartShuffle,
      repeat: !adPlaying,
      queueEdit: entitlements.queueEdit,
      reason: adPlaying ? 'ad_playing' : skipsLeft === 0 ? 'skip_limit' : null,
    },
    skipsLeft,
    stream: currentStream,
    next: handOver && nextStream ? { uid: handOver.uid, stream: nextStream, transition } : null,
  };
  return view;
}
