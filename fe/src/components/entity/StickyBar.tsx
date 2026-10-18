import type { CSSProperties, ReactNode } from 'react';
import clsx from 'clsx';
import { useScrollTop } from '@/layout/MainView';
import styles from './entity.module.css';

/**
 * The bar that slides in at the top of the main view once you scroll past a page's header
 * (play button + title, painted with the page's color).
 */
export function StickyBar({ color, threshold = 260, children }: { color: string | null | undefined; threshold?: number; children: ReactNode }) {
  const top = useScrollTop();
  const visible = top > threshold;
  const opacity = Math.min(1, Math.max(0, (top - 64) / 200));
  return (
    <div className={styles.sticky} style={{ '--entity-color': color ?? '#535353' } as CSSProperties}>
      <div className={styles.stickyBg} style={{ opacity }} />
      <div className={clsx(styles.stickyContent, visible && styles.stickyVisible)}>{children}</div>
    </div>
  );
}
