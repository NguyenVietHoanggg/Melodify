/** Recents (/recents): everything you played lately, grouped by day — newest first. */
import { useMemo } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { RecentItem } from '@contracts';
import { useMe, useRecents } from '@/api/queries';
import { Icon } from '@/components/icons/Icon';
import { PageFooter } from '@/components/layout/PageFooter';
import { CardSubtitle, collectionOf, collectionTitle } from '@/components/media/Card';
import { Cover } from '@/components/media/Cover';
import { PlayButton } from '@/components/media/PlayButton';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Dialog';
import { contextOf, hrefOf } from '@/lib/links';
import page from '../page.module.css';
import styles from './feed.module.css';

const TYPE_KEYS: Partial<Record<string, string>> = {
  track: 'card.song', collection: 'card.playlist', playlist: 'card.playlist', album: 'card.album', artist: 'card.artist',
  show: 'card.podcast', episode: 'card.episode', user: 'card.profile',
};

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export function RecentsPage() {
  const { t, i18n } = useTranslation();
  const me = useMe();
  const { data, isLoading } = useRecents(Boolean(me));
  const locale = i18n.language === 'vi' ? 'vi-VN' : 'en-US';

  const groups = useMemo(() => {
    const today = new Date();
    const yesterday = new Date(Date.now() - 86_400_000);
    const out: { label: string; items: RecentItem[] }[] = [];
    for (const item of data?.items ?? []) {
      const d = new Date(item.playedAt);
      const label =
        dayKey(d) === dayKey(today) ? t('recents.today')
        : dayKey(d) === dayKey(yesterday) ? t('recents.yesterday')
        : new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(item);
      else out.push({ label, items: [item] });
    }
    return out;
  }, [data, locale, t]);

  if (!me) {
    return (
      <div className={page.empty}>
        <h2>{t('recents.title')}</h2>
        <Link to="/login?continue=/recents"><Button variant="white">{t('nav.logIn')}</Button></Link>
      </div>
    );
  }

  return (
    <div className={page.page}>
      <div className={styles.wrap}>
        <h1 className={styles.heading}>{t('recents.title')}</h1>
        {isLoading ? (
          <div className={page.centered}><Spinner /></div>
        ) : groups.length ? (
          groups.map((g) => (
            <section key={g.label} className={styles.group}>
              <h2 className={styles.groupTitle}>{g.label}</h2>
              {g.items.map(({ card, playedAt }) => {
                const title = card.type === 'collection' ? collectionTitle(card.id, t) : card.name;
                const ctx = contextOf(card);
                return (
                  <Link key={`${card.type}:${card.id}`} to={hrefOf(card.type, card.id)} className={styles.recent}>
                    <div className={styles.recentCover}>
                      <Cover
                        imageUrl={card.imageUrl}
                        mosaic={card.mosaic}
                        mixCover={card.mixCover}
                        collection={card.type === 'collection' ? collectionOf(card.id) : undefined}
                        round={card.type === 'artist'}
                        radius="sm"
                        fallbackIcon={card.type === 'episode' || card.type === 'show' ? 'podcast' : 'note'}
                      />
                    </div>
                    <div className={styles.recentText}>
                      <span className={clsx(styles.recentTitle, 'ellipsis')}>{title}</span>
                      <span className={clsx(styles.recentSub, 'ellipsis')}>
                        {TYPE_KEYS[card.type] ? t(TYPE_KEYS[card.type]!) : ''}
                        {card.type !== 'collection' && card.type !== 'artist' && <> • <CardSubtitle card={card} /></>}
                      </span>
                    </div>
                    <span className={styles.recentTime}>
                      {new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(playedAt))}
                    </span>
                    {ctx && (
                      <span className={styles.recentPlay}>
                        <PlayButton context={ctx} uri={card.uri} name={title} size="small" />
                      </span>
                    )}
                  </Link>
                );
              })}
            </section>
          ))
        ) : (
          <div className={styles.empty}>
            <Icon name="clock" size={48} />
            <h2>{t('recents.emptyTitle')}</h2>
            <p>{t('recents.emptyBody')}</p>
          </div>
        )}
      </div>
      <PageFooter />
    </div>
  );
}
