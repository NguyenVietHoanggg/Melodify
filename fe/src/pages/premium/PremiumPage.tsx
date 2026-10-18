/**
 * The Premium plans page (spotify.com/vn-vi/premium): hero offer, Free vs Premium comparison,
 * plan cards (subscribe or pay once), prepaid options and FAQ. Prices & offers come from GET /plans,
 * including whether this user can still get the intro offer.
 */
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { PlanInfo, PrepaidInfo } from '@contracts';
import { useMe, usePlans } from '@/api/queries';
import { Icon } from '@/components/icons/Icon';
import { Spinner } from '@/components/ui/Dialog';
import { BRAND } from '@/config/brand';
import { formatDate, formatVnd } from '@/lib/format';
import { SiteHeader } from './SiteHeader';
import styles from './premium.module.css';

const BENEFITS = ['adFree', 'anyOrder', 'unlimitedSkips', 'queue', 'smartShuffle', 'mix', 'ai', 'uploads'] as const;

function PlanCard({ plan, prepaid, intro }: { plan: PlanInfo; prepaid: PrepaidInfo[]; intro: boolean }) {
  const { t } = useTranslation();
  const color = plan.color ?? '#1ed760';
  const showIntro = intro && plan.introMonths > 0 && plan.introPrice != null;
  const name = plan.id === 'student' ? 'Student' : 'Individual';
  return (
    <article className={styles.planCard} style={{ ['--plan-color' as string]: color }}>
      {showIntro && <span className={styles.planTag}>{t('premium.forMonths', { price: formatVnd(plan.introPrice!), months: plan.introMonths })}</span>}
      <h3 className={styles.planName}>
        <span className={styles.planBrand}>
          <span className={styles.planLogo} /> Premium
        </span>
        <span className={styles.planColor}>{name}</span>
      </h3>
      <p className={styles.planPrice}>
        {showIntro ? t('premium.forMonths', { price: formatVnd(plan.introPrice!), months: plan.introMonths }) : t('premium.perMonth', { price: formatVnd(plan.monthlyPrice) })}
      </p>
      {showIntro && <p className={styles.planThen}>{t('premium.thenMonthly', { price: formatVnd(plan.monthlyPrice) })}</p>}
      <hr className={styles.planRule} />
      <ul className={styles.planList}>
        <li>{plan.requiresVerification ? t('premium.verifiedAccount') : t('premium.oneAccount')}</li>
        {plan.requiresVerification && <li>{t('premium.studentDiscount')}</li>}
        <li>{t('premium.cancelAnytime')}</li>
        {prepaid.length > 0 && <li>{t('premium.subscribeOrOneTime')}</li>}
      </ul>
      <div className={styles.planActions}>
        <Link to={`/checkout/${plan.id}`} className={styles.planCta}>
          {showIntro ? t('premium.tryFor', { months: plan.introMonths, price: formatVnd(plan.introPrice!) }) : t('premium.getPlan', { plan: `Premium ${name}` })}
        </Link>
        {prepaid.length > 0 && (
          <a href="#one-time" className={styles.planSecondary}>
            {t('premium.oneTime')}
          </a>
        )}
      </div>
      <p className={styles.planTerms}>
        {showIntro && `${t('premium.introTerms', { price: formatVnd(plan.introPrice!), months: plan.introMonths, monthly: formatVnd(plan.monthlyPrice) })} `}
        {plan.requiresVerification && t('premium.studentTerms')}
      </p>
    </article>
  );
}

function Faq() {
  const { t } = useTranslation();
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section className={styles.faq}>
      <h2 className={styles.sectionTitle}>{t('premium.faqTitle')}</h2>
      {[1, 2, 3, 4].map((n) => (
        <div key={n} className={styles.faqItem}>
          <button type="button" className={styles.faqQ} aria-expanded={open === n} onClick={() => setOpen(open === n ? null : n)}>
            {t(`premium.q${n}`)}
            <Icon name={open === n ? 'chevronUp' : 'chevronDown'} size={20} />
          </button>
          {open === n && <p className={styles.faqA}>{t(`premium.a${n}`)}</p>}
        </div>
      ))}
    </section>
  );
}

