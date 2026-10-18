/**
 * Sign up — Spotify's 4-screen flow: email → password (live checklist) → about you → terms.
 * Every rule (password, minimum age, genders) comes from GET /auth/policy, so the backend stays the
 * single source of truth and re-validates everything on submit.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import type { Me } from '@contracts';
import { useAuthPolicy, useMe } from '@/api/queries';
import { Icon } from '@/components/icons/Icon';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Dialog';
import { Checkbox, FieldError, RadioGroup, SelectField, TextField } from '@/components/ui/Form';
import { BRAND } from '@/config/brand';
import { ApiError, errorMessage, post } from '@/lib/api';
import { AuthBanner, AuthLayout, continueTo, Divider, EMAIL_RE, PasswordRules, ProviderButtons } from './AuthLayout';
import styles from './auth.module.css';

type Step = 0 | 1 | 2 | 3 | 'confirm';

function ageOn(y: number, m: number, d: number, today = new Date()) {
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1;
  return age;
}

export function SignupPage() {
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams();
  const me = useMe();
  const policy = useAuthPolicy();
  const next = continueTo(params);
  const [step, setStep] = useState<Step>(0);
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [gender, setGender] = useState<string | null>(null);
  const [noMarketing, setNoMarketing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<React.ReactNode>(null);
  const [busy, setBusy] = useState(false);
  // Fixing a field hides its error right away (like Spotify), the rest stay until the next submit.
  const clearError = (field: string) => setErrors((prev) => (prev[field] ? { ...prev, [field]: '' } : prev));

  useEffect(() => {
    document.title = `${t('auth.signUp')} – ${BRAND.name}`;
  }, [t]);
  useEffect(() => {
    if (me) window.location.replace(next);
  }, [me, next]);

  const months = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: new Intl.DateTimeFormat(i18n.language === 'vi' ? 'vi-VN' : 'en-US', { month: 'long' }).format(new Date(2000, i, 1)) })),
    [i18n.language],
  );

  if (!policy.data) {
    return (
      <AuthLayout>
        <Spinner />
      </AuthLayout>
    );
  }
  const rules = policy.data.passwordRules;
  const passwordOk = rules.every((r) => new RegExp(r.pattern).test(password));

  const submitEmail = async (e: FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setErrors({ email: t('auth.invalidEmail') });
      return;
    }
    setBusy(true);
    try {
      const { exists } = await post<{ exists: boolean }>('/auth/email-status', { email: value });
      if (exists) {
        setErrors({
          email: '',
        });
        setBanner(
          <>
            {t('auth.emailTaken')} <Link className={styles.link} to={`/login?email=${encodeURIComponent(value)}`}>{t('auth.logIn').toLowerCase()}</Link>.
          </>,
        );
      } else {
        setErrors({});
        setBanner(null);
        setStep(1);
      }
    } catch (err) {
      setBanner(errorMessage(err));
    }
    setBusy(false);
  };

  const submitPassword = (e: FormEvent) => {
    e.preventDefault();
    if (passwordOk) setStep(2);
  };

  const submitProfile = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = t('auth.required');
    const d = Number(day);
    const m = Number(month);
    const y = Number(year);
    const date = new Date(y, m - 1, d);
    const valid = y > 1900 && y <= new Date().getFullYear() && m >= 1 && m <= 12 && d >= 1 && date.getDate() === d && date.getMonth() === m - 1;
    if (!valid) errs.dob = t('auth.invalidDate');
    else if (ageOn(y, m, d) < policy.data!.minAge) errs.dob = t('auth.tooYoung', { age: policy.data!.minAge, app: BRAND.name });
    if (!gender) errs.gender = t('auth.chooseGender');
    setErrors(errs);
    if (!Object.keys(errs).length) setStep(3);
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setBanner(null);
    try {
      const birthDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      const res = await post<{ me?: Me; needsEmailConfirmation?: boolean }>('/auth/signup', {
        email: email.trim(),
        password,
        displayName: name.trim(),
        birthDate,
        gender,
        marketingOptIn: !noMarketing,
        locale: i18n.language === 'en' ? 'en' : 'vi',
      });
      if (res.needsEmailConfirmation) setStep('confirm');
      else window.location.assign(next);
    } catch (err) {
      // Send the user back to the screen that can fix the problem.
      if (err instanceof ApiError && err.code === 'weak_password') setStep(1);
      if (err instanceof ApiError && err.code === 'too_young') setStep(2);
      if (err instanceof ApiError && (err.code === 'user_already_exists' || err.code === 'email_exists')) setStep(0);
      setBanner(errorMessage(err));
    }
    setBusy(false);
  };

  const header = (n: 1 | 2 | 3, title: string) => (
    <div className={styles.stepHeader}>
      <button type="button" className={styles.back} onClick={() => setStep((n - 1) as Step)} aria-label={t('nav.back')}>
        <Icon name="arrowLeft" size={20} />
      </button>
      <div>
        <div className={styles.stepLabel}>{t('auth.step', { n, total: 3 })}</div>
        <div className={styles.stepTitle}>{title}</div>
      </div>
    </div>
  );

  if (step === 'confirm') {
    return (
      <AuthLayout>
        <div className={styles.success}>
          <span className={styles.successIcon}>
            <Icon name="mail" size={28} />
          </span>
          <h1 className={styles.stepTitle} style={{ fontSize: '1.5rem' }}>{t('auth.checkEmail')}</h1>
          <p className={styles.hint}>{t('auth.checkEmailBody', { email })}</p>
          <Link to="/login" className={styles.textButton}>{t('auth.backToLogin')}</Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout progress={step === 0 ? undefined : step / 3}>
      {step === 0 && (
        <>
          <h1 className={styles.title}>{t('auth.signupTitle')}</h1>
          <AuthBanner>{banner}</AuthBanner>
          <form onSubmit={submitEmail} className={styles.column} noValidate>
            <TextField
              label={t('auth.emailAddress')}
              type="email"
              autoComplete="email"
              placeholder="name@domain.com"
              value={email}
              maxLength={254}
              error={errors.email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
            <Button type="submit" className={styles.submit} disabled={busy} data-testid="submit">
              {t('auth.next')}
            </Button>
          </form>
          <Divider />
          <ProviderButtons
            enabled={policy.data.oauthProviders}
            labels={{ google: t('auth.signUpWithGoogle'), facebook: t('auth.continueWithFacebook'), apple: t('auth.continueWithApple') }}
          />
          <p className={styles.alt}>
            {t('auth.haveAccount')} <Link to={`/login${params.toString() ? `?${params}` : ''}`}>{t('auth.logInHere')}</Link>
          </p>
        </>
      )}

      {step === 1 && (
        <form onSubmit={submitPassword} className={styles.column}>
          {header(1, t('auth.createPassword'))}
          <AuthBanner>{banner}</AuthBanner>
          <input type="email" autoComplete="username" value={email} readOnly hidden />
          <TextField label={t('auth.password')} type="password" autoComplete="new-password" value={password} maxLength={72} onChange={(e) => setPassword(e.target.value)} autoFocus />
          <PasswordRules password={password} rules={rules} />
          <Button type="submit" className={styles.submit} disabled={!passwordOk}>
            {t('auth.next')}
          </Button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={submitProfile} className={styles.column} noValidate>
          {header(2, t('auth.tellUs'))}
          <AuthBanner>{banner}</AuthBanner>
          <TextField label={t('auth.name')} hint={t('auth.nameHint')} value={name} maxLength={60} error={errors.name} onChange={(e) => { setName(e.target.value); clearError('name'); }} autoComplete="name" autoFocus />
          <fieldset className={styles.column} style={{ gap: 8 }}>
            <legend className={styles.legend}>{t('auth.birthDate')}</legend>
            <p className={styles.hint}>{t('auth.birthHint')}</p>
            <div className={styles.dob}>
              <TextField aria-label={t('auth.dayLabel')} placeholder={t('auth.day')} inputMode="numeric" maxLength={2} value={day} onChange={(e) => { setDay(e.target.value.replace(/\D/g, '')); clearError('dob'); }} autoComplete="bday-day" />
              <SelectField aria-label={t('auth.month')} value={month} onChange={(e) => { setMonth(e.target.value); clearError('dob'); }} options={[{ value: '', label: t('auth.month') }, ...months]} autoComplete="bday-month" />
              <TextField aria-label={t('auth.yearLabel')} placeholder={t('auth.year')} inputMode="numeric" maxLength={4} value={year} onChange={(e) => { setYear(e.target.value.replace(/\D/g, '')); clearError('dob'); }} autoComplete="bday-year" />
            </div>
            <FieldError>{errors.dob}</FieldError>
          </fieldset>
          <fieldset className={styles.column} style={{ gap: 8 }}>
            <legend className={styles.legend}>{t('auth.gender')}</legend>
            <p className={styles.hint}>{t('auth.genderHint')}</p>
            <RadioGroup
              name="gender"
              value={gender}
              onChange={(g) => {
                setGender(g);
                clearError('gender');
              }}
              options={policy.data.genders.map((g) => ({ value: g, label: t(`auth.genders.${g}`) }))}
            />
            <FieldError>{errors.gender}</FieldError>
          </fieldset>
          <Button type="submit" className={styles.submit}>
            {t('auth.next')}
          </Button>
        </form>
      )}

      {step === 3 && (
        <form onSubmit={create} className={styles.column}>
          {header(3, t('auth.terms'))}
          <AuthBanner>{banner}</AuthBanner>
          <Checkbox checked={noMarketing} onChange={setNoMarketing}>
            {t('auth.noMarketing', { app: BRAND.name })}
          </Checkbox>
          <p className={styles.legal}>{t('auth.agreeTerms', { app: BRAND.name })}</p>
          <p className={styles.legal}>{t('auth.privacy', { app: BRAND.name })}</p>
          <Button type="submit" className={styles.submit} disabled={busy}>
            {busy ? '…' : t('auth.createAccount')}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
