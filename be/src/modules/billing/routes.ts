import { Router } from 'express';
import { z } from 'zod';
import { isDev } from '../../config/env';
import { forbidden, parse, requireUser } from '../../lib/http';
import { email, text } from '../../lib/validation';
import { getSubscriptionSummary } from '../users/service';
import { cancelSubscription, checkout, confirmPayment, devAdvance, getPlans, listPayments, resumeSubscription, verifyStudent } from './service';

export const billingRouter = Router();

billingRouter.get('/plans', async (req, res) => {
  res.json(await getPlans(req.userId));
});

billingRouter.get('/me/subscription', async (req, res) => {
  res.json({ subscription: await getSubscriptionSummary(requireUser(req)) });
});

const card = z.object({
  number: z.string().regex(/^[\d ]{12,23}$/),
  expMonth: z.coerce.number().int().min(1).max(12),
  expYear: z.coerce.number().int().min(2000).max(2100),
  cvc: z.string().regex(/^\d{3,4}$/),
  name: text(2, 80),
});

billingRouter.post('/checkout', async (req, res) => {
  const userId = requireUser(req);
  const body = parse(
    z
      .object({ planId: z.string().max(40).optional(), prepaidOptionId: z.string().max(40).optional(), card, idempotencyKey: z.string().min(8).max(80) })
      .refine((b) => Boolean(b.planId) !== Boolean(b.prepaidOptionId), 'Exactly one of planId / prepaidOptionId'),
    req.body,
  );
  res.json(await checkout(userId, body));
});

billingRouter.post('/checkout/:paymentId/confirm', async (req, res) => {
  const userId = requireUser(req);
  const { paymentId } = parse(z.object({ paymentId: z.guid() }), req.params);
  const { otp } = parse(z.object({ otp: z.string().regex(/^\d{6}$/) }), req.body);
  res.json(await confirmPayment(userId, paymentId, otp));
});

billingRouter.post('/me/subscription/cancel', async (req, res) => {
  const userId = requireUser(req);
  await cancelSubscription(userId);
  res.json({ subscription: await getSubscriptionSummary(userId) });
});

billingRouter.post('/me/subscription/resume', async (req, res) => {
  const userId = requireUser(req);
  await resumeSubscription(userId);
  res.json({ subscription: await getSubscriptionSummary(userId) });
});

billingRouter.get('/me/payments', async (req, res) => {
  res.json({ items: await listPayments(requireUser(req)) });
});

billingRouter.post('/me/student-verification', async (req, res) => {
  const userId = requireUser(req);
  const body = parse(z.object({ schoolName: text(2, 120), studentEmail: email }), req.body);
  res.json({ verified: await verifyStudent(userId, body.schoolName, body.studentEmail) });
});

/** Development helper: fast-forward my subscription to test renewals & expiry. */
billingRouter.post('/dev/billing/advance', async (req, res) => {
  if (!isDev) throw forbidden();
  const { days } = parse(z.object({ days: z.number().int().min(1).max(400) }), req.body);
  res.json({ processed: await devAdvance(requireUser(req), days) });
});
