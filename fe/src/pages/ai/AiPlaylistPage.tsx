/**
 * AI Playlist (/ai-playlist, Premium): describe a vibe in one sentence, get a playlist.
 * Gemini only *understands* the sentence; the songs are picked by our recommender, so every result is a
 * real, playable track. After creating we jump to the new playlist, where it can be refined.
 */
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { useCreateAiPlaylist } from '@/api/mutations';
import { useAiStatus, useMe } from '@/api/queries';
import { Icon } from '@/components/icons/Icon';
import { PageFooter } from '@/components/layout/PageFooter';
import { Button } from '@/components/ui/Button';
import { Chip, Spinner } from '@/components/ui/Dialog';
import { BRAND } from '@/config/brand';
import { errorMessage } from '@/lib/api';
import page from '../page.module.css';
import styles from './ai.module.css';

export function AiPlaylistPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const me = useMe();
  const status = useAiStatus(Boolean(me));
  const create = useCreateAiPlaylist();
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState('');

  if (!me) {
    return (
      <div className={page.empty}>
        <Icon name="sparkle" size={48} />
        <h2>{t('ai.title')}</h2>
        <Link to="/login?continue=/ai-playlist"><Button variant="white">{t('nav.logIn')}</Button></Link>
      </div>
    );
  }

  const submit = (e?: FormEvent, text = prompt) => {
    e?.preventDefault();
    const value = text.trim();
    if (value.length < 3) {
      setError(t('validation.prompt', { min: 3 }));
      return;
    }
    setError('');
    create.mutate(value, {
      onSuccess: (r) => navigate(`/playlist/${r.playlistId}`),
      onError: (err) => setError(errorMessage(err)),
    });
  };

  const s = status.data;
  return (
    <div className={page.page}>
      <div className={styles.hero}>
        <div className={styles.glow} aria-hidden />
        <div className={styles.inner}>
          <span className={styles.badge}>
            <Icon name="sparkle" size={16} /> {t('ai.title')}
          </span>
          <h1 className={styles.title}>{t('ai.title')}</h1>
          <p className={styles.subtitle}>{t('ai.subtitle')}</p>

          {status.isLoading ? (
            <Spinner />
          ) : !s?.available ? (
            <div className={styles.upsell}>
              <h2>{t('ai.premiumTitle')}</h2>
              <p>{t('ai.premiumBody')}</p>
              <Link to="/premium"><Button variant="white">{t('nav.explorePremium')}</Button></Link>
            </div>
          ) : create.isPending ? (
            <div className={styles.working} role="status">
              <span className={styles.orb}><Icon name="sparkle" size={32} /></span>
              <p>{t('ai.creating')}</p>
              <p className={styles.promptEcho}>“{prompt}”</p>
            </div>
          ) : (
            <>
              <form className={styles.box} onSubmit={submit}>
                <Icon name="sparkle" size={20} />
                <input
                  value={prompt}
                  maxLength={300}
                  placeholder={t('ai.placeholder')}
                  aria-label={t('ai.placeholder')}
                  onChange={(e) => setPrompt(e.target.value)}
                  autoFocus
                />
                <Button type="submit" disabled={!prompt.trim() || s.remaining <= 0}>
                  {t('ai.create')}
                </Button>
              </form>
              {error && <p className={styles.error}>{error}</p>}
              <p className={styles.remaining}>{t('ai.remaining', { count: s.remaining })}</p>
              <div className={styles.suggestions}>
                <span>{t('ai.tryThese')}</span>
                <div className={styles.chips}>
                  {s.suggestions.map((x) => (
                    <Chip
                      key={x}
                      onClick={() => {
                        setPrompt(x);
                        submit(undefined, x);
                      }}
                    >
                      {x}
                    </Chip>
                  ))}
                </div>
              </div>
              <p className={styles.how}>
                <Icon name="info" size={14} /> {s.usesGemini ? t('ai.howItWorks', { app: BRAND.name }) : t('ai.fallbackMode')}
              </p>
            </>
          )}
        </div>
      </div>
      <PageFooter />
    </div>
  );
}
