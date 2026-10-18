/** Keyboard shortcuts (same keys as Spotify's web player where possible). */
import * as commands from './commands';
import { usePlayer } from './store';
import { audioEngine } from './engine';

const typing = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)));
};

/** `action` is an i18n key under "shortcuts." (the Shortcuts dialog translates it). */
export const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'Space', action: 'playPause' },
  { keys: 'Ctrl + →', action: 'next' },
  { keys: 'Ctrl + ←', action: 'previous' },
  { keys: 'Shift + →', action: 'seekForward' },
  { keys: 'Shift + ←', action: 'seekBackward' },
  { keys: 'Ctrl + ↑ / ↓', action: 'volume' },
  { keys: 'Ctrl + S', action: 'shuffle' },
  { keys: 'Ctrl + R', action: 'repeat' },
  { keys: 'Ctrl + M', action: 'mute' },
  { keys: 'Ctrl + K', action: 'search' },
];

export function registerShortcuts(smartAllowed: () => boolean) {
  window.addEventListener('keydown', (e) => {
    if (typing(e) || e.altKey) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const s = usePlayer.getState();
    const set = (v: number) => {
      s.setVolume(v);
      audioEngine.setVolume(v, false);
    };
    if (e.code === 'Space' && !ctrl) {
      e.preventDefault();
      void commands.togglePlay();
    } else if (ctrl && e.key === 'ArrowRight') {
      e.preventDefault();
      void commands.next('skipped');
    } else if (ctrl && e.key === 'ArrowLeft') {
      e.preventDefault();
      void commands.previous();
    } else if (e.shiftKey && !ctrl && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      const pos = s.localPositionMs ?? s.view?.positionMs ?? 0;
      void commands.seek(Math.max(0, pos + (e.key === 'ArrowRight' ? 5000 : -5000)));
    } else if (ctrl && e.key === 'ArrowUp') {
      e.preventDefault();
      set(Math.min(1, s.volume + 0.1));
    } else if (ctrl && e.key === 'ArrowDown') {
      e.preventDefault();
      set(Math.max(0, s.volume - 0.1));
    } else if (ctrl && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void commands.cycleShuffle(smartAllowed());
    } else if (ctrl && e.key.toLowerCase() === 'r') {
      e.preventDefault();
      void commands.cycleRepeat();
    } else if (ctrl && e.key.toLowerCase() === 'm') {
      e.preventDefault();
      s.setMuted(!s.muted);
    }
  });
}
