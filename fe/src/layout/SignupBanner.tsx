import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { BRAND } from '@/config/brand';
import styles from './banner.module.css';

/** Logged-out replacement for the player bar ("Preview of Spotify — Sign up free"). */
export function SignupBanner() {
  const { t } = useTranslation();
  return (
    <div className={styles.banner} data-testid="signup-bar">
      <div className={styles.text}>
        <p className={styles.title}>{t('loggedOut.previewTitle', { app: BRAND.name })}</p>
        <p className={styles.body}>{t('loggedOut.previewBody')}</p>
      </div>
      <Link to="/signup">
        <Button variant="white" size="md">
          {t('loggedOut.signUpFree')}
        </Button>
      </Link>
    </div>
  );
}
