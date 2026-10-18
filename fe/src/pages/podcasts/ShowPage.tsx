/**
 * A podcast (/show/:id): header, Follow, "All Episodes" (newest/oldest, infinite scroll) next to an
 * "About" card, and "You might also like".
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useToggleSaved } from '@/api/mutations';
import { useMe, useSavedIds, useShowEpisodes, useShowPage } from '@/api/queries';
import { ActionBar, EntityBody, EntityHeader } from '@/components/entity/EntityHeader';
import { StickyBar } from '@/components/entity/StickyBar';
import entity from '@/components/entity/entity.module.css';
import { Icon } from '@/components/icons/Icon';
import { PageFooter } from '@/components/layout/PageFooter';
import { Cover } from '@/components/media/Cover';
import { PlayButton } from '@/components/media/PlayButton';
import { Shelf } from '@/components/media/Shelf';
import { EpisodeRow } from '@/components/podcasts/EpisodeRow';
import { Linkified } from '@/components/text/Linkified';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Dialog';
import { DropdownMenu } from '@/components/ui/Menu';
import { toast } from '@/stores/toast';
import page from '../page.module.css';
import styles from './podcast.module.css';

export function ShowPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const me = useMe();
  const { data, isLoading } = useShowPage(id);
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const episodes = useShowEpisodes(id, sort);
  const saved = useSavedIds(Boolean(me));
  const toggleSaved = useToggleSaved();
  const [aboutOpen, setAboutOpen] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const list = useMemo(() => episodes.data?.pages.flatMap((p) => p.items) ?? [], [episodes.data]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && episodes.hasNextPage && !episodes.isFetchingNextPage) void episodes.fetchNextPage();
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [episodes.hasNextPage, episodes.isFetchingNextPage]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <div className={page.centered}><Spinner /></div>;
  if (!data) {
    return (
      <div className={page.empty}>
        <h2>{t('notFound.title')}</h2>
        <Link to="/"><Button variant="white">{t('notFound.home')}</Button></Link>
      </div>
    );
  }
  const { show, related } = data;
  const uri = `melodify:show:${show.id}`;
  const following = saved.data?.has(`show:${show.id}`) ?? show.isFollowing;
  const color = show.dominantColor ?? '#535353';

  return (
    <div className={page.page}>
      <StickyBar color={color}>
        <PlayButton context={{ type: 'show', id: show.id }} uri={uri} name={show.title} />
        <span className={entity.stickyTitle}>{show.title}</span>
      </StickyBar>
      <EntityHeader
        color={color}
        cover={<Cover imageUrl={show.imageUrl} radius="lg" fallbackIcon="podcast" eager />}
        label={t('podcast.podcast')}
        title={show.title}
        meta={<strong>{show.publisher}</strong>}
      />
      <EntityBody color={color}>
        <ActionBar>
          {me && (
            <Button variant="outline" size="sm" className={styles.follow} onClick={() => toggleSaved.mutate({ type: 'show', id: show.id, saved: !following })}>
              {following ? t('podcast.following') : t('podcast.follow')}
            </Button>
          )}
          <DropdownMenu
            entries={[
              ...(me ? [{ label: following ? t('menu.unfollow') : t('menu.follow'), icon: 'addCircle' as const, onSelect: () => toggleSaved.mutate({ type: 'show', id: show.id, saved: !following }) }] : []),
              ...(show.websiteUrl ? [{ label: show.websiteUrl.replace(/^https?:\/\//, '').slice(0, 40), icon: 'external' as const, onSelect: () => window.open(show.websiteUrl!, '_blank', 'noopener,noreferrer') }] : []),
              { kind: 'separator' as const },
              { label: t('menu.copyLink'), icon: 'link' as const, onSelect: () => void navigator.clipboard.writeText(location.href).then(() => toast(t('actions.linkCopied'))) },
            ]}
            trigger={
              <button type="button" className={entity.bigIcon} aria-label={t('actions.moreOptions', { name: show.title })}>
                <Icon name="more" size={32} />
              </button>
            }
          />
        </ActionBar>
        <div className={styles.columns}>
          <section className={styles.episodes}>
            <div className={styles.episodesHead}>
              <h2>{t('podcast.allEpisodes')}</h2>
              <DropdownMenu
                align="end"
                entries={(['newest', 'oldest'] as const).map((s) => ({ label: t(`podcast.${s}`), checked: sort === s, onSelect: () => setSort(s) }))}
                trigger={
                  <button type="button" className={styles.sort}>
                    {t(`podcast.${sort}`)} <Icon name="sort" size={14} />
                  </button>
                }
              />
            </div>
            {list.map((e) => (
              <EpisodeRow key={e.id} episode={e} context={{ type: 'show', id: show.id }} />
            ))}
            <div ref={sentinel} />
            {(episodes.isLoading || episodes.isFetchingNextPage) && <Spinner />}
          </section>
          <aside className={styles.about}>
            <h2>{t('podcast.about')}</h2>
            {show.description && (
              <div className={clsx(styles.aboutText, !aboutOpen && styles.clamped)}>
                <Linkified text={show.description} />
              </div>
            )}
            {show.description && show.description.length > 240 && (
              <button type="button" className={styles.more} onClick={() => setAboutOpen((v) => !v)}>
                {aboutOpen ? t('podcast.showLess') : t('podcast.showMore')}
              </button>
            )}
            {show.categories.length > 0 && (
              <ul className={styles.categories}>
                {show.categories.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            )}
          </aside>
        </div>
        {related.length > 0 && (
          <div className={page.sections} style={{ marginTop: 32 }}>
            <Shelf title={t('podcast.youMightLike')} items={related} />
          </div>
        )}
      </EntityBody>
      <PageFooter />
    </div>
  );
}
