/**
 * The server-side playback session ("Connect cluster"): ONE per user, followed by all of their devices.
 * Stored compactly as JSON (player_sessions.state) and kept in memory while the user is active.
 */
import crypto from 'node:crypto';
import type { PlayContext, QueueSource, RepeatMode, ShuffleMode } from '../../contracts';

export interface Entry {
  /** Unique per queue position (the same song can be queued twice). */
  uid: string;
  kind: 'track' | 'episode' | 'ad';
  id: string;
  source: QueueSource;
}

export interface SessionState {
  version: number;
  isPlaying: boolean;
  /** Position at `updatedAt` (live position = positionMs + now − updatedAt while playing). */
  positionMs: number;
  updatedAt: number;
  shuffle: ShuffleMode;
  repeat: RepeatMode;
  context: PlayContext | null;
  /** Context tracks in their natural order (to undo shuffle and to repeat the context). */
  contextTrackIds: string[];
  current: Entry | null;
  currentStartedAt: number | null;
  playEventId: number | null;
  adImpressionId: number | null;
  /** "Next in queue" (user-added). */
  queue: Entry[];
  /** "Next from: <context>" in play order (shuffled or not, incl. Smart Shuffle & Autoplay). */
  order: Entry[];
  /** Played entries, most recent last. */
  history: Entry[];
  activeDeviceId: string | null;
  tracksSinceAd: number;
  lastAdAt: number;
  skips: number[];
}

export const newUid = () => crypto.randomBytes(5).toString('base64url');

export const entry = (kind: Entry['kind'], id: string, source: QueueSource): Entry => ({ uid: newUid(), kind, id, source });

export function emptyState(): SessionState {
  return {
    version: 0,
    isPlaying: false,
    positionMs: 0,
    updatedAt: Date.now(),
    shuffle: 'off',
    repeat: 'off',
    context: null,
    contextTrackIds: [],
    current: null,
    currentStartedAt: null,
    playEventId: null,
    adImpressionId: null,
    queue: [],
    order: [],
    history: [],
    activeDeviceId: null,
    tracksSinceAd: 0,
    lastAdAt: Date.now(),
    skips: [],
  };
}

export const livePosition = (s: SessionState, now = Date.now()) =>
  s.isPlaying ? s.positionMs + (now - s.updatedAt) : s.positionMs;
