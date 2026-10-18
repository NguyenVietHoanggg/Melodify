/**
 * Every square (or round) artwork in the app. Handles real images, 2×2 mosaics, the special covers of
 * built-in collections, and covers generated from data (Daily Mix, Radio, editorial playlists) — those
 * are drawn with CSS, their text scales with the cover size thanks to container query units (cqw).
 */
import { useState } from 'react';
import clsx from 'clsx';
import type { CollectionId, MixCover } from '@contracts';
import { BRAND } from '@/config/brand';
import { Icon, type IconName } from '../icons/Icon';
import styles from './media.module.css';

interface CoverProps {
  imageUrl?: string | null;
  mosaic?: string[];
  mixCover?: MixCover | null;
  collection?: CollectionId;
  round?: boolean;
  fallbackIcon?: IconName;
  alt?: string;
  className?: string;
  /** Corner radius scale: small covers (sidebar) use 4px, big ones 6–8px. */
  radius?: 'sm' | 'md' | 'lg';
  eager?: boolean;
}

/**
 * An image that fades in when ready. Until then — or for good if the link is broken (some provider images
 * are) — the placeholder icon shows, like Spotify's grey note / person. `bare` (generated covers) shows
 * nothing instead, so the cover's own colour stays visible.
 */
function Img({ src, alt, eager, icon = 'note', bare }: { src: string; alt: string; eager?: boolean; icon?: IconName; bare?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <span className={styles.imgBox}>
      {!loaded && !bare && (
        <span className={styles.fallback} aria-hidden>
          <Icon name={icon} />
        </span>
      )}
      {!failed && (
        <img
          src={src}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          className={clsx(styles.img, loaded && styles.loaded)}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

function GeneratedCover({ cover }: { cover: MixCover }) {
  const style = { '--mix-color': cover.color } as React.CSSProperties;
  switch (cover.style) {
    case 'radio':
      return (
        <div className={clsx(styles.gen, styles.radio)} style={style}>
          <span className={styles.genBrand}>{BRAND.name}</span>
          <span className={styles.radioTag}>RADIO</span>
          <div className={styles.radioCircle}>{cover.imageUrl ? <Img src={cover.imageUrl} alt="" icon="user" /> : <Icon name="radio" />}</div>
          <span className={styles.radioName}>{cover.label}</span>
        </div>
      );
    case 'daily':
    case 'artist':
      return (
        <div className={clsx(styles.gen, styles.daily)} style={style}>
          {cover.imageUrl && <Img src={cover.imageUrl} alt="" bare />}
          <span className={styles.genBrandDark}>{BRAND.name}</span>
          <div className={styles.dailyBand}>
            <span>{cover.label}</span>
          </div>
        </div>
      );
    default:
      // editorial, genre, mood, decade, discover, release radar, on repeat, ai
      return (
        <div className={clsx(styles.gen, styles.editorial, cover.imageUrl && styles.withImage)} style={style}>
          {cover.imageUrl && <Img src={cover.imageUrl} alt="" bare />}
          <span className={styles.genBrand}>{BRAND.name}</span>
          <span className={styles.editorialLabel}>{cover.label}</span>
        </div>
      );
  }
}

const COLLECTION: Record<CollectionId, { icon: IconName; className: string }> = {
  liked: { icon: 'heartFilled', className: styles.liked! },
  episodes: { icon: 'podcast', className: styles.episodes! },
  uploads: { icon: 'upload', className: styles.uploads! },
};

export function Cover({ imageUrl, mosaic, mixCover, collection, round, fallbackIcon = 'note', alt = '', className, radius = 'md', eager }: CoverProps) {
  let body: React.ReactNode;
  if (collection) {
    const c = COLLECTION[collection];
    body = (
      <div className={clsx(styles.collection, c.className)}>
        <Icon name={c.icon} />
      </div>
    );
  } else if (mixCover && !imageUrl) {
    body = <GeneratedCover cover={mixCover} />;
  } else if (imageUrl) {
    body = <Img src={imageUrl} alt={alt} eager={eager} icon={fallbackIcon} />;
  } else if (mosaic && mosaic.length >= 4) {
    body = (
      <div className={styles.mosaic}>
        {mosaic.slice(0, 4).map((src, i) => (
          <Img key={i} src={src} alt="" icon={fallbackIcon} />
        ))}
      </div>
    );
  } else if (mosaic && mosaic.length > 0) {
    body = <Img src={mosaic[0]!} alt={alt} eager={eager} icon={fallbackIcon} />;
  } else {
    body = (
      <div className={styles.fallback}>
        <Icon name={fallbackIcon} />
      </div>
    );
  }
  return <div className={clsx(styles.cover, round && styles.round, styles[`r-${radius}`], className)}>{body}</div>;
}
