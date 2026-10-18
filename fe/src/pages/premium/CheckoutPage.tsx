/**
 * Checkout for a plan (/checkout/individual) or a one-time option (/checkout/individual-3m).
 * Payments are SIMULATED by the backend's mock gateway (Luhn check, test cards, 3-D Secure OTP),
 * behind the same interface a real gateway (VNPay, MoMo, Stripe…) would implement later.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import type { CheckoutResult, SubscriptionSummary } from '@contracts';
import { usePlans, useSession } from '@/api/queries';
import { Icon } from '@/components/icons/Icon';
import { Button } from '@/components/ui/Button';
import { Dialog, Spinner } from '@/components/ui/Dialog';
import { TextField } from '@/components/ui/Form';
import { BRAND } from '@/config/brand';
import { errorMessage, post } from '@/lib/api';
import { formatDate, formatVnd } from '@/lib/format';
import { cardNameError, cardNumberError, cvcError, emailError, expiryError, textError } from '@/lib/validate';
import { AuthBanner, CodeInput } from '../auth/AuthLayout';
import { SiteHeader } from './SiteHeader';
import styles from './premium.module.css';

/** Display-only brand detection (the backend validates for real). */
function brandOf(n: string) {
  if (/^4/.test(n)) return 'VISA';
  if (/^(5[1-5]|2[2-7])/.test(n)) return 'Mastercard';
  if (/^3[47]/.test(n)) return 'AMEX';
  if (/^35/.test(n)) return 'JCB';
  if (/^9704/.test(n)) return 'NAPAS';
  return null;
}

const addMonths = (d: Date, n: number) => {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
};

