import type { CSSProperties, ReactNode } from 'react';
import clsx from 'clsx';
import styles from './entity.module.css';

/** Spotify picks the title size from its length so it always fits on one or two lines. */
function titleClass(title: string) {
  const n = title.length;
  if (n <= 12) return styles.titleXL;
  if (n <= 22) return styles.titleL;
  if (n <= 36) return styles.titleM;
  return styles.titleS;
}

interface EntityHeaderProps {
  color: string | null | undefined;
  cover: ReactNode;
  label: ReactNode;
  title: string;
  description?: ReactNode;
  meta?: ReactNode;
  round?: boolean;
  onTitleClick?: () => void;
  /** Artist pages use a full-bleed banner image instead of a square cover. */
  banner?: string | null;
}

export function EntityHeader({ color, cover, label, title, description, meta, round, onTitleClick, banner }: EntityHeaderProps) {
  const style = { '--entity-color': color ?? '#535353' } as CSSProperties;
  if (banner !== undefined) {
    return (
      <header className={clsx(styles.header, styles.bannerHeader)} style={style} data-testid="entity-header">
        {banner && <div className={styles.banner} style={{ backgroundImage: `url(${banner})` }} />}
        <div className={styles.bannerShade} />
        <div className={styles.bannerText}>
          {label && <span className={styles.verified}>{label}</span>}
          <h1 className={clsx(styles.title, titleClass(title))}>{title}</h1>
          {meta && <div className={styles.meta}>{meta}</div>}
        </div>
      </header>
    );
  }
  return (
    <header className={styles.header} style={style} data-testid="entity-header">
      <div className={clsx(styles.cover, round && styles.coverRound)}>{cover}</div>
      <div className={styles.text}>
        <span className={styles.label}>{label}</span>
        <h1 className={clsx(styles.title, titleClass(title), onTitleClick && styles.editable)} onClick={onTitleClick}>
          {title}
        </h1>
        {description && <div className={styles.description}>{description}</div>}
        {meta && <div className={styles.meta}>{meta}</div>}
      </div>
    </header>
  );
}

/** The darker continuation of the header color behind the action bar & list. */
export function EntityBody({ color, children }: { color: string | null | undefined; children: ReactNode }) {
  return (
    <div className={styles.body} style={{ '--entity-color': color ?? '#535353' } as CSSProperties}>
      <div className={styles.bodyGradient} />
      <div className={styles.bodyContent}>{children}</div>
    </div>
  );
}

export function ActionBar({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className={styles.actionBar} data-testid="action-bar-row">
      <div className={styles.actions}>{children}</div>
      {right && <div className={styles.actionsRight}>{right}</div>}
    </div>
  );
}

export function MetaDot() {
  return <span className={styles.dot}>•</span>;
}
