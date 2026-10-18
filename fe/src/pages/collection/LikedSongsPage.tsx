import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useLikedTracks, useMe } from '@/api/queries';
import { ActionBar, EntityBody, EntityHeader, MetaDot } from '@/components/entity/EntityHeader';
import { StickyBar } from '@/components/entity/StickyBar';
import entity from '@/components/entity/entity.module.css';
import { Icon } from '@/components/icons/Icon';
import { PageFooter } from '@/components/layout/PageFooter';
import { Cover } from '@/components/media/Cover';
import { PlayButton } from '@/components/media/PlayButton';
import { TrackList } from '@/components/tracks/TrackList';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Dialog';
import { Tooltip } from '@/components/ui/Tooltip';
import { formatNumber } from '@/lib/format';
import { cycleShuffle } from '@/player/commands';
import { usePlayer } from '@/player/store';
import { useUi } from '@/stores/ui';
import page from '../page.module.css';

const COLOR = '#5038a0';

export function LikedSongsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'vi' ? 'vi' : 'en';
  const me = useMe();
  const q = useLikedTracks(Boolean(me));
  const shuffle = usePlayer((s) => s.view?.shuffle ?? 'off');
  const density = useUi((s) => s.trackListDensity);
  const setDensity = useUi((s) => s.setTrackListDensity);
  const tracks = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const total = q.data?.pages[0]?.total ?? 0;
  const sentinel = useRef<HTMLDivElement>(null);

  // Load the next page when the bottom of the list scrolls into view (infinite scrolling).
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [q.hasNextPage, q.isFetchingNextPage]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!me) {
    return (
      <div className={page.empty}>
        <h2>{t('liked.title')}</h2>
        <Link to="/login"><Button variant="white">{t('nav.logIn')}</Button></Link>
      </div>
    );
  }
  const uri = 'melodify:collection:liked';
  return (
    <div className={page.page}>
      <StickyBar color={COLOR}>
        <PlayButton context={{ type: 'collection', id: 'liked' }} uri={uri} name={t('liked.title')} />
        <span className={entity.stickyTitle}>{t('liked.title')}</span>
      </StickyBar>
      <EntityHeader
        color={COLOR}
        cover={<Cover collection="liked" radius="lg" />}
        label={t('entity.playlist')}
        title={t('liked.title')}
        meta={
          <>
            <Link to={`/user/${me.id}`}><strong>{me.displayName}</strong></Link>
            <MetaDot />
            {t('entity.songs', { count: total, formatted: formatNumber(total, lang) })}
          </>
        }
      />
      <EntityBody color={COLOR}>
        <ActionBar
          right={
            <button
              type="button"
              className={entity.viewToggle}
              aria-label={density === 'list' ? t('actions.list') : t('actions.compact')}
              onClick={() => setDensity(density === 'list' ? 'compact' : 'list')}
            >
              <span className={entity.viewToggleLabel}>{density === 'list' ? t('actions.list') : t('actions.compact')}</span>
              <Icon name={density === 'list' ? 'listView' : 'compactView'} />
            </button>
          }
        >
          {total > 0 && <PlayButton context={{ type: 'collection', id: 'liked' }} uri={uri} name={t('liked.title')} size="large" />}
          {total > 0 && (
            <Tooltip label={shuffle === 'off' ? t('player.enableShuffle') : t('player.disableShuffle')}>
              <button type="button" className={`${entity.bigIcon} ${shuffle !== 'off' ? entity.on : ''}`} onClick={() => void cycleShuffle(Boolean(me.entitlements.smartShuffle))}>
                <Icon name={shuffle === 'smart' ? 'smartShuffle' : 'shuffle'} size={32} />
              </button>
            </Tooltip>
          )}
        </ActionBar>
        <div className={entity.listArea}>
          {q.isLoading ? (
            <Spinner />
          ) : (
            <TrackList
              tracks={tracks}
              context={{ type: 'collection', id: 'liked', uri }}
              columns={{ cover: density === 'list', album: true, dateAdded: true }}
              compact={density === 'compact'}
              offsetBy="trackId"
              empty={
                <div className={page.empty}>
                  <Icon name="heart" size={64} />
                  <h2>{t('liked.emptyTitle')}</h2>
                  <p className={page.muted}>{t('liked.emptyBody')}</p>
                  <Link to="/search"><Button variant="white">{t('liked.findSongs')}</Button></Link>
                </div>
              }
            />
          )}
          <div ref={sentinel} />
          {q.isFetchingNextPage && <Spinner />}
        </div>
      </EntityBody>
      <PageFooter />
    </div>
  );
}
