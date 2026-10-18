/** Account overview (spotify.com/account): your plan, cancel/resume, profile, order history. */
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import type { SubscriptionSummary } from '@contracts';
import { useUpdateProfile } from '@/api/mutations';
import { usePayments, useSession, useSubscription } from '@/api/queries';
import { Icon } from '@/components/icons/Icon';
import { Button } from '@/components/ui/Button';
import { Dialog, Spinner } from '@/components/ui/Dialog';
import { TextField } from '@/components/ui/Form';
import { BRAND } from '@/config/brand';
import { errorMessage, post } from '@/lib/api';
import { formatDate, formatVnd } from '@/lib/format';
import { textError } from '@/lib/validate';
import { toast } from '@/stores/toast';
import { SiteHeader } from './SiteHeader';
import styles from './premium.module.css';

function PlanSection({ sub }: { sub: SubscriptionSummary | null }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'vi' ? 'vi' : 'en';
  const qc = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const live = sub && (sub.status === 'active' || sub.status === 'past_due');

  const act = async (path: 'cancel' | 'resume') => {
    setBusy(true);
    try {
      const r = await post<{ subscription: SubscriptionSummary | null }>(`/me/subscription/${path}`);
      qc.setQueryData(['subscription'], r);
      void qc.invalidateQueries({ queryKey: ['session'] });
      void qc.invalidateQueries({ queryKey: ['plans'] });
      toast(path === 'cancel' ? t('account.canceled', { date: formatDate(r.subscription!.currentPeriodEnd, lang) }) : t('account.resumed'));
      setConfirmCancel(false);
    } catch (err) {
      toast(errorMessage(err));
    }
    setBusy(false);
  };

  if (!live) {
    return (
      <section className={styles.accountCard}>
        <h2 className={styles.cardLabel}>{t('account.yourPlan')}</h2>
        <div className={clsx(styles.planBanner, styles.planBannerFree)}>
          <strong>{t('account.freePlan', { app: BRAND.name })}</strong>
          <span>{t('account.freeBody')}</span>
        </div>
        <Link to="/premium" className={styles.heroCta}>{t('account.joinPremium')}</Link>
      </section>
    );
  }

  const recurring = sub.billingType === 'recurring';
  return (
    <section className={styles.accountCard}>
      <h2 className={styles.cardLabel}>{t('account.yourPlan')}</h2>
      <div className={styles.planBanner}>
        <strong>{sub.planName}</strong>
        <span className={styles.badges}>
          {sub.isIntro && <span className={styles.badge}>{t('account.intro')}</span>}
          {!recurring && <span className={styles.badge}>{t('account.prepaid')}</span>}
        </span>
      </div>
      <p className={styles.cardText}>
        {sub.status === 'past_due'
          ? t('account.pastDue', { date: formatDate(sub.graceUntil ?? sub.currentPeriodEnd, lang) })
          : sub.cancelAtPeriodEnd || !recurring
            ? t('account.endsOn', { date: formatDate(sub.currentPeriodEnd, lang) })
            : t('account.renews', { date: formatDate(sub.currentPeriodEnd, lang), price: formatVnd(sub.nextChargeAmount ?? 0) })}
      </p>
      <div className={styles.row}>
        {recurring && !sub.cancelAtPeriodEnd && (
          <Button variant="outline" onClick={() => setConfirmCancel(true)}>{t('account.cancel')}</Button>
        )}
        {recurring && sub.cancelAtPeriodEnd && (
          <Button variant="white" disabled={busy} onClick={() => void act('resume')}>{t('account.resume')}</Button>
        )}
        {!recurring && <Link to="/premium#one-time" className={styles.heroGhost}>{t('account.extend')}</Link>}
      </div>
      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel} title={t('account.cancelTitle')}>
        <p className={styles.cardText}>{t('account.cancelBody', { date: formatDate(sub.currentPeriodEnd, lang) })}</p>
        <div className={styles.dialogActions}>
          <Button variant="text" onClick={() => setConfirmCancel(false)}>{t('account.keep')}</Button>
          <Button variant="white" disabled={busy} onClick={() => void act('cancel')}>{t('account.confirmCancel')}</Button>
        </div>
      </Dialog>
    </section>
  );
}

