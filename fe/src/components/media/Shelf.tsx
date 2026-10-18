import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { Card as CardData } from '@contracts';
import { Icon } from '../icons/Icon';
import { Card } from './Card';
import styles from './media.module.css';
import shelf from './shelf.module.css';

interface ShelfProps {
  title: ReactNode;
  seeAllPath?: string;
  items: CardData[];
  variant?: 'default' | 'discography';
  fromSearch?: boolean;
}

/** A titled row of cards that scrolls horizontally, with Spotify's hover arrows. */
export function Shelf({ title, seeAllPath, items, variant, fromSearch }: ShelfProps) {
  const { t } = useTranslation();
  const row = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const update = () => {
    const el = row.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  };
  useEffect(() => {
    update();
    const el = row.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items.length]);

  const scrollBy = (dir: 1 | -1) => {
    const el = row.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  if (!items.length) return null;
  return (
    <section className={styles.shelf}>
      {(title || seeAllPath) && (
      <div className={styles.shelfHeader}>
        <h2 className={styles.shelfTitle}>{seeAllPath ? <Link to={seeAllPath}>{title}</Link> : title}</h2>
        {seeAllPath && (
          <Link to={seeAllPath} className={styles.showAll}>
            {t('home.showAll')}
          </Link>
        )}
      </div>
      )}
      <div className={shelf.wrap}>
        {!edges.start && (
          <button type="button" className={`${shelf.arrow} ${shelf.left}`} onClick={() => scrollBy(-1)} aria-label={t('nav.back')}>
            <Icon name="arrowLeft" />
          </button>
        )}
        <div ref={row} className={shelf.row} onScroll={update}>
          {items.map((c) => (
            <div key={`${c.type}:${c.id}`} className={shelf.cell}>
              <Card card={c} variant={variant} fromSearch={fromSearch} />
            </div>
          ))}
        </div>
        {!edges.end && (
          <button type="button" className={`${shelf.arrow} ${shelf.right}`} onClick={() => scrollBy(1)} aria-label={t('nav.forward')}>
            <Icon name="arrowRight" />
          </button>
        )}
      </div>
    </section>
  );
}

/** Non-scrolling responsive grid of cards ("Show all" pages, search tabs, discography). */
export function CardGrid({ items, variant, fromSearch }: { items: CardData[]; variant?: 'default' | 'discography'; fromSearch?: boolean }) {
  return (
    <div className={styles.grid}>
      {items.map((c) => (
        <Card key={`${c.type}:${c.id}`} card={c} variant={variant} fromSearch={fromSearch} />
      ))}
    </div>
  );
}
