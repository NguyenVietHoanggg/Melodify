/**
 * User intents → backend. Each command sends the intent, receives the new authoritative view and puts
 * it in the store. Play/pause/seek also update the store optimistically so the UI reacts instantly.
 */
import type { ContextType, PlayerView, RepeatMode, ShuffleMode } from '@contracts';
import i18n from '@/i18n';
import { ApiError, del, errorMessage, get, post, put } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { toast } from '@/stores/toast';
import { useUi } from '@/stores/ui';
import { currentPosition, usePlayer } from './store';

const loggedIn = () => Boolean(queryClient.getQueryData<{ me: unknown }>(['session'])?.me);

async function run(fn: () => Promise<PlayerView>) {
  try {
    const v = await fn();
    usePlayer.getState().setView(v);
    return v;
  } catch (err) {
    if (err instanceof ApiError && err.code === 'stale_state') {
      // Someone else changed playback first — just resync.
      await refreshPlayer();
      return null;
    }
    if (err instanceof ApiError && err.code === 'premium_required') {
      toast(i18n.t('player.premiumOnly'), { action: { label: i18n.t('nav.explorePremium'), onClick: () => (window.location.href = '/premium') } });
    } else {
      toast(errorMessage(err));
    }
    await refreshPlayer();
    return null;
  }
}

export async function refreshPlayer() {
  if (!loggedIn()) return;
  try {

    usePlayer.getState().setView(await get<PlayerView>('/me/player'));
  } catch {
    // offline — the socket will resync us
  }
}

export interface PlayRequest {
  context: { type: ContextType; id: string | null };
  offset?: { index?: number; trackId?: string };
  /** Shown in the "Start listening with a free account" modal for logged-out visitors. */
  promptImage?: string | null;
  promptColor?: string | null;
}

export function playContext(req: PlayRequest) {
  if (!loggedIn()) {
    useUi.getState().showLoginPrompt({ kind: 'play', imageUrl: req.promptImage, color: req.promptColor });
    return Promise.resolve(null);
  }
  usePlayer.getState().patchView({ isPlaying: true });
  return run(() => put<PlayerView>('/me/player/play', { context: req.context, offset: req.offset }));
}

export function resume() {
  usePlayer.getState().patchView({ isPlaying: true });
  return run(() => put<PlayerView>('/me/player/play', {}));
}

/** True (and a short notice) when an ad is playing: it can't be paused, skipped or rewound. */
function adLocked(): boolean {
  const v = usePlayer.getState().view;
  if (v?.current?.kind !== 'ad' || !v.isPlaying) return false;
  toast(i18n.t('player.adLocked'));
  return true;
}

export function pause() {
  if (adLocked()) return Promise.resolve(null);
  const positionMs = currentPosition();
  usePlayer.getState().patchView({ isPlaying: false, positionMs, serverTime: Date.now() });
  return run(() => put<PlayerView>('/me/player/pause', { positionMs }));
}

export function togglePlay() {
  const v = usePlayer.getState().view;
  if (!v?.current) return Promise.resolve(null);
  return v.isPlaying ? pause() : resume();
}

export function next(reason: 'skipped' | 'completed' = 'skipped') {
  if (reason === 'skipped' && adLocked()) return Promise.resolve(null);
  const v = usePlayer.getState().view;
  return run(() => post<PlayerView>('/me/player/next', { reason, positionMs: currentPosition(), expectedUid: v?.current?.uid }));
}

export function previous() {
  if (adLocked()) return Promise.resolve(null);
  return run(() => post<PlayerView>('/me/player/previous', { positionMs: currentPosition() }));
}

export function seek(positionMs: number) {
  usePlayer.getState().patchView({ positionMs, serverTime: Date.now() });
  usePlayer.getState().setLocalPosition(positionMs);
  return run(() => put<PlayerView>('/me/player/seek', { positionMs }));
}

export const setShuffle = (mode: ShuffleMode) => run(() => put<PlayerView>('/me/player/shuffle', { mode }));
export const setRepeat = (mode: RepeatMode) => run(() => put<PlayerView>('/me/player/repeat', { mode }));

/** Shuffle button cycle: off → shuffle → Smart Shuffle (Premium) → off. */
export function cycleShuffle(smartAllowed: boolean) {
  const mode = usePlayer.getState().view?.shuffle ?? 'off';
  const nextMode: ShuffleMode = mode === 'off' ? 'shuffle' : mode === 'shuffle' && smartAllowed ? 'smart' : 'off';
  if (nextMode === 'smart') toast(i18n.t('player.smartShuffleOn'));
  return setShuffle(nextMode);
}

/** Repeat button cycle: off → context → track → off. */
export function cycleRepeat() {
  const mode = usePlayer.getState().view?.repeat ?? 'off';
  return setRepeat(mode === 'off' ? 'context' : mode === 'context' ? 'track' : 'off');
}

export function addToQueue(items: { kind: 'track' | 'episode'; id: string }[]) {
  if (!loggedIn()) return Promise.resolve(null);
  toast(i18n.language === 'vi' ? 'Đã thêm vào danh sách chờ' : 'Added to queue');
  return run(() => post<PlayerView>('/me/player/queue', { items }));
}

export const removeFromQueue = (uids: string[]) => run(() => del<PlayerView>('/me/player/queue', { uids }));
export const clearQueue = () => run(() => del<PlayerView>('/me/player/queue', {}));
export const playQueueItem = (uid: string) => run(() => post<PlayerView>(`/me/player/queue/${uid}/play`));
export const moveQueueItem = (uid: string, toIndex: number) => run(() => put<PlayerView>(`/me/player/queue/${uid}/position`, { toIndex }));
export const transferTo = (deviceId: string, play?: boolean) => run(() => put<PlayerView>('/me/player/device', { deviceId, play }));
export const setRemoteVolume = (deviceId: string, volume: number) => put('/me/player/volume', { deviceId, volume });
