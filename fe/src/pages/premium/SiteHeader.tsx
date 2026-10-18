/** Header of the "website" pages (Premium, checkout, account) — spotify.com style, outside the player shell. */
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';
import { useMe } from '@/api/queries';
import { LogoFull } from '@/components/brand/Logo';
import { BackHomeButton } from '@/components/nav/BackHome';
import { DropdownMenu } from '@/components/ui/Menu';
import { post } from '@/lib/api';
import styles from './premium.module.css';

export function SiteHeader() {
  const { t } = useTranslation();
  const me = useMe();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const qc = useQueryClient();
  // Already on the Premium page: just glide down to the plans.
  const toPlans = (e: React.MouseEvent) => {
    const plans = pathname === '/premium' ? document.getElementById('plans') : null;
    if (!plans) return;
    e.preventDefault();
    plans.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const logout = async () => {
    await post('/auth/logout');
    qc.clear();
    window.location.assign('/');
  };
  return (
    <header className={styles.siteHeader}>
      <div className={styles.siteBrand}>
        <BackHomeButton />
        <Link to="/" aria-label="Home">
          <LogoFull height={32} />
        </Link>
      </div>
      <nav className={styles.siteNav}>
        <Link to="/premium#plans" onClick={toPlans}>{t('premium.plansNav')}</Link>
        <Link to="/download">{t('nav.download')}</Link>
        <span className={styles.siteSep} />
        {me ? (
          <DropdownMenu
            align="end"
            entries={[
              { label: t('userMenu.account'), onSelect: () => navigate('/account') },
              { kind: 'separator' },
              { label: t('userMenu.logOut'), onSelect: () => void logout() },
            ]}
            trigger={
              <button type="button" className={styles.siteUser}>
                <span className={styles.siteAvatar}>{me.avatarUrl ? <img src={me.avatarUrl} alt="" /> : (me.displayName[0] ?? '?').toUpperCase()}</span>
                {t('userMenu.profile')}
              </button>
            }
          />
        ) : (
          <>
            <Link to="/signup?continue=/premium">{t('nav.signUp')}</Link>
            <Link to="/login?continue=/premium">{t('nav.logIn')}</Link>
          </>
        )}
      </nav>
    </header>
  );
}
