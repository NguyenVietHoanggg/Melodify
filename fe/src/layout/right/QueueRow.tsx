import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import type { QueueItem } from '@contracts';
import { Icon } from '@/components/icons/Icon';
import { ArtistLinks } from '@/components/media/Card';
import { Cover } from '@/components/media/Cover';
import { Explicit } from '@/components/media/PlayButton';
import { DropdownMenu } from '@/components/ui/Menu';
import { useTrackMenu } from '@/components/tracks/useTrackMenu';
import { playQueueItem, removeFromQueue } from '@/player/commands';
import { imageOf, titleOf } from '@/player/store';
import styles from './right.module.css';

/** One row in the queue panel / "Next in queue" card. Clicking jumps straight to it. */
export function QueueRow({ item, current, playing, removable }: { item: QueueItem; current?: boolean; playing?: boolean; removable?: boolean }) {
  const { t } = useTranslation();
  const trackMenu = useTrackMenu();
  const track = item.track;
  const menu = track
    ? [
        ...(removable ? [{ label: t('menu.removeFromQueue'), icon: 'close' as const, onSelect: () => void removeFromQueue([item.uid]) }, { kind: 'separator' as const }] : []),
        ...trackMenu(track, {}),
      ]
    : [];
  return (
    <div className={clsx(styles.qrow, current && styles.qcurrent)} onClick={() => !current && void playQueueItem(item.uid)} role="button" tabIndex={0}>
      <div className={styles.qcover}>
        <Cover imageUrl={imageOf(item)} radius="sm" />
        {!current && (
          <span className={styles.qplay}>
            <Icon name="play" />
          </span>
        )}
        {current && playing && (
          <span className={styles.qplay} style={{ opacity: 1, background: 'rgb(0 0 0 / 50%)' }}>
            <span className="eq-bars" aria-hidden>
              <i />
              <i />
              <i />
            </span>
          </span>
        )}
      </div>
      <div className={styles.qtext}>
        <span className={clsx(styles.qtitle, 'ellipsis')}>{titleOf(item)}</span>
        <span className={clsx(styles.qsub, 'ellipsis')}>
          {item.source === 'smart_shuffle' && <Icon name="sparkle" size={12} className={styles.sparkle} />}
          {track?.explicit && <Explicit />}
          {track ? <ArtistLinks artists={track.artists} /> : item.episode?.show.title ?? item.ad?.advertiser}
        </span>
      </div>
      {track && (
        <span onClick={(e) => e.stopPropagation()}>
          <DropdownMenu
            align="end"
            entries={menu}
            trigger={
              <button type="button" className={styles.qmore} aria-label={t('actions.moreOptions', { name: track.title })}>
                <Icon name="more" />
              </button>
            }
          />
        </span>
      )}
    </div>
  );
}
