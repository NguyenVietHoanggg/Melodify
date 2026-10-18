import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import clsx from 'clsx';
import { useLocation } from 'react-router';
import styles from './layout.module.css';

const MainScrollContext = createContext<RefObject<HTMLDivElement | null>>({ current: null });

/** The rounded, scrolling center panel. Pages read its scroll position for sticky headers. */
export function MainView({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    ref.current?.scrollTo(0, 0);
  }, [pathname]);
  return (
    <main className={clsx(styles.panel, styles.main)}>
      <div ref={ref} className={clsx('scroll', styles.mainScroll)} id="main-scroll">
        <MainScrollContext.Provider value={ref}>
          <div className={styles.mainContent}>{children}</div>
        </MainScrollContext.Provider>
      </div>
    </main>
  );
}

export const useMainScroll = () => useContext(MainScrollContext);

/** Current scrollTop of the main view, updated at most once per animation frame. */
export function useScrollTop(): number {
  const ref = useMainScroll();
  const [top, setTop] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setTop(el.scrollTop));
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('scroll', onScroll);
    };
  }, [ref]);
  return top;
}
