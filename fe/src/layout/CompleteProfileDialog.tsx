/**
 * "Tell us about yourself" for accounts created with Google / Facebook / Apple: those providers don't
 * share a birthday or gender, and the app needs both (minimum age, like the sign-up form). Shown once,
 * right after the first social log-in, and can't be skipped.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Me } from '@contracts';
import { qk, useAuthPolicy, useMe } from '@/api/queries';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { FieldError, RadioGroup, SelectField, TextField } from '@/components/ui/Form';
import { BRAND } from '@/config/brand';
import { ApiError, errorMessage, post, put } from '@/lib/api';
import { textError } from '@/lib/validate';
import auth from '@/pages/auth/auth.module.css';
import styles from './dialogs.module.css';

function ageOn(y: number, m: number, d: number, today = new Date()) {
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1;
  return age;
}

export function CompleteProfileDialog() {
  const me = useMe();
  const policy = useAuthPolicy();
  if (!me || me.birthDate || !policy.data) return null;
  return <CompleteProfileForm me={me} minAge={policy.data.minAge} genders={policy.data.genders} />;
}

function CompleteProfileForm({ me, minAge, genders }: { me: Me; minAge: number; genders: string[] }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState(me.displayName);
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [gender, setGender] = useState<string | null>(me.gender);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState('');
  const [tooYoung, setTooYoung] = useState(false);

  const months = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: new Intl.DateTimeFormat(i18n.language === 'vi' ? 'vi-VN' : 'en-US', { month: 'long' }).format(new Date(2000, i, 1)) })),
    [i18n.language],
  );

  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  const date = new Date(y, m - 1, d);
  const realDate = y >= 1900 && y <= new Date().getFullYear() && m >= 1 && d >= 1 && date.getDate() === d && date.getMonth() === m - 1;
  const errors = {
    name: textError(name, { max: 60 }),
    dob: !realDate ? t('auth.invalidDate') : ageOn(y, m, d) < minAge ? t('auth.tooYoung', { age: minAge, app: BRAND.name }) : '',
    gender: gender ? '' : t('auth.chooseGender'),
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    setServerError('');
    if (errors.name || errors.dob || errors.gender) {
      if (realDate && ageOn(y, m, d) < minAge) setTooYoung(true);
      return;
    }
    setBusy(true);
    try {
      const next = await put<Me>('/me/details', {
        displayName: name.trim(),
        birthDate: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
        gender,
      });
      qc.setQueryData(qk.session, { me: next });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'too_young') setTooYoung(true);
      setServerError(errorMessage(err));
    }
    setBusy(false);
  };

  const logout = async () => {
    await post('/auth/logout');
    qc.clear();
    window.location.assign('/');
  };

  return (
    <Dialog open onOpenChange={() => {}} title={t('auth.tellUs')} hideClose className={styles.report}>
      <form onSubmit={submit} className={styles.promptForm} noValidate>
        <p className={styles.muted}>{t('auth.completeBody', { app: BRAND.name })}</p>
        <TextField label={t('auth.name')} hint={t('auth.nameHint')} value={name} maxLength={60} error={tried ? errors.name : ''} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        <fieldset className={auth.column} style={{ gap: 8 }}>
          <legend className={auth.legend}>{t('auth.birthDate')}</legend>
          <div className={auth.dob}>
            <TextField aria-label={t('auth.dayLabel')} placeholder={t('auth.day')} inputMode="numeric" maxLength={2} value={day} onChange={(e) => setDay(e.target.value.replace(/\D/g, ''))} autoComplete="bday-day" />
            <SelectField aria-label={t('auth.month')} value={month} onChange={(e) => setMonth(e.target.value)} options={[{ value: '', label: t('auth.month') }, ...months]} autoComplete="bday-month" />
            <TextField aria-label={t('auth.yearLabel')} placeholder={t('auth.year')} inputMode="numeric" maxLength={4} value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))} autoComplete="bday-year" />
          </div>
          <FieldError>{tried ? errors.dob : ''}</FieldError>
        </fieldset>
        <fieldset className={auth.column} style={{ gap: 8 }}>
          <legend className={auth.legend}>{t('auth.gender')}</legend>
          <RadioGroup name="complete-gender" value={gender} onChange={setGender} options={genders.map((g) => ({ value: g, label: t(`auth.genders.${g}`) }))} />
          <FieldError>{tried ? errors.gender : ''}</FieldError>
        </fieldset>
        <FieldError>{serverError}</FieldError>
        <div className={styles.footer}>
          {tooYoung && (
            <Button variant="text" type="button" onClick={() => void logout()}>
              {t('userMenu.logOut')}
            </Button>
          )}
          <Button variant="primary" type="submit" disabled={busy}>
            {t('auth.finish')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