export function CheckoutPage() {
  const { option = '' } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'vi' ? 'vi' : 'en';
  const qc = useQueryClient();
  const session = useSession();
  const me = session.data?.me ?? null;
  const plans = usePlans();
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState<{ paymentId: string; code: string } | null>(null);
  const [done, setDone] = useState<SubscriptionSummary | null>(null);
  const [student, setStudent] = useState({ school: '', email: '', verified: false });
  // A field shows its error once you leave it (or press the button) — not while you are still typing.
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const leave = (field: string) => () => setTouched((x) => ({ ...x, [field]: true }));

  useEffect(() => {
    document.title = `${t('checkout.title')} – ${BRAND.name}`;
  }, [t]);

  const data = plans.data;
  const plan = data?.plans.find((p) => p.id === option);
  const prepaid = data?.prepaid.find((o) => o.id === option);
  const planFor = plan ?? data?.plans.find((p) => p.id === prepaid?.planId);
  const intro = Boolean(plan && data?.introEligible && plan.introMonths > 0 && plan.introPrice != null);
  const amount = plan ? (intro ? plan.introPrice! : plan.monthlyPrice) : (prepaid?.price ?? 0);
  const periodEnd = useMemo(() => {
    const base = data?.current && data.current.status !== 'expired' ? new Date(data.current.currentPeriodEnd) : new Date();
    return prepaid ? addMonths(base, prepaid.months) : addMonths(new Date(), intro ? plan!.introMonths : 1);
  }, [data, prepaid, plan, intro]);

  if (session.isLoading || plans.isLoading) {
    return (
      <div className={styles.site}>
        <SiteHeader />
        <div className={styles.centered}><Spinner /></div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className={styles.site}>
        <SiteHeader />
        <div className={styles.narrow}>
          <h1 className={styles.pageTitle}>{t('checkout.loginToBuy')}</h1>
          <div className={styles.row}>
            <Link to={`/login?continue=/checkout/${option}`} className={styles.heroCta}>{t('nav.logIn')}</Link>
            <Link to={`/signup?continue=/checkout/${option}`} className={styles.heroGhost}>{t('nav.signUp')}</Link>
          </div>
        </div>
      </div>
    );
  }

  if (!planFor || (!plan && !prepaid)) {
    return (
      <div className={styles.site}>
        <SiteHeader />
        <div className={styles.narrow}>
          <h1 className={styles.pageTitle}>{t('notFound.title')}</h1>
          <Link to="/premium" className={styles.heroCta}>{t('premium.viewAll')}</Link>
        </div>
      </div>
    );
  }

  const finish = async (res: CheckoutResult) => {
    if (res.status === 'succeeded') {
      setOtp(null);
      setDone(res.subscription ?? null);
      for (const key of [['session'], ['plans'], ['subscription'], ['payments'], ['ai-status']]) void qc.invalidateQueries({ queryKey: key });
    } else if (res.status === 'requires_action') {
      setOtp({ paymentId: res.paymentId, code: '' });
    } else {
      setOtp(null);
      setError(t(`errors.${res.failureCode ?? 'card_declined'}`, { defaultValue: t('errors.card_declined') }));
    }
  };

  const pay = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.values(cardErrors).some(Boolean)) return;
    const [mm, yy] = expiry.split('/');
    setBusy(true);
    setError('');
    try {
      const res = await post<CheckoutResult>('/checkout', {
        ...(plan ? { planId: plan.id } : { prepaidOptionId: prepaid!.id }),
        card: { number, expMonth: Number(mm), expYear: 2000 + Number(yy), cvc, name },
        // A fresh key per attempt; the backend uses it so a double click can never charge twice.
        idempotencyKey: crypto.randomUUID(),
      });
      await finish(res);
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  };

  const confirm = async () => {
    if (!otp || otp.code.length !== 6) return;
    setBusy(true);
    try {
      await finish(await post<CheckoutResult>(`/checkout/${otp.paymentId}/confirm`, { otp: otp.code }));
    } catch (err) {
      setOtp({ ...otp, code: '' });
      setError(errorMessage(err));
    }
    setBusy(false);
  };

  const verifyStudent = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (studentErrors.school || studentErrors.email) return;
    setBusy(true);
    setError('');
    try {
      const r = await post<{ verified: boolean }>('/me/student-verification', { schoolName: student.school, studentEmail: student.email });
      if (r.verified) setStudent({ ...student, verified: true });
      else setError(t('errors.student_verification_required'));
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  };

  const planName = `Premium ${planFor.id === 'student' ? 'Student' : 'Individual'}`;
  const digits = number.replace(/\D/g, '');
  const brand = brandOf(digits);
  const cardErrors = { number: cardNumberError(number), expiry: expiryError(expiry), cvc: cvcError(cvc, number), name: cardNameError(name) };
  const studentErrors = { school: textError(student.school, { min: 2, max: 120 }), email: emailError(student.email) };
  const shown = (errors: Record<string, string>, field: string) => (submitted || touched[field] ? errors[field] : '');

  if (done) {
    return (
      <div className={styles.site}>
        <SiteHeader />
        <div className={`${styles.narrow} ${styles.successPage}`}>
          <span className={styles.successIcon}><Icon name="check" size={32} /></span>
          <h1 className={styles.pageTitle}>{t('checkout.successTitle')}</h1>
          <p className={styles.sectionBody}>{t('checkout.successBody', { plan: done.planName })}</p>
          <p className={styles.muted}>
            {done.billingType === 'prepaid' || done.cancelAtPeriodEnd
              ? t('account.endsOn', { date: formatDate(done.currentPeriodEnd, lang) })
              : t('account.renews', { date: formatDate(done.currentPeriodEnd, lang), price: formatVnd(done.nextChargeAmount ?? planFor.monthlyPrice) })}
          </p>
          <div className={styles.row}>
            <a href="/" className={styles.heroCta}>{t('checkout.startListening')}</a>
            <Link to="/account" className={styles.heroGhost}>{t('checkout.viewAccount')}</Link>
          </div>
        </div>
      </div>
    );
  }

  const needsStudent = planFor.requiresVerification === 'student' && !student.verified;

  return (
    <div className={styles.site}>
      <SiteHeader />
      <div className={styles.checkout}>
        <aside className={styles.summary} style={{ ['--plan-color' as string]: planFor.color ?? '#1ed760' }}>
          <h2 className={styles.summaryLabel}>{t('checkout.yourPlan')}</h2>
          <div className={styles.summaryCard}>
            <div className={styles.summaryHead}>
              <span className={styles.planLogo} />
              <div>
                <strong>{planName}</strong>
                <div className={styles.muted}>{prepaid ? `${t('premium.oneTime')} • ${t('premium.months', { count: prepaid.months })}` : t('premium.oneAccount')}</div>
              </div>
            </div>
            <dl className={styles.summaryLines}>
              <div>
                <dt>{t('checkout.dueToday')}</dt>
                <dd>{formatVnd(amount)}</dd>
              </div>
            </dl>
            <p className={styles.muted}>
              {prepaid
                ? t('checkout.prepaidUntil', { date: formatDate(periodEnd, lang) })
                : t('checkout.thenMonthly', { price: formatVnd(planFor.monthlyPrice), date: formatDate(periodEnd, lang) })}
            </p>
            <Link to="/premium#plans" className={styles.link}>{t('checkout.changePlan')}</Link>
          </div>
          {data?.current && (data.current.status === 'active' || data.current.status === 'past_due') && (
            <div className={styles.notice}>
              <Icon name="info" size={16} />
              <span>{t('checkout.alreadyPremiumBody', { date: formatDate(data.current.currentPeriodEnd, lang) })}</span>
            </div>
          )}
        </aside>

        <section className={styles.payment}>
          {needsStudent ? (
            <form onSubmit={verifyStudent} className={styles.form}>
              <h1 className={styles.formTitle}>
                <Icon name="school" size={24} /> {t('checkout.studentTitle')}
              </h1>
              <p className={styles.muted}>{t('checkout.studentBody')}</p>
              <AuthBanner>{error}</AuthBanner>
              <TextField
                label={t('checkout.school')}
                value={student.school}
                maxLength={120}
                error={shown(studentErrors, 'school')}
                onBlur={leave('school')}
                onChange={(e) => setStudent({ ...student, school: e.target.value })}
              />
              <TextField
                label={t('checkout.studentEmail')}
                type="email"
                placeholder="ten@truong.edu.vn"
                value={student.email}
                maxLength={254}
                error={shown(studentErrors, 'email')}
                onBlur={leave('email')}
                onChange={(e) => setStudent({ ...student, email: e.target.value })}
              />
              <Button type="submit" className={styles.payButton} disabled={busy}>
                {t('checkout.verify')}
              </Button>
            </form>
          ) : (
            <form onSubmit={pay} className={styles.form}>
              <h1 className={styles.formTitle}>{t('checkout.paymentMethod')}</h1>
              {planFor.requiresVerification && (
                <p className={styles.verified}>
                  <Icon name="checkCircle" size={16} /> {t('checkout.verified')}
                </p>
              )}
              <div className={styles.methodHead}>
                <Icon name="card" size={20} /> {t('checkout.card')}
                <span className={styles.brands}>
                  {['VISA', 'Mastercard', 'JCB', 'NAPAS'].map((b) => (
                    <span key={b} className={b === brand ? styles.brandOn : undefined}>{b}</span>
                  ))}
                </span>
              </div>
              <AuthBanner>{error}</AuthBanner>
              <TextField
                label={t('checkout.cardNumber')}
                inputMode="numeric"
                autoComplete="cc-number"
                placeholder="1234 5678 9012 3456"
                value={number}
                error={shown(cardErrors, 'number')}
                onBlur={leave('number')}
                onChange={(e) => setNumber(e.target.value.replace(/\D/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 '))}
              />
              <div className={styles.twoCols}>
                <TextField
                  label={t('checkout.expiry')}
                  inputMode="numeric"
                  autoComplete="cc-exp"
                  placeholder="MM/YY"
                  value={expiry}
                  error={shown(cardErrors, 'expiry')}
                  onBlur={leave('expiry')}
                  onChange={(e) => {
                    const d = e.target.value.replace(/\D/g, '').slice(0, 4);
                    setExpiry(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
                  }}
                />
                <TextField
                  label={t('checkout.cvc')}
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  placeholder="123"
                  value={cvc}
                  error={shown(cardErrors, 'cvc')}
                  onBlur={leave('cvc')}
                  onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                />
              </div>
              <TextField
                label={t('checkout.nameOnCard')}
                autoComplete="cc-name"
                value={name}
                maxLength={80}
                error={shown(cardErrors, 'name')}
                onBlur={leave('name')}
                onChange={(e) => setName(e.target.value)}
              />
              <details className={styles.testCards}>
                <summary>{t('checkout.testCards')}</summary>
                <ul>
                  <li><code>4242 4242 4242 4242</code> — {t('checkout.testSuccess')}</li>
                  <li><code>4000 0027 6000 3184</code> — {t('checkout.testOtp')}</li>
                  <li><code>4000 0000 0000 0002</code> — {t('checkout.testDeclined')}</li>
                  <li><code>9704 0000 0000 0018</code> — NAPAS</li>
                </ul>
              </details>
              <p className={styles.legal}>{plan ? t('checkout.agree', { app: BRAND.name }) : t('checkout.agreePrepaid', { app: BRAND.name })}</p>
              <Button type="submit" className={styles.payButton} disabled={busy}>
                {busy ? t('checkout.processing') : plan && intro ? t('checkout.startTrial') : t('checkout.buy')}
              </Button>
              <p className={styles.mockSmall}>
                <Icon name="lock" size={12} /> {t('premium.mockNotice')}
              </p>
            </form>
          )}
        </section>
      </div>

      <Dialog open={Boolean(otp)} onOpenChange={(o) => !o && setOtp(null)} title={t('checkout.otpTitle')} className={styles.otpDialog}>
        <p className={styles.muted}>{t('checkout.otpBody', { amount: formatVnd(amount) })}</p>
        <CodeInput value={otp?.code ?? ''} onChange={(code) => otp && setOtp({ ...otp, code })} />
        <Button className={styles.payButton} disabled={(otp?.code.length ?? 0) !== 6 || busy} onClick={() => void confirm()}>
          {t('checkout.confirm')}
        </Button>
      </Dialog>
    </div>
  );
}
