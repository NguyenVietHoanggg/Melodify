/**
 * A FAKE payment gateway with the same shape as a real one (Stripe, MoMo, VNPay…), so the checkout flow
 * can be built and tested without real money. Swap this file for a real provider later.
 *
 * Test cards (same convention as Stripe's test mode):
 *   4242 4242 4242 4242  → success
 *   4000 0000 0000 0002  → declined
 *   4000 0000 0000 9995  → insufficient funds
 *   4000 0027 6000 3184  → needs 3-D Secure / OTP confirmation (OTP: 123456)
 * Any other number that passes the Luhn check → success.
 */
import crypto from 'node:crypto';

export interface CardInput {
  number: string;
  expMonth: number;
  expYear: number;
  cvc: string;
  name: string;
}

export type ChargeOutcome =
  | { status: 'succeeded'; ref: string }
  | { status: 'requires_action'; ref: string }
  | { status: 'failed'; ref: string; code: 'card_declined' | 'insufficient_funds' | 'expired_card' | 'invalid_card' };

/** Luhn checksum: catches almost every single-digit typo and adjacent swap in card numbers. */
export function luhnValid(number: string): boolean {
  const digits = number.replace(/\D/g, '');
  if (digits.length < 12 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export function cardBrand(number: string): string {
  const n = number.replace(/\D/g, '');
  if (/^4/.test(n)) return 'visa';
  if (/^(5[1-5]|2(2[2-9][1-9]|[3-6]\d\d|7[01]\d|720))/.test(n)) return 'mastercard';
  if (/^3[47]/.test(n)) return 'amex';
  if (/^35(2[89]|[3-8]\d)/.test(n)) return 'jcb';
  if (/^9704/.test(n)) return 'napas'; // Vietnamese domestic cards
  return 'card';
}

export function validateCard(card: CardInput): ChargeOutcome | null {
  const ref = `mock_${crypto.randomBytes(8).toString('hex')}`;
  if (!luhnValid(card.number) || !/^\d{3,4}$/.test(card.cvc)) return { status: 'failed', ref, code: 'invalid_card' };
  const now = new Date();
  const expired = card.expYear < now.getFullYear() || (card.expYear === now.getFullYear() && card.expMonth < now.getMonth() + 1);
  if (expired) return { status: 'failed', ref, code: 'expired_card' };
  return null;
}

/** "Charge" a card. The token lets recurring renewals charge the same card later without its number. */
export function charge(card: CardInput, _amount: number): ChargeOutcome {
  const invalid = validateCard(card);
  if (invalid) return invalid;
  const ref = `mock_${crypto.randomBytes(8).toString('hex')}`;
  const n = card.number.replace(/\D/g, '');
  if (n === '4000000000000002') return { status: 'failed', ref, code: 'card_declined' };
  if (n === '4000000000009995') return { status: 'failed', ref, code: 'insufficient_funds' };
  if (n === '4000002760003184') return { status: 'requires_action', ref };
  return { status: 'succeeded', ref };
}

/** Tokenisation: we keep only a token (+ brand/last4 for display), never the full card number. */
export function tokenize(card: CardInput) {
  const n = card.number.replace(/\D/g, '');
  // Encode the test behaviour in the token so renewals of a "declining" test card fail too.
  const behaviour = n === '4000000000000002' || n === '4000000000009995' ? 'fail' : 'ok';
  return { token: `tok_${behaviour}_${crypto.randomBytes(10).toString('hex')}`, brand: cardBrand(n), last4: n.slice(-4) };
}

export function chargeToken(token: string): ChargeOutcome {
  const ref = `mock_${crypto.randomBytes(8).toString('hex')}`;
  return token.startsWith('tok_fail') ? { status: 'failed', ref, code: 'card_declined' } : { status: 'succeeded', ref };
}

export const MOCK_OTP = '123456';
