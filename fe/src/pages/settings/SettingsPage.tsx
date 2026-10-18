/**
 * Settings (open.spotify.com/preferences). Most switches are saved on the backend (UserSettings), so they
 * follow you to other devices and the server can act on them (crossfade, autoplay, private session…).
 * Pure layout preferences (compact library) also live in the local UI store.
 */
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { AudioQuality, UserSettings } from '@contracts';
import { useUpdateProfile, useUpdateSettings } from '@/api/mutations';
import { useMe } from '@/api/queries';
import { Button } from '@/components/ui/Button';
import { SelectField, Toggle } from '@/components/ui/Form';
import { Slider } from '@/components/ui/Slider';
import { PageFooter } from '@/components/layout/PageFooter';
import { BRAND } from '@/config/brand';
import { setLanguage } from '@/i18n';
import { useDialogs } from '@/stores/dialogs';
import { useUi } from '@/stores/ui';
import page from '../page.module.css';
import styles from './settings.module.css';

const QUALITIES: AudioQuality[] = ['automatic', 'low', 'normal', 'high', 'very_high', 'lossless'];
const PREMIUM_QUALITIES: AudioQuality[] = ['very_high', 'lossless'];

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className={styles.row}>
      <div className={styles.label}>
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
      <div className={styles.control}>{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const me = useMe();
  const update = useUpdateSettings();
  const profile = useUpdateProfile();
  const setLibraryView = useUi((s) => s.setLibraryView);
  const libraryView = useUi((s) => s.libraryView);

  if (!me) {
    return (
      <div className={page.empty}>
        <h2>{t('settings.title')}</h2>
        <Link to="/login?continue=/preferences"><Button variant="white">{t('nav.logIn')}</Button></Link>
      </div>
    );
  }
  const s = me.settings;
  const premium = me.product === 'premium';
  const set = (patch: Partial<UserSettings>) => update.mutate(patch);
  const toggle = (key: keyof UserSettings, label: string, extra?: (v: boolean) => void, disabled?: boolean) => (
    <Row label={label}>
      <Toggle
        label={label}
        checked={Boolean(s[key])}
        disabled={disabled}
        onChange={(v) => {
          set({ [key]: v } as Partial<UserSettings>);
          extra?.(v);
        }}
      />
    </Row>
  );

  return (
    <div className={page.page}>
      <div className={styles.settings}>
        <h1 className={styles.title}>{t('settings.title')}</h1>

        <section className={styles.section}>
          <h2>{t('settings.account')}</h2>
          <Row label={t('settings.accountRow')}>
            <Link to="/account">
              <Button variant="outline" size="sm">{t('settings.editAccount')}</Button>
            </Link>
          </Row>
        </section>

        <section className={styles.section}>
          <h2>{t('settings.language')}</h2>
          <Row label={t('settings.languageRow')}>
            <SelectField
              className={styles.select}
              aria-label={t('settings.languageRow')}
              value={i18n.language === 'en' ? 'en' : 'vi'}
              onChange={(e) => {
                const lang = e.target.value as 'vi' | 'en';
                setLanguage(lang);
                profile.mutate({ locale: lang });
              }}
              options={[
                { value: 'vi', label: 'Tiếng Việt (Vietnamese)' },
                { value: 'en', label: 'English (English)' },
              ]}
            />
          </Row>
        </section>

        <section className={styles.section}>
          <h2>{t('settings.audioQuality')}</h2>
          <Row label={t('settings.streaming')} hint={t('settings.qualityNote')}>
            <SelectField
              className={styles.select}
              aria-label={t('settings.streaming')}
              value={s.audioQuality}
              onChange={(e) => set({ audioQuality: e.target.value as AudioQuality })}
              options={QUALITIES.map((q) => ({
                value: q,
                label: `${t(`settings.qualities.${q}`)}${!premium && PREMIUM_QUALITIES.includes(q) ? ` (${t('settings.premiumOnly')})` : ''}`,
              }))}
            />
          </Row>
          {toggle('normalizeVolume', t('settings.normalize'))}
        </section>

        <section className={styles.section}>
          <h2>{t('settings.library')}</h2>
          <Row label={t('settings.compactLibrary')}>
            <Toggle
              label={t('settings.compactLibrary')}
              checked={libraryView === 'compact'}
              onChange={(v) => {
                setLibraryView(v ? 'compact' : 'list');
                set({ compactLibrary: v });
              }}
            />
          </Row>
        </section>

        <section className={styles.section}>
          <h2>{t('settings.display')}</h2>
          {toggle('showNowPlayingOnPlay', t('settings.showNpv'))}
        </section>

        <section className={styles.section}>
          <h2>{t('settings.social')}</h2>
          {toggle('privateSession', t('settings.privateSession'))}
          {toggle('shareListeningActivity', t('settings.shareActivity', { app: BRAND.name }))}
          {toggle('showRecentArtistsOnProfile', t('settings.recentArtists'))}
          {toggle('showFollowsOnProfile', t('settings.showFollows'))}
          {toggle('showPlaylistsOnProfile', t('settings.showPlaylists'))}
          {toggle('publishNewPlaylists', t('settings.publishPlaylists'))}
        </section>

        <section className={styles.section}>
          <h2>{t('settings.playback')}</h2>
          <Row label={t('settings.crossfade')}>
            <div className={styles.crossfade}>
              <Toggle label={t('settings.crossfade')} checked={s.crossfadeSec > 0} onChange={(v) => set({ crossfadeSec: v ? 5 : 0 })} />
            </div>
          </Row>
          {s.crossfadeSec > 0 && (
            <div className={styles.sliderRow}>
              <span>0 s</span>
              <div className={styles.slider}>
                <Slider
                  value={s.crossfadeSec}
                  max={12}
                  step={1}
                  label={t('settings.crossfade')}
                  valueText={t('settings.seconds', { count: s.crossfadeSec })}
                  onCommit={(v) => set({ crossfadeSec: Math.max(1, Math.round(v)) })}
                />
              </div>
              <span>{t('settings.seconds', { count: s.crossfadeSec })}</span>
            </div>
          )}
          {toggle('automix', t('settings.automix'))}
          {toggle('autoplay', t('settings.autoplay'))}
        </section>

        <section className={styles.section}>
          <h2>{t('settings.explicit')}</h2>
          {toggle('allowExplicit', t('settings.allowExplicit'))}
        </section>

        <section className={styles.section}>
          <h2>{t('settings.shortcuts')}</h2>
          <Row label={t('settings.showShortcuts')}>
            <Button variant="outline" size="sm" onClick={() => useDialogs.getState().openShortcuts(true)}>
              {t('settings.shortcuts')}
            </Button>
          </Row>
        </section>

        <section className={styles.section}>
          <h2>{t('settings.about')}</h2>
          <p className={styles.version}>
            {BRAND.name} — {t('settings.version', { version: '0.1.0' })}
          </p>
        </section>
      </div>
      <PageFooter />
    </div>
  );
}
