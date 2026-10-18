/**
 * Log in — Spotify's current flow: email first, then either a password or a one-time code by email.
 * The backend (BFF) talks to Supabase Auth and sets httpOnly cookies; the page never sees a token.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import type { Me } from '@contracts';
import { useAuthPolicy, useMe } from '@/api/queries';
import { Icon } from '@/components/icons/Icon';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Form';
import { errorMessage, post } from '@/lib/api';
import { toast } from '@/stores/toast';
import { AuthBanner, AuthLayout, CodeInput, continueTo, Divider, EMAIL_RE, ProviderButtons } from './AuthLayout';
import styles from './auth.module.css';

type Step = 'email' | 'password' | 'code';

export function LoginPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const me = useMe();
  const policy = useAuthPolicy();
  const next = continueTo(params);
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [emailError, setEmailError] = useState('');
  const [error, setError] = useState(() => (params.get('error') ? t(`errors.${params.get('error')}`, { defaultValue: t('auth.oauthFailed') }) : ''));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = `${t('auth.logIn')} – Melodify`;
  }, [t]);

  // Already logged in (e.g. pressed Back): go straight to where they wanted to be.
  useEffect(() => {
    if (me) window.location.replace(next);
  }, [me, next]);

  // A full page load after logging in resets the player, socket and caches cleanly for the new user.
  const finish = (_: { me: Me }) => window.location.assign(next);

  const submitEmail = (e: FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError(t('auth.invalidEmail'));
      return;
    }
    setEmailError('');
    setError('');
    setStep('password');
  };

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      finish(await post<{ me: Me }>('/auth/login', { email: email.trim(), password }));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const sendCode = async (resend = false) => {
    setBusy(true);
    setError('');
    try {
      await post('/auth/otp/send', { email: email.trim() });
      setStep('code');
      setCode('');
      if (resend) toast(t('auth.codeSent'));
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  };

  const submitCode = async (e?: FormEvent) => {
    e?.preventDefault();
    if (code.length !== 6) return;
    setBusy(true);
    setError('');
    try {
      finish(await post<{ me: Me }>('/auth/otp/verify', { email: email.trim(), token: code }));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  // Submit automatically once the 6th digit is typed.
  useEffect(() => {
    if (step === 'code' && code.length === 6 && !busy) void submitCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const emailChip = (
    <div className={styles.emailChip}>
      <span>{email}</span>
      <button type="button" onClick={() => setStep('email')}>{t('auth.change')}</button>
    </div>
  );

  return (
    <AuthLayout>
      {step === 'email' && (
        <>
          <h1 className={styles.title}>{t('auth.welcomeBack')}</h1>
          <AuthBanner>{error}</AuthBanner>
          <form onSubmit={submitEmail} className={styles.column} noValidate>
            <TextField
              label={t('auth.email')}
              type="email"
              autoComplete="username"
              placeholder="name@domain.com"
              value={email}
              maxLength={254}
              error={emailError}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              data-testid="login-username"
            />
            <Button type="submit" className={styles.submit} data-testid="login-button">
              {t('auth.continue')}
            </Button>
          </form>
          <Divider />
          <ProviderButtons
            enabled={policy.data?.oauthProviders ?? []}
            labels={{ google: t('auth.continueWithGoogle'), facebook: t('auth.continueWithFacebook'), apple: t('auth.continueWithApple') }}
          />
          <p className={styles.alt}>
            {t('auth.noAccount')}{' '}
            <Link to={`/signup${params.toString() ? `?${params}` : ''}`} data-testid="signup-btn-link">{t('auth.signUp')}</Link>
          </p>
        </>
      )}

      {step === 'password' && (
        <>
          <h1 className={styles.title}>{t('auth.logIn')}</h1>
          <AuthBanner>{error}</AuthBanner>
          {emailChip}
          <form onSubmit={submitPassword} className={styles.column}>
            <input type="email" autoComplete="username" value={email} readOnly hidden />
            <TextField
              label={t('auth.password')}
              type="password"
              autoComplete="current-password"
              value={password}
              maxLength={72}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              data-testid="login-password"
            />
            <Button type="submit" className={styles.submit} disabled={!password || busy}>
              {busy ? '…' : t('auth.logIn')}
            </Button>
          </form>
          <button type="button" className={styles.textButton} onClick={() => void sendCode()} disabled={busy}>
            {t('auth.logInWithCode')}
          </button>
          <Link to={`/password-reset?email=${encodeURIComponent(email)}`} className={styles.textButton}>
            {t('auth.forgot')}
          </Link>
        </>
      )}

      {step === 'code' && (
        <form onSubmit={submitCode} className={styles.column}>
          <div className={styles.stepHeader}>
            <button type="button" className={styles.back} onClick={() => setStep('password')} aria-label={t('nav.back')}>
              <Icon name="arrowLeft" size={20} />
            </button>
          </div>
          <h1 className={styles.stepTitle} style={{ fontSize: '1.5rem' }}>{t('auth.codeTitle', { email })}</h1>
          <AuthBanner>{error}</AuthBanner>
          <CodeInput value={code} onChange={setCode} invalid={Boolean(error)} />
          <Button type="submit" className={styles.submit} disabled={code.length !== 6 || busy}>
            {t('auth.logIn')}
          </Button>
          <button type="button" className={styles.textButton} onClick={() => void sendCode(true)} disabled={busy}>
            {t('auth.resend')}
          </button>
          <button type="button" className={styles.textButton} onClick={() => setStep('password')}>
            {t('auth.logInWithPassword')}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
