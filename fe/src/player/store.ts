/**
 * The player state as rendered by THIS tab. The authoritative state lives on the backend (PlayerView);
 * this store keeps the latest view plus purely local things (this device's volume, the precise position
 * reported by the audio element, buffering).
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PlayerView, QueueItem } from '@contracts';
import { deviceId } from '@/lib/device';

interface PlayerStore {
  view: PlayerView | null;
  /** Local clock when the view arrived (position extrapolation for remote playback). */
  receivedAt: number;
  volume: number;
  muted: boolean;
  /** Position measured by the local audio engine (only meaningful when this tab is the active device). */
  localPositionMs: number | null;
  buffering: boolean;
  setView: (v: PlayerView) => void;
  patchView: (p: Partial<PlayerView>) => void;
  setVolume: (v: number) => void;
  setMuted: (m: boolean) => void;
  setLocalPosition: (ms: number | null) => void;
  setBuffering: (b: boolean) => void;
}

export const usePlayer = create<PlayerStore>()(
  persist(
    (set, get) => ({
      view: null,
      receivedAt: 0,
      volume: 0.8,
      muted: false,
      localPositionMs: null,
      buffering: false,
      setView: (v) => {
        const cur = get().view;
        if (cur && v.version < cur.version) return; // an older response arrived late — ignore it
        set({ view: v, receivedAt: Date.now() });
      },
      patchView: (p) => {
        const cur = get().view;
        if (cur) set({ view: { ...cur, ...p }, receivedAt: Date.now() });
      },
      setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)), muted: false }),
      setMuted: (muted) => set({ muted }),
      setLocalPosition: (localPositionMs) => set({ localPositionMs }),
      setBuffering: (buffering) => set({ buffering }),
    }),
    { name: 'melodify.player', partialize: (s) => ({ volume: s.volume, muted: s.muted }) },
  ),
);

export const isActiveDevice = (v: PlayerView | null) => v?.activeDeviceId === deviceId;

/** Best estimate of the playback position right now. */
export function currentPosition(): number {
  const { view, receivedAt, localPositionMs } = usePlayer.getState();
  if (!view) return 0;
  if (isActiveDevice(view) && localPositionMs != null) return localPositionMs;
  return view.isPlaying ? view.positionMs + (Date.now() - receivedAt) : view.positionMs;
}

export function durationOf(item: QueueItem | null | undefined): number {
  if (!item) return 0;
  return item.track?.durationMs ?? item.episode?.durationMs ?? item.ad?.durationMs ?? 0;
}

export function titleOf(item: QueueItem | null | undefined): string {
  return item?.track?.title ?? item?.episode?.title ?? item?.ad?.title ?? '';
}

export function imageOf(item: QueueItem | null | undefined): string | null {
  return item?.track?.album?.coverUrl ?? item?.episode?.imageUrl ?? item?.ad?.imageUrl ?? null;
}
