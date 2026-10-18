/** Phone layout: the tab bar at the bottom (Home · Search · Your Library · Premium), like Spotify's mobile app. */
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { useMe } from '@/api/queries';
import { LogoMark } from '@/components/brand/Logo';
import { Icon, type IconName } from '@/components/icons/Icon';
import styles from './mobile.module.css';

export function BottomNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const me = useMe();
  const tab = (to: string, label: string, icon: IconName, activeIcon: IconName, active: boolean) => (
    <Link to={to} className={clsx(styles.tab, active && styles.tabActive)} aria-current={active ? 'page' : undefined}>
      <Icon name={active ? activeIcon : icon} size={24} />
      <span>{label}</span>
    </Link>
  );
  return (
    <nav className={styles.bottomNav} aria-label={t('nav.mainNavigation')}>
      {tab('/', t('nav.home'), 'home', 'homeFilled', pathname === '/')}
      {tab('/search', t('nav.search'), 'search', 'searchFilled', pathname.startsWith('/search') || pathname.startsWith('/genre'))}
      {tab('/collection', t('library.title'), 'libraryCollapsed', 'library', pathname === '/collection' || pathname.startsWith('/collection/') || pathname.startsWith('/folder'))}
      {me?.product !== 'premium' && (
        <Link to="/premium" className={styles.tab}>
          <LogoMark size={24} />
          <span>{t('nav.premium')}</span>
        </Link>
      )}
    </nav>
  );
}
