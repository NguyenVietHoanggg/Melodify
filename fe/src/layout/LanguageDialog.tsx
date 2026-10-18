import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useMe } from '@/api/queries';
import { Icon } from '@/components/icons/Icon';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { setLanguage, type Lang } from '@/i18n';
import { patch } from '@/lib/api';
import styles from './language.module.css';

const LANGS: { id: Lang; native: string; english: string }[] = [
  { id: 'vi', native: 'Tiếng Việt', english: 'Vietnamese' },
  { id: 'en', native: 'English', english: 'English' },
];

export function LanguageButton() {
  const { t, i18n } = useTranslation();
  const me = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const choose = async (lang: Lang) => {
    setLanguage(lang);
    setOpen(false);
    if (me) await patch('/me', { locale: lang }).catch(() => {});
    void qc.invalidateQueries(); // content such as category names is localised by the backend
  };
  return (
    <>
      <Button variant="outline" size="sm" icon="globe" className={styles.button} onClick={() => setOpen(true)}>
        {t('footer.language')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title={t('footer.chooseLanguage')} className={styles.dialog}>
        <p className={styles.hint}>{t('footer.languageHint')}</p>
        <div className={styles.grid}>
          {LANGS.map((l) => (
            <button key={l.id} type="button" className={styles.option} aria-pressed={i18n.language === l.id} onClick={() => void choose(l.id)}>
              <span>
                <strong>{l.native}</strong>
                <span>{l.english}</span>
              </span>
              {i18n.language === l.id && <Icon name="check" />}
            </button>
          ))}
        </div>
      </Dialog>
    </>
  );
}
