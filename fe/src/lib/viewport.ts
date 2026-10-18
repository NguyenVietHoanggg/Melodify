import { useSyncExternalStore } from 'react';

/**
 * Which layout the screen gets — the same breakpoints the CSS uses:
 *   mobile  < 768px   one column, bottom navigation, mini player
 *   tablet  < 1024px  library collapsed to icons, side panels slide over the page
 *   desktop           the full three-column player
 */
export type Viewport = 'mobile' | 'tablet' | 'desktop';

export const MOBILE_QUERY = '(max-width: 767px)';
export const TABLET_QUERY = '(max-width: 1023px)';

function subscribe(onChange: () => void) {
  const queries = [matchMedia(MOBILE_QUERY), matchMedia(TABLET_QUERY)];
  queries.forEach((q) => q.addEventListener('change', onChange));
  return () => queries.forEach((q) => q.removeEventListener('change', onChange));
}

const current = (): Viewport => (matchMedia(MOBILE_QUERY).matches ? 'mobile' : matchMedia(TABLET_QUERY).matches ? 'tablet' : 'desktop');

export const useViewport = () => useSyncExternalStore(subscribe, current, () => 'desktop');
