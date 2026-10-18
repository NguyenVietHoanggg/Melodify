import { useLayoutEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router';
import styles from './standalone.module.css';

/**
 * Frame of the pages that live outside the player (log in, sign up, password reset, Premium, checkout,
 * account). The player shell keeps <body> from scrolling, so these pages scroll inside this box instead.
 * Every navigation starts at the top — or at the #section named in the address (/premium#plans).
 */
export function StandaloneLayout() {
  const ref = useRef<HTMLDivElement>(null);
  const { pathname, hash, key } = useLocation();
  useLayoutEffect(() => {
    ref.current?.scrollTo(0, 0);
    if (!hash) return;
    // The section may appear only once the page's data has loaded: look for it for a few seconds.
    const id = decodeURIComponent(hash.slice(1));
    let tries = 0;
    const timer = setInterval(() => {
      const target = document.getElementById(id);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (target || ++tries > 40) clearInterval(timer);
    }, 75);
    return () => clearInterval(timer);
  }, [pathname, hash, key]);
  return (
    <div ref={ref} className={styles.scroller} data-testid="page-scroll">
      <Outlet />
    </div>
  );
}
