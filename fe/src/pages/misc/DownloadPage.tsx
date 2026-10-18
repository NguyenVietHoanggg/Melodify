/**
 * /download — Spotify offers a desktop app here. Melodify is a web app, so we offer the next best thing:
 * installing it as a Progressive Web App (own window, taskbar icon, media keys).
 */
import { useTranslation } from 'react-i18next';
import { LogoMark } from '@/components/brand/Logo';
import { Icon } from '@/components/icons/Icon';
import { PageFooter } from '@/components/layout/PageFooter';
import { Button } from '@/components/ui/Button';
import { BRAND } from '@/config/brand';
import { installApp, usePwa } from '@/lib/pwa';
import page from '../page.module.css';
import styles from './misc.module.css';

export function DownloadPage() {
  const { t } = useTranslation();
  const { prompt, installed } = usePwa();
  return (
    <div className={page.page}>
      <section className={styles.download}>
        <div className={styles.downloadArt}>
          <LogoMark size={160} />
        </div>
        <div className={styles.downloadText}>
          <h1>{t('download.title', { app: BRAND.name })}</h1>
          <p>{t('download.body', { app: BRAND.name })}</p>
          {installed ? (
            <p className={styles.installed}>
              <Icon name="checkCircle" size={20} /> {t('download.installed')}
            </p>
          ) : (
            <Button variant="primary" size="lg" disabled={!prompt} onClick={() => void installApp()}>
              <Icon name="downloadCircle" size={20} /> {t('download.install')}
            </Button>
          )}
          {!installed && !prompt && <p className={styles.hint}>{t('download.manual', { app: BRAND.name })}</p>}
        </div>
      </section>
      <section className={styles.mobile}>
        <Icon name="smartphone" size={32} />
        <div>
          <h2>{t('download.mobileTitle')}</h2>
          <p>{t('download.mobileBody', { app: BRAND.name })}</p>
        </div>
      </section>
      <PageFooter />
    </div>
  );
}
