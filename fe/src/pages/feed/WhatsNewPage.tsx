/**
 * What's New (/content-feed): releases from artists you follow, new episodes of your shows and — Melodify's
 * own twist — new uploads from creators you follow. Opening it clears the blue dot on the bell.
 */
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { FeedItem } from '@contracts';
import { useMarkFeedSeen, useToggleLike, useToggleSaved } from '@/api/mutations';
import { useContentFeed, useLikedIds, useMe, useSavedIds } from '@/api/queries';
import { Icon } from '@/components/icons/Icon';
import { PageFooter } from '@/components/layout/PageFooter';
import { ArtistLinks } from '@/components/media/Card';
import { Cover } from '@/components/media/Cover';
import { PlayButton } from '@/components/media/PlayButton';
import { Chip, Spinner } from '@/components/ui/Dialog';
import { Tooltip } from '@/components/ui/Tooltip';
import { formatAddedAt } from '@/lib/format';
import { contextOf, hrefOf } from '@/lib/links';
import page from '../page.module.css';
import styles from './feed.module.css';

type Filter = 'music' | 'podcasts' | 'community';

function FeedRow({ item }: { item: FeedItem }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'vi' ? 'vi' : 'en';
  const me = useMe();
  const saved = useSavedIds(Boolean(me));
  const liked = useLikedIds(Boolean(me));
  const toggleSaved = useToggleSaved();
  const toggleLike = useToggleLike();
  const { card } = item;
  const href = hrefOf(card.type, card.id);
  const ctx = contextOf(card);
  const kind =
    item.kind === 'episode' ? t('card.episode')
    : item.kind === 'upload' ? t('feed.upload')
    : card.releaseType === 'single' ? t('card.single')
    : card.releaseType === 'ep' ? t('card.ep')
    : card.releaseType === 'compilation' ? t('card.compilation')
    : t('card.album');
  const isSaved = card.type === 'album' ? (saved.data?.has(`album:${card.id}`) ?? false) : card.type === 'track' ? (liked.data?.has(card.id) ?? false) : false;
  const toggle = () =>
    card.type === 'album' ? toggleSaved.mutate({ type: 'album', id: card.id, saved: !isSaved }) : card.type === 'track' && toggleLike.mutate({ ids: [card.id], liked: !isSaved });

  return (
    <li className={styles.row}>
      <Link to={href} className={styles.cover}>
        <Cover imageUrl={card.imageUrl} radius="lg" fallbackIcon={card.type === 'episode' ? 'podcast' : 'note'} />
      </Link>
      <div className={styles.text}>
        <h3 className={clsx(styles.title, 'ellipsis')}>
          {item.isNew && <span className={styles.newDot} aria-label="New" />}
          <Link to={href}>{card.name}</Link>
        </h3>
        <p className={clsx(styles.subtitle, 'ellipsis')}>
          {card.artists?.length ? <ArtistLinks artists={card.artists} /> : card.publisher}
        </p>
        <p className={styles.meta}>
          <span>{kind}</span>
          <span>{formatAddedAt(item.date, lang)}</span>
        </p>
      </div>
      <div className={styles.actions}>
        {me && card.type !== 'episode' && (
          <Tooltip label={isSaved ? t('actions.removeFromLibrary') : t('actions.saveToLibrary')}>
            <button type="button" className={clsx(styles.iconBtn, isSaved && styles.on)} onClick={toggle} aria-label={isSaved ? t('actions.removeFromLibrary') : t('actions.saveToLibrary')}>
              <Icon name={isSaved ? 'checkCircle' : 'addCircle'} size={24} />
            </button>
          </Tooltip>
        )}
        {ctx && <PlayButton context={ctx} uri={card.uri} name={card.name} white />}
      </div>
    </li>
  );
}

export function WhatsNewPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter | null>(null);
  const { data, isLoading } = useContentFeed(filter);
  const markSeen = useMarkFeedSeen();

  // Opening the page counts as "seen" (after the first load, so this visit still shows the dots).
  useEffect(() => {
    if (data && !filter) markSeen.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(data)]);

  return (
    <div className={page.page}>
      <div className={styles.wrap}>
        <h1 className={styles.heading}>{t('feed.title')}</h1>
        <p className={styles.lead}>{t('feed.subtitle')}</p>
        <div className={styles.chips}>
          {(['music', 'podcasts', 'community'] as const).map((f) => (
            <Chip key={f} selected={filter === f} onClick={() => setFilter(filter === f ? null : f)}>
              {t(`feed.${f}`)}
            </Chip>
          ))}
        </div>
        {isLoading ? (
          <div className={page.centered}><Spinner /></div>
        ) : data?.items.length ? (
          <ul className={styles.list}>
            {data.items.map((item) => (
              <FeedRow key={`${item.kind}:${item.card.id}`} item={item} />
            ))}
          </ul>
        ) : (
          <div className={styles.empty}>
            <Icon name="bell" size={48} />
            <h2>{t('feed.emptyTitle')}</h2>
            <p>{t('feed.emptyBody')}</p>
          </div>
        )}
      </div>
      <PageFooter />
    </div>
  );
}
