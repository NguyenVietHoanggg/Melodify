import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Dialog as D } from 'radix-ui';
import { Cover } from '@/components/media/Cover';
import { Button } from '@/components/ui/Button';
import { BRAND } from '@/config/brand';
import { useUi } from '@/stores/ui';
import ui from '@/components/ui/ui.module.css';
import styles from './banner.module.css';

/** What a logged-out visitor sees after pressing play (measured from open.spotify.com). */
export function LoginPrompt() {
  const { t } = useTranslation();
  const prompt = useUi((s) => s.loginPrompt);
  const close = () => useUi.getState().showLoginPrompt(null);
  const title =
    prompt?.kind === 'play' ? t('loggedOut.startListening', { app: BRAND.name })
    : prompt?.kind === 'playlist' ? t('loggedOut.createPlaylistPrompt')
    : prompt?.kind === 'follow' ? t('loggedOut.followPrompt')
    : t('loggedOut.libraryPrompt');

  return (
    <D.Root open={Boolean(prompt)} onOpenChange={(o) => !o && close()}>
      <D.Portal>
        <D.Overlay className={ui.overlay} />
        <D.Content className={`${ui.dialog} ${styles.prompt}`} style={{ ['--prompt-color' as string]: prompt?.color ?? '#7a1f2b' }} aria-describedby={undefined}>
          <div className={styles.promptCover}>
            <Cover imageUrl={prompt?.imageUrl} radius="md" eager />
          </div>
          <div className={styles.promptBody}>
            <D.Title className={styles.promptTitle}>{title}</D.Title>
            <Link to="/signup" onClick={close}>
              <Button variant="primary" size="md">
                {t('loggedOut.signUpFree')}
              </Button>
            </Link>
            <Link to="/download" onClick={close}>
              <Button variant="outline" size="md">
                {t('loggedOut.downloadApp')}
              </Button>
            </Link>
            <p className={styles.promptAlt}>
              {t('loggedOut.haveAccount')}
              <Link to="/login" onClick={close}>
                {t('nav.logIn')}
              </Link>
            </p>
          </div>
          <D.Close className={styles.promptClose}>{t('loggedOut.close')}</D.Close>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
