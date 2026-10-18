import { useEffect, useRef, type CSSProperties } from 'react';
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Dialog';
import { get } from '@/lib/api';
import { useMainScroll } from '@/layout/MainView';
import { seek } from '@/player/commands';
import { usePlayer } from '@/player/store';
import { useLivePosition } from '@/player/usePosition';
import page from '../page.module.css';
import styles from './lyrics.module.css';

interface LyricsLine {
  t?: number;
  text: string;
}
interface Lyrics {
  kind: 'synced' | 'plain' | 'none';
  lines: LyricsLine[];
  provider: string | null;
  color: string | null;
}

export const useLyrics = (trackId: string | null | undefined) =>
  useQuery({ queryKey: ['lyrics', trackId], queryFn: () => get<Lyrics>(`/tracks/${trackId}/lyrics`), enabled: Boolean(trackId), staleTime: 60 * 60_000 });

/** Static lyrics block (track page). */
export function LyricsBlock({ trackId, compact }: { trackId: string; compact?: boolean }) {
  const { t } = useTranslation();
  const { data } = useLyrics(trackId);
  if (!data || data.kind === 'none') return null;
  return (
    <section className={clsx(styles.block, compact && styles.blockCompact)}>
      <h2>{t('lyrics.title')}</h2>
      {data.lines.slice(0, compact ? 24 : undefined).map((l, i) => (
        <p key={i}>{l.text || '♪'}</p>
      ))}
      {data.provider && <small>{t('lyrics.provider', { provider: data.provider })}</small>}
    </section>
  );
}

/** Full lyrics view for whatever is playing — synced lines light up and auto-scroll; click a line to seek. */
export function LyricsPage() {
  const { t } = useTranslation();
  const item = usePlayer((s) => s.view?.current ?? null);
  const track = item?.track;
  const { data, isLoading } = useLyrics(track?.id);
  const position = useLivePosition(100);
  const scroller = useMainScroll();
  const lines = useRef<(HTMLParagraphElement | null)[]>([]);
  const userScrolledAt = useRef(0);

  const synced = data?.kind === 'synced';
  let active = -1;
  if (synced && data) {
    for (let i = 0; i < data.lines.length; i++) if ((data.lines[i]!.t ?? 0) <= position + 250) active = i;
  }

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = () => (userScrolledAt.current = Date.now());
    el.addEventListener('wheel', onWheel, { passive: true });
    return () => el.removeEventListener('wheel', onWheel);
  }, [scroller]);

  useEffect(() => {
    // Don't yank the view back while the user is reading elsewhere.
    if (active < 0 || Date.now() - userScrolledAt.current < 4000) return;
    lines.current[active]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [active]);

  const color = data?.color ?? '#3d3d3d';
  const style = { '--lyrics-bg': color } as CSSProperties;

  if (!track) {
    return (
      <div className={page.empty}>
        <h2>{t('lyrics.title')}</h2>
        <p className={page.muted}>{t('queue.emptyBody')}</p>
      </div>
    );
  }
  return (
    <div className={styles.page} style={style}>
      {isLoading ? (
        <div className={page.centered}><Spinner /></div>
      ) : !data || data.kind === 'none' ? (
        <div className={styles.none}>
          <h2>{t('lyrics.unavailable')}</h2>
          <p>{t('lyrics.unavailableBody')}</p>
          <Link to={track.album ? `/album/${track.album.id}` : '/'}>
            <Button variant="white" size="sm">{track.title}</Button>
          </Link>
        </div>
      ) : (
        <div className={styles.lines}>
          {!synced && <p className={styles.notice}>{t('lyrics.notSynced')}</p>}
          {data.lines.map((l, i) => (
            <p
              key={i}
              ref={(el) => {
                lines.current[i] = el;
              }}
              className={clsx(styles.line, synced && i < active && styles.past, synced && i === active && styles.active, !synced && styles.static)}
              onClick={() => synced && l.t != null && void seek(l.t)}
            >
              {l.text || '♪'}
            </p>
          ))}
          {data.provider && <p className={styles.provider}>{t('lyrics.provider', { provider: data.provider })}</p>}
        </div>
      )}
    </div>
  );
}
