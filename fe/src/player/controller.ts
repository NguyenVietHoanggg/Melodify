/**
 * Keeps the audio engine in line with the backend's PlayerView (this tab only produces sound when it is
 * the active device). Also reports progress, starts Mix/crossfade transitions on time, and wires the OS
 * media keys (Media Session API).
 */
import type { PlayerView } from '@contracts';
import i18n from '@/i18n';
import { put } from '@/lib/api';
import { deviceId } from '@/lib/device';
import { toast } from '@/stores/toast';
import * as commands from './commands';
import { audioEngine } from './engine';
import { currentPosition, durationOf, imageOf, titleOf, usePlayer } from './store';

let loadedUid: string | null = null;
let transitioningTo: string | null = null;
let completing = false;
let started = false;

const isActive = (v: PlayerView | null) => Boolean(v && v.activeDeviceId === deviceId);

function livePositionOf(v: PlayerView) {
  return v.isPlaying ? v.positionMs + (Date.now() - v.serverTime) : v.positionMs;
}

async function complete(uid: string) {
  if (completing) return;
  completing = true;
  try {
    const v = usePlayer.getState().view;
    if (v?.current?.uid === uid) await commands.next('completed');
  } finally {
    completing = false;
  }
}

function sync(view: PlayerView | null, prev: PlayerView | null) {
  if (!isActive(view) || !view?.current || !view.stream) {
    if (loadedUid) audioEngine.stopAll();
    loadedUid = null;
    transitioningTo = null;
    usePlayer.getState().setLocalPosition(null);
    return;
  }
  const cur = view.current;

  // Spoken ad
  if (cur.kind === 'ad' && view.stream.speech) {
    if (loadedUid !== cur.uid) {
      loadedUid = cur.uid;
      audioEngine.speak(cur.uid, view.stream.speech.text, view.stream.speech.lang, () => void complete(cur.uid));
    } else if (view.isPlaying && !prev?.isPlaying) audioEngine.resumeSpeech();
    else if (!view.isPlaying && prev?.isPlaying) audioEngine.pause();
    return;
  }
  if (!view.stream.url) return;

  if (loadedUid !== cur.uid) {
    if (transitioningTo === cur.uid) {
      // The Mix transition already started this item on the other deck — nothing to reload.
      loadedUid = cur.uid;
      transitioningTo = null;
    } else {
      loadedUid = cur.uid;
      transitioningTo = null;
      audioEngine.load(cur.uid, view.stream.url, { music: cur.kind === 'track', positionMs: livePositionOf(view), autoplay: view.isPlaying });
    }
  } else {
    if (view.isPlaying && audioEngine.paused) void audioEngine.play();
    if (!view.isPlaying && !audioEngine.paused) audioEngine.pause();
    // Another device seeked (or we resumed elsewhere): jump if we're clearly off.
    const target = livePositionOf(view);
    if (prev && prev.version !== view.version && Math.abs(audioEngine.positionMs - target) > 2500) audioEngine.seek(target);
  }
  if (view.next?.stream.url && !transitioningTo) audioEngine.preload(view.next.uid, view.next.stream.url);
}

function tick() {
  const { view } = usePlayer.getState();
  if (!isActive(view) || !view?.current || !view.isPlaying || view.current.kind === 'ad') return;
  usePlayer.getState().setLocalPosition(audioEngine.positionMs);
  const next = view.next;
  const recipe = next?.transition;
  const duration = audioEngine.durationMs || durationOf(view.current);
  const remaining = duration - audioEngine.positionMs;
  if (next && recipe && !transitioningTo && next.stream.url && remaining > 0 && remaining <= recipe.durationMs) {
    if (audioEngine.startTransition(recipe, next.uid, next.stream.url)) {
      transitioningTo = next.uid;
      void complete(view.current.uid);
    }
  }
}

function updateMediaSession(view: PlayerView | null) {
  if (!('mediaSession' in navigator)) return;
  const item = view?.current;
  if (!item) {
    navigator.mediaSession.metadata = null;
    return;
  }
  const artwork = imageOf(item);
  navigator.mediaSession.metadata = new MediaMetadata({
    title: titleOf(item),
    artist: item.track?.artists.map((a) => a.name).join(', ') ?? item.episode?.show.title ?? item.ad?.advertiser ?? '',
    album: item.track?.album?.title ?? '',
    artwork: artwork ? [{ src: artwork, sizes: '480x480' }] : [],
  });
  navigator.mediaSession.playbackState = view?.isPlaying ? 'playing' : 'paused';
  document.title = view?.isPlaying ? `${titleOf(item)} • ${item.track?.artists.map((a) => a.name).join(', ') ?? ''}` : 'Melodify – Web Player';
}

export function startPlayerController() {
  if (started) return;
  started = true;
  const { volume, muted } = usePlayer.getState();
  audioEngine.setVolume(volume, muted);
  audioEngine.on({
    ended: (uid) => {
      if (uid === loadedUid && !transitioningTo) void complete(uid);
    },
    error: (uid) => {
      if (uid !== loadedUid) return;
      toast(i18n.language === 'vi' ? 'Không thể phát nội dung này. Đang chuyển bài…' : "Can't play this right now. Skipping…");
      window.setTimeout(() => void commands.next('skipped'), 1200);
    },
    waiting: (w) => usePlayer.getState().setBuffering(w),
  });
  usePlayer.subscribe((s, prev) => {
    if (s.view !== prev.view) {
      sync(s.view, prev.view);
      updateMediaSession(s.view);
    }
    if (s.volume !== prev.volume || s.muted !== prev.muted) audioEngine.setVolume(s.volume, s.muted);
  });
  window.setInterval(tick, 250);
  // Position heartbeat so other devices (and a later resume) stay accurate.
  window.setInterval(() => {
    const { view } = usePlayer.getState();
    if (isActive(view) && view?.isPlaying && view.current?.kind !== 'ad') {
      void put('/me/player/heartbeat', { positionMs: currentPosition() }).catch(() => {});
    }
  }, 10_000);

  // The first click/keypress anywhere unlocks Web Audio (browser autoplay policy).
  const unlock = () => {
    audioEngine.unlock();
    const { view } = usePlayer.getState();
    if (isActive(view) && view?.isPlaying && audioEngine.paused) void audioEngine.play();
  };
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });

  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => void commands.resume());
    navigator.mediaSession.setActionHandler('pause', () => void commands.pause());
    navigator.mediaSession.setActionHandler('nexttrack', () => void commands.next('skipped'));
    navigator.mediaSession.setActionHandler('previoustrack', () => void commands.previous());
    navigator.mediaSession.setActionHandler('seekto', (d) => d.seekTime != null && void commands.seek(d.seekTime * 1000));
  }
}
