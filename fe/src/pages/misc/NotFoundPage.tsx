/** Spotify's 404: logo, "Page not found", a Home button. */
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { LogoMark } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import styles from './misc.module.css';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className={styles.notFound}>
      <LogoMark size={60} />
      <h1>{t('notFound.title')}</h1>
      <p>{t('notFound.body')}</p>
      <Link to="/">
        <Button variant="white" size="lg">{t('notFound.home')}</Button>
      </Link>
    </div>
  );
}
