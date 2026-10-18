/**
 * Phone layout player: a slim "mini player" above the tab bar (cover, title, like, play/pause and a thin
 * progress line). Tapping it opens the full-screen player: big artwork, all the controls, then the artist
 * card underneath — the same structure as Spotify's mobile app.
 */
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useToggleLike } from '@/api/mutations';
import { useLikedIds, useMe } from '@/api/queries';
import { Icon } from '@/components/icons/Icon';
import { ArtistLinks } from '@/components/media/Card';
import { Cover } from '@/components/media/Cover';
import { IconButton } from '@/components/ui/Button';
import { togglePlay } from '@/player/commands';
import { durationOf, imageOf, titleOf, usePlayer } from '@/player/store';
import { useLivePosition } from '@/player/usePosition';
import { useUi } from '@/stores/ui';
import { PlayerControls } from './NowPlayingBar';
import { AboutArtist } from './right/ArtistAbout';
import styles from './mobile.module.css';

function LikeButton({ trackId }: { trackId: string }) {
  const { t } = useTranslation();
  const me = useMe();
  const liked = useLikedIds(Boolean(me));
  const toggle = useToggleLike();
  const isLiked = liked.data?.has(trackId) ?? false;
  return (
    <IconButton
      icon={isLiked ? 'checkCircle' : 'addCircle'}
      label={isLiked ? t('player.removeFromLiked') : t('player.addToLiked')}
      active={isLiked}
      onClick={(e) => {
        e.stopPropagation();
        toggle.mutate({ ids: [trackId], liked: !isLiked });
      }}
    />
  );
}

export function MobilePlayer() {
  const { t } = useTranslation();
  const view = usePlayer((s) => s.view);
  const item = view?.current ?? null;
  const position = useLivePosition();
  const [open, setOpen] = useState(false);
  const setRightPanel = useUi((s) => s.setRightPanel);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open]);

  if (!item) return null;
  const track = item.track;
  const isAd = item.kind === 'ad';
  const adLocked = isAd && Boolean(view?.isPlaying);
  const duration = durationOf(item);
  const progress = duration ? Math.min(1, position / duration) : 0;
  const subtitle = track ? <ArtistLinks artists={track.artists} /> : isAd ? `${t('player.advertisement')} • ${item.ad?.advertiser ?? ''}` : item.episode?.show.title;

  return (
    <>
      <div
        className={styles.mini}
        role="button"
        tabIndex={0}
        aria-label={t('player.nowPlayingView')}
        // A tap opens the full player — except on an artist link, which goes to the artist.
        onClick={(e) => !(e.target as HTMLElement).closest('a') && setOpen(true)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget && (e.preventDefault(), setOpen(true))}
        data-testid="mini-player"
      >
        <div className={styles.miniCover}>
          <Cover imageUrl={imageOf(item)} radius="sm" />
        </div>
        <div className={styles.miniText}>
          <span className={clsx(styles.miniTitle, 'ellipsis')}>{titleOf(item)}</span>
          <span className={clsx(styles.miniSub, 'ellipsis')}>{subtitle}</span>
        </div>
        {track && <LikeButton trackId={track.id} />}
        <button
          type="button"
          className={styles.miniPlay}
          aria-label={view?.isPlaying ? t('player.pause') : t('player.play')}
          disabled={adLocked}
          onClick={(e) => {
            e.stopPropagation();
            void togglePlay();
          }}
        >
          <Icon name={view?.isPlaying ? 'pause' : 'play'} size={24} />
        </button>
        <span className={styles.miniProgress} style={{ transform: `scaleX(${progress})` }} aria-hidden />
      </div>

      {open && (
        <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={t('player.nowPlayingView')}>
          {imageOf(item) && <img className={styles.sheetBackdrop} src={imageOf(item)!} alt="" />}
          <div className={clsx('scroll', styles.sheetScroll)}>
            <header className={styles.sheetHeader}>
              <IconButton icon="chevronDown" label={t('loggedOut.close')} onClick={() => setOpen(false)} />
              <span className={clsx(styles.sheetContext, 'ellipsis')}>{view?.context?.name ?? ''}</span>
              <span className={styles.sheetSpacer} />
            </header>
            <div className={styles.sheetCover}>
              <Cover imageUrl={imageOf(item)} radius="lg" eager />
            </div>
            <div className={styles.sheetTitleRow}>
              <div className={styles.sheetTitleText}>
                <h2 className="ellipsis">{titleOf(item)}</h2>
                <p className="ellipsis">{subtitle}</p>
              </div>
              {track && <LikeButton trackId={track.id} />}
            </div>
            <div className={styles.sheetControls}>
              <PlayerControls />
            </div>
            <div className={styles.sheetActions}>
              <IconButton icon="devices" label={t('player.connect')} onClick={() => setRightPanel('devices')} />
              <Link to="/lyrics" className={styles.sheetLink} aria-label={t('player.lyrics')} onClick={() => setOpen(false)}>
                <Icon name="lyrics" />
              </Link>
              <IconButton icon="queue" label={t('player.queue')} onClick={() => setRightPanel('queue')} />
            </div>
            {track?.artists[0] && (
              <div className={styles.sheetExtra}>
                <AboutArtist artistId={track.artists[0].id} />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