export function AccountPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'vi' ? 'vi' : 'en';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const session = useSession();
  const me = session.data?.me ?? null;
  const sub = useSubscription(Boolean(me));
  const payments = usePayments(Boolean(me));
  const updateProfile = useUpdateProfile();
  const [name, setName] = useState('');

  useEffect(() => {
    document.title = `${t('account.title')} – ${BRAND.name}`;
  }, [t]);
  useEffect(() => {
    if (me) setName(me.displayName);
  }, [me]);
  useEffect(() => {
    if (!session.isLoading && !me) navigate('/login?continue=/account', { replace: true });
  }, [session.isLoading, me, navigate]);

  if (!me || sub.isLoading) {
    return (
      <div className={styles.site}>
        <SiteHeader />
        <div className={styles.centered}><Spinner /></div>
      </div>
    );
  }

  const nameError = name !== me.displayName ? textError(name, { max: 60 }) : '';
  const logout = async () => {
    await post('/auth/logout');
    qc.clear();
    window.location.assign('/');
  };

  return (
    <div className={styles.site}>
      <SiteHeader />
      <div className={styles.account}>
        <h1 className={styles.pageTitle}>{t('account.overview')}</h1>
        <PlanSection sub={sub.data?.subscription ?? null} />

        <section className={styles.accountCard}>
          <h2 className={styles.cardLabel}>{t('account.profile')}</h2>
          <form
            className={styles.profileForm}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (nameError) return;
              updateProfile.mutate(
                { displayName: name.trim() },
                { onSuccess: () => toast(t('account.profileSaved')), onError: (err) => toast(errorMessage(err)) },
              );
            }}
          >
            <TextField label={t('account.displayName')} value={name} maxLength={60} error={nameError} onChange={(e) => setName(e.target.value)} />
            <TextField label={t('account.email')} value={me.email ?? ''} readOnly disabled />
            <div className={styles.twoCols}>
              <TextField label={t('account.birthDate')} value={me.birthDate ? formatDate(me.birthDate, lang) : '—'} readOnly disabled />
              <TextField label={t('account.country')} value={me.country === 'VN' ? 'Việt Nam' : me.country} readOnly disabled />
            </div>
            <div>
              <Button type="submit" variant="white" disabled={Boolean(nameError) || name.trim() === me.displayName || updateProfile.isPending}>
                {t('account.saveProfile')}
              </Button>
            </div>
          </form>
        </section>

        <section className={styles.accountCard}>
          <h2 className={styles.cardLabel}>{t('account.payments')}</h2>
          {payments.data?.items.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.orders}>
                <thead>
                  <tr>
                    <th>{t('account.date')}</th>
                    <th>{t('account.description')}</th>
                    <th>{t('account.method')}</th>
                    <th>{t('account.amount')}</th>
                    <th>{t('account.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.data.items.map((p) => (
                    <tr key={p.id}>
                      <td>{formatDate(p.createdAt, lang)}</td>
                      <td>{p.description}</td>
                      <td>{p.cardBrand ? `${p.cardBrand.toUpperCase()} •••• ${p.cardLast4}` : '—'}</td>
                      <td>{formatVnd(p.amount)}</td>
                      <td>
                        <span className={clsx(styles.status, styles[`st_${p.status}`])}>{t(`account.statuses.${p.status}`)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.muted}>{t('account.noPayments')}</p>
          )}
        </section>

        <section className={styles.accountCard}>
          <h2 className={styles.cardLabel}>{t('account.security')}</h2>
          <nav className={styles.accountLinks}>
            <Link to="/preferences"><Icon name="settings" size={20} /> {t('account.appSettings')} <Icon name="chevronRight" size={16} /></Link>
            <Link to="/password-reset"><Icon name="lock" size={20} /> {t('account.changePassword')} <Icon name="chevronRight" size={16} /></Link>
            <button type="button" onClick={() => void logout()}><Icon name="logOut" size={20} /> {t('account.logOut')} <Icon name="chevronRight" size={16} /></button>
          </nav>
        </section>
      </div>
    </div>
  );
}
