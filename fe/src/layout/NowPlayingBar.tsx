import { useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { QueueItem } from '@contracts';
import { useToggleLike } from '@/api/mutations';
import { useLikedIds, useMe } from '@/api/queries';
import { Icon } from '@/components/icons/Icon';
import { ArtistLinks } from '@/components/media/Card';
import { Cover } from '@/components/media/Cover';
import { Explicit } from '@/components/media/PlayButton';
import { IconButton } from '@/components/ui/Button';
import { Slider } from '@/components/ui/Slider';
import { Tooltip } from '@/components/ui/Tooltip';
import { formatDuration } from '@/lib/format';
import { deviceId } from '@/lib/device';
import { cycleRepeat, cycleShuffle, next, previous, seek, setRemoteVolume, togglePlay } from '@/player/commands';
import { audioEngine } from '@/player/engine';
import { openMiniplayer } from '@/player/miniplayer';
import { durationOf, imageOf, usePlayer } from '@/player/store';
import { useLivePosition } from '@/player/usePosition';
import { toast } from '@/stores/toast';
import { useUi } from '@/stores/ui';
import styles from './nowplaying.module.css';

function NowPlayingWidget({ item }: { item: QueueItem | null }) {
  const { t } = useTranslation();
  const me = useMe();
  const liked = useLikedIds(Boolean(me));
  const toggleLike = useToggleLike();
  const contextUri = usePlayer((s) => s.view?.context);
  const { npvEnabled, toggleRightPanel, rightPanel } = useUi();
  if (!item) return <div className={styles.widget} />;

  if (item.kind === 'ad' && item.ad) {
    return (
      <div className={styles.widget}>
        <div className={styles.widgetCover}>
          <Cover imageUrl={item.ad.imageUrl} radius="sm" fallbackIcon="info" />
        </div>
        <div className={styles.widgetText}>
          <span className={clsx(styles.widgetTitle, 'ellipsis')}>{item.ad.title}</span>
          <span className={clsx(styles.widgetSub, 'ellipsis')}>
            {t('player.advertisement')} • {item.ad.advertiser}
          </span>
        </div>
      </div>
    );
  }

  const track = item.track;
  const episode = item.episode;
  const isLiked = track ? liked.data?.has(track.id) : false;
  const contextHref = contextUri?.type === 'playlist' && contextUri.id ? `/playlist/${contextUri.id}` : track?.album ? `/album/${track.album.id}` : episode ? `/episode/${episode.id}` : '/';
  return (
    <div className={styles.widget} data-testid="now-playing-widget">
      <div className={styles.widgetCover}>
        <Link to={contextHref} aria-label={t('player.nowPlayingView')}>
          <Cover imageUrl={imageOf(item)} radius="sm" />
        </Link>
        {!(npvEnabled && rightPanel === 'npv') && (
          <button type="button" className={styles.expandNpv} aria-label={t('player.nowPlayingView')} onClick={() => toggleRightPanel('npv')}>
            <Icon name="chevronUp" />
          </button>
        )}
      </div>
      <div className={styles.widgetText}>
        <Link to={track?.album ? `/album/${track.album.id}` : episode ? `/episode/${episode.id}` : '#'} className={clsx(styles.widgetTitle, 'ellipsis')}>
          {track?.title ?? episode?.title}
        </Link>
        <span className={clsx(styles.widgetSub, 'ellipsis')}>
          {track?.explicit && <Explicit />}
          {item.source === 'smart_shuffle' && <Icon name="sparkle" size={12} className={styles.sparkle} />}
          {track ? <ArtistLinks artists={track.artists} /> : <Link to={`/show/${episode?.show.id}`}>{episode?.show.title}</Link>}
        </span>
      </div>
      {track && me && (
        <IconButton
          icon={isLiked ? 'checkCircle' : 'addCircle'}
          label={isLiked ? t('player.removeFromLiked') : t('player.addToLiked')}
          active={isLiked}
          onClick={() => toggleLike.mutate({ ids: [track.id], liked: !isLiked })}
        />
      )}
    </div>
  );
}

export function PlayerControls() {
  const { t } = useTranslation();
  const me = useMe();
  const view = usePlayer((s) => s.view);
  const position = useLivePosition();
  const [preview, setPreview] = useState<number | null>(null);
  const item = view?.current ?? null;
  const duration = durationOf(item);
  const r = view?.restrictions;
  const shuffle = view?.shuffle ?? 'off';
  const repeat = view?.repeat ?? 'off';
  const smartAllowed = Boolean(me?.entitlements.smartShuffle);
  const shuffleLabel = shuffle === 'off' ? t('player.enableShuffle') : shuffle === 'shuffle' && smartAllowed ? t('player.enableSmartShuffle') : t('player.disableShuffle');
  const repeatLabel = repeat === 'off' ? t('player.enableRepeat') : repeat === 'context' ? t('player.enableRepeatOne') : t('player.disableRepeat');
  const disabled = !item;
  // During an ad nothing but listening is allowed (a paused ad can still be resumed, e.g. after a reload).
  const adLocked = item?.kind === 'ad' && Boolean(view?.isPlaying);

  const onNext = () => {
    if (r && !r.skipNext && r.reason !== 'ad_playing') toast(t('player.skipLimit'));
    else void next('skipped');
  };

  return (
    <div className={styles.center}>
      <div className={styles.buttons} data-testid="player-controls">
        <div className={styles.side}>
          <IconButton
            icon={shuffle === 'smart' ? 'smartShuffle' : 'shuffle'}
            label={shuffleLabel}
            active={shuffle !== 'off'}
            dot={shuffle !== 'off'}
            disabled={disabled || r?.shuffle === false}
            onClick={() => void cycleShuffle(smartAllowed)}
          />
          <IconButton icon="previous" label={t('player.previous')} disabled={disabled || r?.skipPrevious === false} onClick={() => void previous()} />
        </div>
        <Tooltip label={view?.isPlaying ? t('player.pause') : t('player.play')}>
          <button
            type="button"
            className={styles.playPause}
            aria-label={view?.isPlaying ? t('player.pause') : t('player.play')}
            disabled={disabled || adLocked}
            onClick={() => void togglePlay()}
            data-testid="control-button-playpause"
          >
            <Icon name={view?.isPlaying ? 'pause' : 'play'} />
          </button>
        </Tooltip>
        <div className={styles.side}>
          <IconButton icon="next" label={t('player.next')} disabled={disabled || adLocked} onClick={onNext} />
          <IconButton
            icon={repeat === 'track' ? 'repeatOne' : 'repeat'}
            label={repeatLabel}
            active={repeat !== 'off'}
            dot={repeat !== 'off'}
            disabled={disabled || r?.repeat === false}
            onClick={() => void cycleRepeat()}
          />
        </div>
      </div>
      <div className={styles.progress}>
        {/* Nothing loaded (or the song was removed): Spotify shows -:-- instead of a stale position. */}
        <span className={styles.time}>{item ? formatDuration(preview ?? position) : '-:--'}</span>
        <Slider
          value={item ? Math.min(preview ?? position, duration) : 0}
          max={duration || 1}
          label={t('player.progress')}
          valueText={formatDuration(position)}
          disabled={disabled || r?.seek === false}
          step={5000}
          onChange={setPreview}
          onCommit={(v) => {
            setPreview(null);
            void seek(Math.round(v));
          }}
        />
        <span className={styles.time}>{item ? formatDuration(duration) : '-:--'}</span>
      </div>
    </div>
  );
}

function VolumeControl() {
  const { t } = useTranslation();
  const { volume, muted, setVolume, setMuted } = usePlayer();
  const view = usePlayer((s) => s.view);
  const remote = view?.activeDeviceId && view.activeDeviceId !== deviceId ? view.devices.find((d) => d.id === view.activeDeviceId) : null;
  const shown = remote ? remote.volume : muted ? 0 : volume;
  const icon = shown === 0 ? 'volumeOff' : shown < 0.34 ? 'volumeLow' : shown < 0.67 ? 'volumeMedium' : 'volumeHigh';
  const apply = (v: number) => {
    if (remote) void setRemoteVolume(remote.id, v);
    else {
      setVolume(v);
      audioEngine.setVolume(v, false);
    }
  };
  return (
    <div className={styles.volume}>
      <IconButton
        icon={icon}
        label={shown === 0 ? t('player.unmute') : t('player.mute')}
        onClick={() => {
          if (remote) return apply(remote.volume === 0 ? 0.8 : 0);
          setMuted(!muted);
          audioEngine.setVolume(volume, !muted);
        }}
        data-testid="volume-bar-toggle-mute-button"
      />
      <Slider value={shown} max={1} step={0.05} label={t('player.volume')} onChange={(v) => !remote && audioEngine.setVolume(v, false)} onCommit={apply} className={styles.volumeSlider} />
    </div>
  );
}

function RightControls() {
  const { t } = useTranslation();
  const { rightPanel, toggleRightPanel, fullscreen, setFullscreen } = useUi();
  const view = usePlayer((s) => s.view);
  const onLyrics = location.pathname === '/lyrics';
  const otherDevice = view?.activeDeviceId && view.activeDeviceId !== deviceId;
  if (fullscreen) {
    // Full screen covers the side panels, so only what still makes sense stays: volume and the way out.
    return (
      <div className={styles.right}>
        <VolumeControl />
        <IconButton icon="exitFullscreen" label={t('player.exitFullscreen')} onClick={() => setFullscreen(false)} />
      </div>
    );
  }
  return (
    <div className={styles.right}>
      <IconButton icon="nowPlayingView" label={t('player.nowPlayingView')} active={rightPanel === 'npv'} onClick={() => toggleRightPanel('npv')} />
      <Link to={onLyrics ? '/' : '/lyrics'} aria-label={t('player.lyrics')} onClick={(e) => onLyrics && (e.preventDefault(), history.back())}>
        <IconButton icon="lyrics" label={t('player.lyrics')} active={onLyrics} dot={onLyrics} tabIndex={-1} />
      </Link>
      <IconButton icon="queue" label={t('player.queue')} active={rightPanel === 'queue'} dot={rightPanel === 'queue'} onClick={() => toggleRightPanel('queue')} />
      <IconButton icon="devices" label={t('player.connect')} active={rightPanel === 'devices' || Boolean(otherDevice)} dot={rightPanel === 'devices'} onClick={() => toggleRightPanel('devices')} />
      <VolumeControl />
      <IconButton icon="miniplayer" label={t('player.miniplayer')} onClick={() => void openMiniplayer()} />
      <IconButton icon="fullscreen" label={t('player.fullscreen')} onClick={() => setFullscreen(true)} />
    </div>
  );
}

export function NowPlayingBar() {
  const { t } = useTranslation();
  const view = usePlayer((s) => s.view);
  const item = view?.current ?? null;
  const remoteDevice = view?.activeDeviceId && view.activeDeviceId !== deviceId ? view.devices.find((d) => d.id === view.activeDeviceId) : null;
  return (
    <footer className={styles.wrap}>
      <div className={styles.bar} data-testid="now-playing-bar">
        <NowPlayingWidget item={item} />
        <PlayerControls />
        <RightControls />
      </div>
      {remoteDevice && (
        <div className={styles.remote}>
          <Icon name="devices" size={14} />
          {t('player.listeningOn', { device: remoteDevice.name })}
        </div>
      )}
    </footer>
  );
}
