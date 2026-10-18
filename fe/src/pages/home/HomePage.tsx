import { useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { Card, Section } from '@contracts';
import { useHome, useMe } from '@/api/queries';
import { PageFooter } from '@/components/layout/PageFooter';
import { collectionOf, collectionTitle } from '@/components/media/Card';
import { Cover } from '@/components/media/Cover';
import { PlayButton } from '@/components/media/PlayButton';
import { Shelf } from '@/components/media/Shelf';
import { Chip } from '@/components/ui/Dialog';
import { BRAND } from '@/config/brand';
import { useScrollTop } from '@/layout/MainView';
import { contextOf, hrefOf } from '@/lib/links';
import { usePlayer } from '@/player/store';
import styles from '../page.module.css';

type Filter = 'all' | 'music' | 'podcasts' | 'community';

function Shortcut({ card, onHover }: { card: Card; onHover: (color: string | null) => void }) {
  const { t } = useTranslation();
  const playing = usePlayer((s) => s.view?.context?.uri === card.uri);
  const ctx = contextOf(card);
  const title = card.type === 'collection' ? collectionTitle(card.id, t) : card.name;
  return (
    <Link
      to={hrefOf(card.type, card.id)}
      className={clsx(styles.shortcut, playing && styles.shortcutPlaying)}
      onMouseEnter={() => onHover(card.color ?? card.mixCover?.color ?? null)}
      onMouseLeave={() => onHover(null)}
    >
      <div className={styles.shortcutCover}>
        <Cover imageUrl={card.imageUrl} mosaic={card.mosaic} mixCover={card.mixCover} collection={card.type === 'collection' ? collectionOf(card.id) : undefined} round={card.type === 'artist'} radius="sm" />
      </div>
      <span className={clsx(styles.shortcutTitle, 'clamp-2')}>{title}</span>
      {ctx && <PlayButton context={ctx} uri={card.uri} name={title} size="small" className={styles.shortcutPlay} />}
    </Link>
  );
}

function SkeletonShelves() {
  return (
    <div className={styles.sections}>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className={styles.skeletonShelf}>
          <div className={clsx(styles.skeletonTitle, styles.shimmer)} />
          <div className={styles.skeletonCards}>
            {Array.from({ length: 5 }, (__, j) => (
              <div key={j} className={clsx(styles.skeletonCard, styles.shimmer)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function sectionTitle(s: Section, t: (k: string, o?: Record<string, unknown>) => string) {
  return t(s.titleKey, { ...s.titleParams, app: s.titleParams?.app ?? BRAND.name });
}

export function HomePage() {
  const { t } = useTranslation();
  const me = useMe();
  const [filter, setFilter] = useState<Filter>('all');
  const [hoverColor, setHoverColor] = useState<string | null>(null);
  const { data, isLoading } = useHome(filter);
  const scrollTop = useScrollTop();
  const sections = data?.sections ?? [];
  const shortcuts = sections.find((s) => s.layout === 'shortcuts');
  const baseColor = shortcuts?.items[0]?.color ?? '#535353';

  return (
    <div className={styles.page} data-testid="home-page">
      {me && <div className={styles.homeGradient} style={{ backgroundColor: hoverColor ?? baseColor }} />}
      {me && (
        <div className={clsx(styles.chips, scrollTop > 8 && styles.chipsStuck)}>
          {(['all', 'music', 'podcasts', 'community'] as const).map((f) => (
            <Chip key={f} selected={filter === f} onClick={() => setFilter(f)}>
              {t(`home.filters.${f}`)}
            </Chip>
          ))}
        </div>
      )}
      <div style={{ position: 'relative', paddingTop: me ? 0 : 16 }}>
        {shortcuts && filter === 'all' && (
          <div className={styles.content} style={{ padding: '0 var(--content-spacing)' }}>
            <div className={styles.shortcuts} style={{ margin: '4px 0 16px' }}>
              {shortcuts.items.map((c) => (
                <Shortcut key={`${c.type}:${c.id}`} card={c} onHover={setHoverColor} />
              ))}
            </div>
          </div>
        )}
        {isLoading && !data ? (
          <SkeletonShelves />
        ) : (
          <div className={styles.sections}>
            {sections
              .filter((s) => s.layout !== 'shortcuts')
              .map((s) => (
                <Shelf key={s.id} title={sectionTitle(s, t)} seeAllPath={s.seeAllPath} items={s.items} />
              ))}
          </div>
        )}
      </div>
      <PageFooter />
    </div>
  );
}
