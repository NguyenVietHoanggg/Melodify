/**
 * Shared frame of the accounts pages (log in, sign up, password reset), measured on accounts.spotify.com:
 * a dark card centred on a soft gradient, logo on top, a 324px content column.
 */
import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { LogoMark } from '@/components/brand/Logo';
import { BackHomeButton } from '@/components/nav/BackHome';
import { Icon, ProviderLogo } from '@/components/icons/Icon';
import { toast } from '@/stores/toast';
import styles from './auth.module.css';

export function AuthLayout({ children, progress, wide }: { children: ReactNode; progress?: number; wide?: boolean }) {
  return (
    <div className={styles.page}>
      <BackHomeButton className={styles.backHome} />
      <main className={clsx(styles.card, wide && styles.wide)}>
        {progress !== undefined && (
          <div className={styles.progress} aria-hidden>
            <span style={{ width: `${progress * 100}%` }} />
          </div>
        )}
        <Link to="/" className={styles.logo} aria-label="Home">
          <LogoMark size={40} />
        </Link>
        <div className={styles.column}>{children}</div>
      </main>
    </div>
  );
}

/** Red banner at the top of the form, like Spotify's "Incorrect username or password." */
export function AuthBanner({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className={styles.banner} role="alert">
      <Icon name="warning" size={20} />
      <span>{children}</span>
    </div>
  );
}

export function Divider() {
  const { t } = useTranslation();
  return (
    <div className={styles.divider}>
      <span>{t('auth.or')}</span>
    </div>
  );
}

/**
 * "Continue with Google / Facebook / Apple". Providers must be enabled in Supabase AND listed in
 * OAUTH_PROVIDERS (be/.env); others stay visible (like Spotify) but explain they're not available yet.
 */
export function ProviderButtons({ enabled, labels }: { enabled: string[]; labels: Record<'google' | 'facebook' | 'apple', string> }) {
  const { t } = useTranslation();
  const go = (p: 'google' | 'facebook' | 'apple') => {
    if (!enabled.includes(p)) {
      toast(t('errors.oauth_unavailable'));
      return;
    }
    window.location.assign(`/api/auth/oauth/${p}`);
  };
  return (
    <div className={styles.providers}>
      {(['google', 'facebook', 'apple'] as const).map((p) => (
        <button key={p} type="button" className={styles.providerButton} onClick={() => go(p)}>
          <span className={styles.providerLogo}>
            <ProviderLogo provider={p} />
          </span>
          {labels[p]}
        </button>
      ))}
    </div>
  );
}

/** Six boxes for a one-time code; typing, backspace and pasting all work. */
export function CodeInput({ value, onChange, length = 6, invalid }: { value: string; onChange: (v: string) => void; length?: number; invalid?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [focus, setFocus] = useState(0);
  useEffect(() => refs.current[0]?.focus(), []);
  const set = (i: number, digit: string) => {
    const chars = value.padEnd(length, ' ').split('');
    chars[i] = digit || ' ';
    onChange(chars.join('').replace(/\s+$/, ''));
  };
  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < length - 1) refs.current[i + 1]?.focus();
  };
  const onPaste = (e: ClipboardEvent) => {
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!digits) return;
    e.preventDefault();
    onChange(digits);
    refs.current[Math.min(digits.length, length - 1)]?.focus();
  };
  return (
    <div className={styles.code} onPaste={onPaste}>
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className={clsx(styles.codeBox, invalid && styles.codeInvalid, focus === i && styles.codeFocus)}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={value[i]?.trim() ?? ''}
          aria-label={`Digit ${i + 1}`}
          onFocus={() => setFocus(i)}
          onKeyDown={(e) => onKey(i, e)}
          onChange={(e) => {
            const d = e.target.value.replace(/\D/g, '').slice(-1);
            set(i, d);
            if (d && i < length - 1) refs.current[i + 1]?.focus();
          }}
        />
      ))}
    </div>
  );
}

/** Live password checklist driven by the rules the backend publishes (GET /auth/policy). */
export function PasswordRules({ password, rules }: { password: string; rules: { id: string; pattern: string }[] }) {
  const { t } = useTranslation();
  return (
    <div className={styles.rules}>
      <p className={styles.rulesTitle}>{t('auth.passwordMust')}</p>
      <ul>
        {rules.map((r) => {
          const ok = new RegExp(r.pattern).test(password);
          return (
            <li key={r.id} className={clsx(ok && styles.ruleOk)}>
              <span className={styles.ruleIcon}>{ok ? <Icon name="checkCircle" size={14} /> : <span className={styles.ruleCircle} />}</span>
              {t(`auth.rules.${r.id}`)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Where to go after logging in: ?continue=/premium (only same-site paths, never "//evil.com"). */
export function continueTo(params: URLSearchParams): string {
  const next = params.get('continue') ?? '/';
  return next.startsWith('/') && !next.startsWith('//') ? next : '/';
}
