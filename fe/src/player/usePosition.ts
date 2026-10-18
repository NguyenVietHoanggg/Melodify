import { useEffect, useState } from 'react';
import { currentPosition, usePlayer } from './store';

/** Re-renders a few times per second while playing and returns the live position (ms). */
export function useLivePosition(intervalMs = 250): number {
  const isPlaying = usePlayer((s) => Boolean(s.view?.isPlaying));
  // Subscribe to everything that can move the position so paused UIs update too.
  usePlayer((s) => `${s.view?.version}:${s.view?.positionMs}:${s.localPositionMs}`);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(() => tick((n) => n + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [isPlaying, intervalMs]);
  return currentPosition();
}
