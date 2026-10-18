/** "Your Episodes" (/collection/episodes): episodes you saved with the + button. */
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useMe, useSavedEpisodes } from '@/api/queries';
import { ActionBar, EntityBody, EntityHeader, MetaDot } from '@/components/entity/EntityHeader';
import { StickyBar } from '@/components/entity/StickyBar';
import entity from '@/components/entity/entity.module.css';
import { Icon } from '@/components/icons/Icon';
import { PageFooter } from '@/components/layout/PageFooter';
import { Cover } from '@/components/media/Cover';
import { PlayButton } from '@/components/media/PlayButton';
import { EpisodeRow } from '@/components/podcasts/EpisodeRow';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Dialog';
import { formatNumber } from '@/lib/format';
import page from '../page.module.css';
import styles from './podcast.module.css';

const COLOR = '#056952';

export function YourEpisodesPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'vi' ? 'vi' : 'en';
  const me = useMe();
  const q = useSavedEpisodes(Boolean(me));
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const total = q.data?.pages[0]?.total ?? 0;
  const sentinel = useRef<HTMLDivElement>(null);

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
        <h2>{t('podcast.yourEpisodes')}</h2>
        <Link to="/login?continue=/collection/episodes"><Button variant="white">{t('nav.logIn')}</Button></Link>
      </div>
    );
  }
  return (
    <div className={page.page}>
      <StickyBar color={COLOR}>
        {total > 0 && <PlayButton context={{ type: 'collection', id: 'episodes' }} uri="melodify:collection:episodes" name={t('podcast.yourEpisodes')} />}
        <span className={entity.stickyTitle}>{t('podcast.yourEpisodes')}</span>
      </StickyBar>
      <EntityHeader
        color={COLOR}
        cover={<Cover collection="episodes" radius="lg" />}
        label={t('entity.playlist')}
        title={t('podcast.yourEpisodes')}
        meta={
          <>
            <Link to={`/user/${me.id}`}><strong>{me.displayName}</strong></Link>
            <MetaDot />
            {t('library.episodesCount', { count: total, formatted: formatNumber(total, lang) })}
          </>
        }
      />
      <EntityBody color={COLOR}>
        <ActionBar>
          {total > 0 && <PlayButton context={{ type: 'collection', id: 'episodes' }} uri="melodify:collection:episodes" name={t('podcast.yourEpisodes')} size="large" />}
        </ActionBar>
        <div className={styles.savedList}>
          {q.isLoading ? (
            <Spinner />
          ) : items.length ? (
            items.map((e) => <EpisodeRow key={e.id} episode={e} showShow />)
          ) : (
            <div className={page.empty}>
              <Icon name="podcast" size={64} />
              <h2>{t('podcast.yourEpisodesEmpty')}</h2>
              <p className={page.muted}>{t('podcast.yourEpisodesEmptyBody')}</p>
              <Link to="/search"><Button variant="white">{t('podcast.findPodcasts')}</Button></Link>
            </div>
          )}
          <div ref={sentinel} />
          {q.isFetchingNextPage && <Spinner />}
        </div>
      </EntityBody>
      <PageFooter />
    </div>
  );
}
