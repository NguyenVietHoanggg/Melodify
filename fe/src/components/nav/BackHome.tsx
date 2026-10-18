import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { Icon } from '@/components/icons/Icon';
import { Tooltip } from '@/components/ui/Tooltip';
import styles from './backHome.module.css';

/**
 * Round "‹" button for pages outside the player (account, Premium, checkout, log in…).
 * Came here from another page of the app → goes back to it. Opened directly from a link (nothing of ours
 * to go back to) → goes to the home page, instead of leaving the site.
 */
export function BackHomeButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // React Router gives the very first page of a visit the key "default".
  const hasPrevious = useLocation().key !== 'default';
  const label = hasPrevious ? t('nav.back') : t('nav.backHome');
  return (
    <Tooltip label={label}>
      <button type="button" className={clsx(styles.button, className)} aria-label={label} onClick={() => (hasPrevious ? navigate(-1) : navigate('/'))}>
        <Icon name="arrowLeft" size={16} />
      </button>
    </Tooltip>
  );
}