export function PremiumPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'vi' ? 'vi' : 'en';
  const me = useMe();
  const { data } = usePlans();

  useEffect(() => {
    document.title = `${BRAND.name} Premium – ${t('premium.plansNav')}`;
  }, [t]);

  if (!data) {
    return (
      <div className={styles.site}>
        <SiteHeader />
        <div className={styles.centered}><Spinner /></div>
      </div>
    );
  }
  const individual = data.plans.find((p) => p.id === 'individual') ?? data.plans[0]!;
  const intro = data.introEligible && individual.introMonths > 0 && individual.introPrice != null;
  const current = data.current;
  const active = current && (current.status === 'active' || current.status === 'past_due');

  return (
    <div className={styles.site}>
      <SiteHeader />
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          {active ? (
            <>
              <h1 className={styles.heroTitle}>{t('premium.youHave', { plan: current.planName })}</h1>
              <p className={styles.heroSub}>
                {current.cancelAtPeriodEnd || current.billingType === 'prepaid'
                  ? t('account.endsOn', { date: formatDate(current.currentPeriodEnd, lang) })
                  : t('account.renews', { date: formatDate(current.currentPeriodEnd, lang), price: formatVnd(current.nextChargeAmount ?? individual.monthlyPrice) })}
              </p>
              <div className={styles.heroActions}>
                <Link to="/account" className={styles.heroCta}>{t('premium.manage')}</Link>
                <a href="#plans" className={styles.heroGhost}>{t('premium.viewAll')}</a>
              </div>
            </>
          ) : (
            <>
              <h1 className={styles.heroTitle}>
                {intro
                  ? t('premium.heroTitle', { plan: 'Premium Individual', months: individual.introMonths, price: formatVnd(individual.introPrice!) })
                  : t('premium.heroTitlePlain')}
              </h1>
              <p className={styles.heroSub}>{t('premium.heroSub', { price: formatVnd(individual.monthlyPrice) })}</p>
              <div className={styles.heroActions}>
                <Link to={me ? '/checkout/individual' : '/login?continue=/checkout/individual'} className={styles.heroCta}>
                  {intro ? t('premium.tryFor', { months: individual.introMonths, price: formatVnd(individual.introPrice!) }) : t('premium.getPlan', { plan: 'Premium Individual' })}
                </Link>
                <a href="#plans" className={styles.heroGhost}>{t('premium.viewAll')}</a>
              </div>
              {intro && (
                <p className={styles.heroTerms}>
                  {t('premium.introTerms', { price: formatVnd(individual.introPrice!), months: individual.introMonths, monthly: formatVnd(individual.monthlyPrice) })}
                </p>
              )}
            </>
          )}
        </div>
      </section>

      <section className={styles.compare}>
        <h2 className={styles.sectionTitle}>{t('premium.experienceTitle')}</h2>
        <p className={styles.sectionBody}>{t('premium.experienceBody')}</p>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t('premium.benefitsFor')}</th>
              <th>
                {t('premium.freePlan')}
                <small>{t('premium.ofApp', { app: BRAND.name })}</small>
              </th>
              <th className={styles.premiumCol}>
                {t('premium.premiumPlan')}
                <small>{t('premium.ofApp', { app: BRAND.name })}</small>
              </th>
            </tr>
          </thead>
          <tbody>
            {BENEFITS.map((b) => (
              <tr key={b}>
                <td>{t(`premium.benefits.${b}`)}</td>
                <td aria-label="Free">
                  <span className={styles.dash}>—</span>
                </td>
                <td aria-label="Premium">
                  <span className={styles.tick}><Icon name="check" size={16} /></span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={styles.plans} id="plans">
        <h2 className={styles.sectionTitle}>{t('premium.affordableTitle')}</h2>
        <p className={styles.sectionBody}>{t('premium.affordableBody')}</p>
        <div className={styles.payments}>
          {['VISA', 'Mastercard', 'JCB', 'NAPAS'].map((n) => (
            <span key={n} className={styles.payBadge}>{n}</span>
          ))}
        </div>
        <div className={styles.planGrid}>
          <article className={clsx(styles.planCard, styles.benefitCard)}>
            <h3 className={styles.planName}>{t('premium.allPlansBenefits')}</h3>
            <ul className={styles.benefitList}>
              {BENEFITS.map((b) => (
                <li key={b}>
                  <Icon name="check" size={16} /> {t(`premium.benefits.${b}`)}
                </li>
              ))}
            </ul>
          </article>
          {data.plans.map((p) => (
            <PlanCard key={p.id} plan={p} prepaid={data.prepaid.filter((o) => o.planId === p.id)} intro={data.introEligible} />
          ))}
        </div>
      </section>

      <section className={styles.oneTime} id="one-time">
        <h2 className={styles.sectionTitle}>{t('premium.oneTimeTitle')}</h2>
        <p className={styles.sectionBody}>{t('premium.oneTimeBody')}</p>
        <div className={styles.prepaidGrid}>
          {data.prepaid.map((o) => {
            const plan = data.plans.find((p) => p.id === o.planId);
            return (
              <Link key={o.id} to={`/checkout/${o.id}`} className={styles.prepaid} style={{ ['--plan-color' as string]: plan?.color ?? '#1ed760' }}>
                <span className={styles.prepaidPlan}>Premium {o.planId === 'student' ? 'Student' : 'Individual'}</span>
                <strong>{t('premium.months', { count: o.months })}</strong>
                <span className={styles.prepaidPrice}>{formatVnd(o.price)}</span>
                {o.savings > 0 && <span className={styles.save}>{t('premium.save', { amount: formatVnd(o.savings) })}</span>}
              </Link>
            );
          })}
        </div>
      </section>

      <Faq />
      <p className={styles.mock}>
        <Icon name="info" size={16} /> {t('premium.mockNotice')}
      </p>
    </div>
  );
}
