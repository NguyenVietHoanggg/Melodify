import { useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { EntityType, Track } from '@contracts';
import { useToggleLike } from '@/api/mutations';
import { useFriendActivity, useLikedIds, useMe } from '@/api/queries';
import { Icon, type IconName } from '@/components/icons/Icon';
import { ArtistLinks } from '@/components/media/Card';
import { Cover } from '@/components/media/Cover';
import { Button, IconButton } from '@/components/ui/Button';
import { BRAND } from '@/config/brand';
import { deviceId } from '@/lib/device';
import { hrefOf } from '@/lib/links';
import { clearQueue, transferTo } from '@/player/commands';
import { usePlayer } from '@/player/store';
import { useDialogs } from '@/stores/dialogs';
import { useUi } from '@/stores/ui';
import layout from './layout.module.css';
import { AboutArtist } from './right/ArtistAbout';
import { QueueRow } from './right/QueueRow';
import styles from './right/right.module.css';

function PanelHeader({ title, onClose, extra }: { title: React.ReactNode; onClose: () => void; extra?: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <header className={styles.header}>
      <h2 className={clsx(styles.headerTitle, 'ellipsis')}>{title}</h2>
      <div className={styles.headerActions}>
        {extra}
        <IconButton icon="close" label={t('loggedOut.close')} onClick={onClose} />
      </div>
    </header>
  );
}

function NowPlayingPanel() {
  const { t } = useTranslation();
  const me = useMe();
  const view = usePlayer((s) => s.view);
  const liked = useLikedIds(Boolean(me));
  const toggleLike = useToggleLike();
  const setRightPanel = useUi((s) => s.setRightPanel);
  const item = view?.current;
  if (!item) return null;

  if (item.kind === 'ad' && item.ad) {
    const ad = item.ad;
    return (
      <>
        <PanelHeader title={t('player.advertisement')} onClose={() => setRightPanel(null)} />
        <div className={clsx('scroll', styles.body)}>
          <section className={styles.adCard} style={{ background: ad.bgColor ?? '#1e3264' }}>
            <span className={styles.adBadge}>{t('player.advertisement')}</span>
            <h3>{ad.title}</h3>
            {ad.body && <p>{ad.body}</p>}
            {ad.clickUrl && (
              <a href={ad.clickUrl}>
                <Button variant="white" size="sm">{ad.ctaLabel ?? t('player.learnMore')}</Button>
              </a>
            )}
            <span className={styles.adBy}>{ad.advertiser}</span>
          </section>
        </div>
      </>
    );
  }

  const track: Track | undefined = item.track;
  const isLiked = track ? liked.data?.has(track.id) : false;
  const next = view?.queue[0] ?? view?.upcoming[0];
  const contextName = view?.context?.name ?? (view?.context?.type === 'collection' ? t('library.likedSongs') : track?.album?.title);
  return (
    <>
      <PanelHeader title={contextName} onClose={() => setRightPanel(null)} />
      <div className={clsx('scroll', styles.body)}>
        <div className={styles.bigCover}>
          <Cover imageUrl={track?.album?.coverUrl ?? item.episode?.imageUrl} radius="md" eager />
        </div>
        <div className={styles.titleRow}>
          <div className={styles.titleText}>
            <Link to={track?.album ? `/album/${track.album.id}` : `/episode/${item.episode?.id}`} className={clsx(styles.trackTitle, 'ellipsis')}>
              {track?.title ?? item.episode?.title}
            </Link>
            <span className={clsx(styles.muted, 'ellipsis')}>
              {track ? <ArtistLinks artists={track.artists} /> : <Link to={`/show/${item.episode?.show.id}`}>{item.episode?.show.title}</Link>}
            </span>
          </div>
          {track && me && (
            <IconButton
              icon={isLiked ? 'checkCircle' : 'addCircle'}
              label={isLiked ? t('player.removeFromLiked') : t('player.addToLiked')}
              active={isLiked}
              size={20}
              onClick={() => toggleLike.mutate({ ids: [track.id], liked: !isLiked })}
            />
          )}
        </div>
        {track && (track.features.bpm || track.features.key) && (
          <div className={styles.features}>
            {track.features.bpm && <span>{track.features.bpm} BPM</span>}
            {track.features.key && <span>{track.features.key} · {track.features.camelot}</span>}
            {track.genre && <span>{t(`genres.${track.genre}`, { defaultValue: track.genre })}</span>}
          </div>
        )}
        {track?.artists[0] && <AboutArtist artistId={track.artists[0].id} />}
        {track && (
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h3>{t('npv.credits')}</h3>
              <button type="button" className={styles.link} onClick={() => useDialogs.getState().openCredits(track.id)}>
                {t('npv.showAll')}
              </button>
            </div>
            <div className={styles.cardBody}>
              {track.artists.map((a) => (
                <div key={a.id} className={styles.creditRow}>
                  <Link to={`/artist/${a.id}`}>{a.name}</Link>
                  <span className={styles.muted}>{t('npv.mainArtist')}</span>
                </div>
              ))}
            </div>
          </section>
        )}
        {next && (
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h3>{t('npv.nextInQueue')}</h3>
              <button type="button" className={styles.link} onClick={() => setRightPanel('queue')}>
                {t('npv.openQueue')}
              </button>
            </div>
            <div className={styles.cardQueue}>
              <QueueRow item={next} />
            </div>
          </section>
        )}
      </div>
    </>
  );
}

function QueuePanel() {
  const { t } = useTranslation();
  const view = usePlayer((s) => s.view);
  const setRightPanel = useUi((s) => s.setRightPanel);
  const [tab, setTab] = useState<'queue' | 'recent'>('queue');
  const contextName = view?.context?.name ?? (view?.context?.type === 'collection' ? t('library.likedSongs') : '');
  const autoplay = view?.upcoming[0]?.source === 'autoplay';
  return (
    <>
      <PanelHeader
        title={
          <span className={styles.tabs}>
            <button type="button" aria-pressed={tab === 'queue'} onClick={() => setTab('queue')}>{t('queue.title')}</button>
            <button type="button" aria-pressed={tab === 'recent'} onClick={() => setTab('recent')}>{t('queue.recentlyPlayed')}</button>
          </span>
        }
        onClose={() => setRightPanel(null)}
      />
      <div className={clsx('scroll', styles.body)}>
        {tab === 'recent' ? (
          view?.history.length ? (
            view.history.map((q) => <QueueRow key={q.uid} item={q} />)
          ) : (
            <p className={styles.empty}>{t('queue.nothingPlayed')}</p>
          )
        ) : (
          <>
            {view?.current && (
              <>
                <h3 className={styles.sectionTitle}>{t('queue.nowPlaying')}</h3>
                <QueueRow item={view.current} current playing={view.isPlaying} />
              </>
            )}
            {view && view.queue.length > 0 && (
              <>
                <div className={styles.sectionRow}>
                  <h3 className={styles.sectionTitle}>{t('queue.nextInQueue')}</h3>
                  <button type="button" className={styles.link} onClick={() => void clearQueue()}>{t('queue.clear')}</button>
                </div>
                {view.queue.map((q) => <QueueRow key={q.uid} item={q} removable />)}
              </>
            )}
            {view && view.upcoming.length > 0 && (
              <>
                <h3 className={styles.sectionTitle}>
                  {t('queue.nextFrom', { name: autoplay ? `${t('player.autoplay')} – ${t('player.autoplayContext')}` : contextName })}
                </h3>
                {view.upcoming.map((q) => <QueueRow key={q.uid} item={q} removable />)}
              </>
            )}
            {!view?.current && <p className={styles.empty}>{t('queue.emptyBody')}</p>}
          </>
        )}
      </div>
    </>
  );
}

const DEVICE_ICON: Record<string, IconName> = { computer: 'laptop', web: 'laptop', smartphone: 'smartphone', tablet: 'smartphone', speaker: 'speaker', tv: 'tv' };

function DevicesPanel() {
  const { t } = useTranslation();
  const view = usePlayer((s) => s.view);
  const setRightPanel = useUi((s) => s.setRightPanel);
  const devices = view?.devices ?? [];
  const me = devices.find((d) => d.id === deviceId);
  const others = devices.filter((d) => d.id !== deviceId);
  const activeIsMe = !view?.activeDeviceId || view.activeDeviceId === deviceId;
  return (
    <>
      <PanelHeader title={t('devices.title')} onClose={() => setRightPanel(null)} />
      <div className={clsx('scroll', styles.body)}>
        <button type="button" className={clsx(styles.device, activeIsMe && styles.deviceActive)} onClick={() => !activeIsMe && void transferTo(deviceId, true)}>
          <Icon name="laptop" size={24} />
          <span>
            <strong>{t('devices.thisBrowser')}</strong>
            {me && <small>{me.name}</small>}
          </span>
        </button>
        {others.length > 0 ? (
          <>
            <h3 className={styles.sectionTitle}>{t('devices.selectAnother')}</h3>
            {others.map((d) => (
              <button key={d.id} type="button" className={clsx(styles.device, d.isActive && styles.deviceActive)} onClick={() => void transferTo(d.id, true)}>
                <Icon name={DEVICE_ICON[d.type] ?? 'laptop'} size={24} />
                <span>
                  <strong>{d.name}</strong>
                  {d.isActive && <small>{t('devices.listening')}</small>}
                </span>
              </button>
            ))}
          </>
        ) : (
          <div className={styles.noDevices}>
            <h3>{t('devices.noOther')}</h3>
            <p className={styles.muted}>{t('devices.noOtherBody', { app: BRAND.name })}</p>
          </div>
        )}
      </div>
    </>
  );
}

function FriendsPanel() {
  const { t, i18n } = useTranslation();
  const setRightPanel = useUi((s) => s.setRightPanel);
  const { data } = useFriendActivity(true);
  const ago = (iso: string) => {
    const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (min < 60) return `${Math.max(1, min)} ${t('time.min')}`;
    if (min < 60 * 24) return `${Math.round(min / 60)} ${t('time.hr')}`;
    return new Intl.DateTimeFormat(i18n.language === 'vi' ? 'vi-VN' : 'en-US', { day: 'numeric', month: 'short' }).format(new Date(iso));
  };
  return (
    <>
      <PanelHeader title={t('nav.friendActivity')} onClose={() => setRightPanel(null)} />
      <div className={clsx('scroll', styles.body)}>
        {data?.items.length ? (
          data.items.map((f) => (
            <div key={f.user.id} className={styles.friend}>
              <Link to={`/user/${f.user.id}`} className={styles.friendAvatar}>
                <Cover imageUrl={f.user.avatarUrl} round fallbackIcon="user" />
              </Link>
              <div className={styles.friendText}>
                <div className={styles.friendTop}>
                  <Link to={`/user/${f.user.id}`} className="ellipsis">{f.user.displayName}</Link>
                  {f.isNow ? (
                    <span className="eq-bars" role="img" aria-label={t('devices.listening')}>
                      <i />
                      <i />
                      <i />
                    </span>
                  ) : (
                    <span className={styles.muted}>{ago(f.at)}</span>
                  )}
                </div>
                <span className="ellipsis">
                  <Link to={`/track/${f.track.id}`}>{f.track.title}</Link> • <ArtistLinks artists={f.track.artists} />
                </span>
                {f.context && f.context.id && (
                  <Link to={hrefOf(f.context.type === 'collection' ? 'collection' : (f.context.type as EntityType), f.context.id)} className={clsx(styles.muted, styles.friendContext, 'ellipsis')}>
                    <Icon name={f.context.type === 'artist' ? 'user' : f.context.type === 'album' ? 'note' : f.context.type === 'show' ? 'podcast' : 'playlistAdd'} size={12} />
                    {f.context.name ?? t('library.likedSongs')}
                  </Link>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className={styles.noDevices}>
            <h3>{i18n.language === 'vi' ? 'Hoạt động của bạn bè sẽ hiện ở đây' : 'Friend activity shows up here'}</h3>
            <p className={styles.muted}>
              {i18n.language === 'vi'
                ? `Theo dõi bạn bè trên ${BRAND.name} để xem họ đang nghe gì.`
                : `Follow friends on ${BRAND.name} to see what they're listening to.`}
            </p>
          </div>
        )}
      </div>
    </>
  );
}

export function RightSidebar() {
  const panel = useUi((s) => s.rightPanel);
  return (
    <aside className={clsx(layout.panel, layout.right, styles.panel)} aria-label="Now playing">
      {panel === 'queue' ? <QueuePanel /> : panel === 'devices' ? <DevicesPanel /> : panel === 'friends' ? <FriendsPanel /> : <NowPlayingPanel />}
    </aside>
  );
}

