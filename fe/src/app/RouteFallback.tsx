import { Spinner } from '@/components/ui/Dialog';
import page from '@/pages/page.module.css';

/**
 * Shown while the first page's code downloads (initial load only — later navigations keep the old page
 * on screen). The spinner fades in late, so on a fast connection nothing flashes.
 */
export function RouteFallback() {
  return (
    <div className={page.routeFallback}>
      <Spinner />
    </div>
  );
}
