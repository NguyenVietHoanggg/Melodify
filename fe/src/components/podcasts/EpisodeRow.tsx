/**
 * One podcast episode in a list (show page, Your Episodes, What's New, search):
 *   [cover] title / show / 2-line description
 *           date • length (or progress bar + "12 min left")      [+] […] [▶]
 */
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import type { ContextType, Episode } from '@contracts';
import { useEpisodeProgress, useToggleSavedEpisode } from '@/api/mutations';
import { useMe } from '@/api/queries';
import { Icon } from '@/components/icons/Icon';
import { Cover } from '@/components/media/Cover';
import { Explicit } from '@/components/media/PlayButton';
import { DropdownMenu, type MenuEntry } from '@/components/ui/Menu';
import { Tooltip } from '@/components/ui/Tooltip';
import { formatEpisodeLength, formatShortDate } from '@/lib/format';
import { addToQueue, pause, playContext, resume } from '@/player/commands';
import { usePlayer } from '@/player/store';
import { toast } from '@/stores/toast';
import styles from './episode.module.css';

interface EpisodeRowProps {
  episode: Episode;
  /** Show the show's name under the title (lists that mix shows). */
  showShow?: boolean;
  /** What "play" starts: the show (so the next episodes follow) or just this episode. */
  context?: { type: ContextType; id: string };
}

export function EpisodeRow({ episode: e, showShow, context }: EpisodeRowProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'vi' ? 'vi' : 'en';
  const navigate = useNavigate();
  const me = useMe();
  const save = useToggleSavedEpisode();
  const progress = useEpisodeProgress();
  const isCurrent = usePlayer((s) => s.view?.current?.episode?.id === e.id);
  const playing = usePlayer((s) => Boolean(s.view?.isPlaying));
  const active = isCurrent && playing;

  const play = () => {
    if (isCurrent) void (playing ? pause() : resume());
    else void playContext({ context: context ?? { type: 'episode', id: e.id }, offset: context ? { trackId: e.id } : undefined, promptImage: e.imageUrl });
  };

  const done = e.progress?.completed ?? false;
  const started = !done && (e.progress?.positionMs ?? 0) > 0;
  const pct = started ? Math.min(100, (e.progress!.positionMs / Math.max(1, e.durationMs)) * 100) : 0;
  const date = e.releaseDate ? formatShortDate(e.releaseDate, lang) : '';

  const menu: MenuEntry[] = [
    ...(me
      ? ([
          { label: t('menu.addToQueue'), icon: 'queue', onSelect: () => void addToQueue([{ kind: 'episode', id: e.id }]) },
          { label: e.isSaved ? t('podcast.unsave') : t('podcast.save'), icon: e.isSaved ? 'checkCircle' : 'addCircle', onSelect: () => save.mutate({ id: e.id, saved: !e.isSaved }) },
          { label: done ? t('podcast.markUnplayed') : t('podcast.markPlayed'), icon: 'check', onSelect: () => progress.mutate({ id: e.id, completed: !done }) },
          { kind: 'separator' },
        ] as MenuEntry[])
      : []),
    { label: t('podcast.goToShow'), icon: 'podcast', onSelect: () => navigate(`/show/${e.show.id}`) },
    { label: t('menu.copyLink'), icon: 'link', onSelect: () => void navigator.clipboard.writeText(`${location.origin}/episode/${e.id}`).then(() => toast(t('actions.linkCopied'))) },
  ];

  return (
    <div className={clsx(styles.row, isCurrent && styles.current)} onClick={() => navigate(`/episode/${e.id}`)} role="group" aria-label={e.title}>
      <div className={styles.cover}>
        <Cover imageUrl={e.imageUrl} radius="lg" fallbackIcon="podcast" />
      </div>
      <div className={styles.body}>
        <Link to={`/episode/${e.id}`} className={clsx(styles.title, 'clamp-2')} onClick={(ev) => ev.stopPropagation()}>
          {e.title}
        </Link>
        {showShow && (
          <Link to={`/show/${e.show.id}`} className={clsx(styles.show, 'ellipsis')} onClick={(ev) => ev.stopPropagation()}>
            {e.show.title}
          </Link>
        )}
        {e.description && <p className={clsx(styles.description, 'clamp-2')}>{e.description}</p>}
        <div className={styles.footer}>
          <div className={styles.meta}>
            {e.explicit && <Explicit />}
            {done ? (
              <span className={styles.played}>
                <Icon name="checkCircle" size={16} /> {t('podcast.played')}
              </span>
            ) : null}
            {date && <span>{date}</span>}
            {date && <span aria-hidden>•</span>}
            {started ? (
              <>
                <span>{t('podcast.left', { time: formatEpisodeLength(e.durationMs - e.progress!.positionMs, lang) })}</span>
                <span className={styles.progress} aria-hidden>
                  <span style={{ width: `${pct}%` }} />
                </span>
              </>
            ) : (
              <span>{formatEpisodeLength(e.durationMs, lang)}</span>
            )}
          </div>
          <div className={styles.actions} onClick={(ev) => ev.stopPropagation()}>
            {me && (
              <Tooltip label={e.isSaved ? t('podcast.unsave') : t('podcast.save')}>
                <button type="button" className={clsx(styles.iconBtn, e.isSaved && styles.on)} onClick={() => save.mutate({ id: e.id, saved: !e.isSaved })} aria-label={e.isSaved ? t('podcast.unsave') : t('podcast.save')}>
                  <Icon name={e.isSaved ? 'checkCircle' : 'addCircle'} size={24} />
                </button>
              </Tooltip>
            )}
            <DropdownMenu
              entries={menu}
              trigger={
                <button type="button" className={styles.iconBtn} aria-label={t('actions.moreOptions', { name: e.title })}>
                  <Icon name="more" size={24} />
                </button>
              }
            />
            <button type="button" className={styles.play} onClick={play} aria-label={active ? t('actions.pauseName', { name: e.title }) : t('actions.playName', { name: e.title })}>
              <Icon name={active ? 'pause' : 'play'} size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
