/**
 * Password reset, in two halves:
 *  1. logged out → enter your email → we email a link (same answer whether the account exists or not);
 *  2. the link logs you in (/api/auth/callback) and lands here → choose a new password.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useAuthPolicy, useSession } from '@/api/queries';
import { Icon } from '@/components/icons/Icon';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Dialog';
import { TextField } from '@/components/ui/Form';
import { BRAND } from '@/config/brand';
import { errorMessage, post } from '@/lib/api';
import { toast } from '@/stores/toast';
import { AuthBanner, AuthLayout, EMAIL_RE, PasswordRules } from './AuthLayout';
import styles from './auth.module.css';

export function PasswordResetPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const session = useSession();
  const policy = useAuthPolicy();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = `${t('auth.resetTitle')} – ${BRAND.name}`;
  }, [t]);

  if (session.isLoading || !policy.data) {
    return (
      <AuthLayout>
        <Spinner />
      </AuthLayout>
    );
  }
  const me = session.data?.me ?? null;

  const requestLink = async (e: FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) {
      setError(t('auth.invalidEmail'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await post('/auth/password/forgot', { email: email.trim() });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  };

  const rules = policy.data.passwordRules;
  const ok = rules.every((r) => new RegExp(r.pattern).test(password));
  const update = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await post('/auth/password/update', { password });
      toast(t('auth.passwordUpdated'));
      navigate('/');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  if (me) {
    return (
      <AuthLayout>
        <h1 className={styles.title} style={{ fontSize: '2rem' }}>{t('auth.newPassword')}</h1>
        <AuthBanner>{error}</AuthBanner>
        <form onSubmit={update} className={styles.column}>
          <input type="email" autoComplete="username" value={me.email ?? ''} readOnly hidden />
          <TextField label={t('auth.newPassword')} type="password" autoComplete="new-password" value={password} maxLength={72} onChange={(e) => setPassword(e.target.value)} autoFocus />
          <PasswordRules password={password} rules={rules} />
          <Button type="submit" className={styles.submit} disabled={!ok || busy}>
            {t('auth.setPassword')}
          </Button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1 className={styles.title} style={{ fontSize: '2rem' }}>{t('auth.resetTitle')}</h1>
      {sent ? (
        <div className={styles.success}>
          <span className={styles.successIcon}>
            <Icon name="mail" size={28} />
          </span>
          <p className={styles.hint}>{t('auth.linkSent')}</p>
          <Link to="/login" className={styles.textButton}>{t('auth.backToLogin')}</Link>
        </div>
      ) : (
        <form onSubmit={requestLink} className={styles.column} noValidate>
          <p className={styles.hint} style={{ textAlign: 'center' }}>{t('auth.resetBody', { app: BRAND.name })}</p>
          <AuthBanner>{error}</AuthBanner>
          <TextField label={t('auth.email')} type="email" autoComplete="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} autoFocus />
          <Button type="submit" className={styles.submit} disabled={busy}>
            {t('auth.sendLink')}
          </Button>
          <Link to="/login" className={styles.textButton}>{t('auth.backToLogin')}</Link>
        </form>
      )}
    </AuthLayout>
  );
}
