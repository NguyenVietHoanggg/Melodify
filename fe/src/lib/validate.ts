/**
 * Form checks shared by every screen. Each one returns a translated message, or '' when the value is fine,
 * so forms can show the problem right under the field instead of only greying out their button.
 * The backend re-checks everything; these exist for instant, friendly feedback.
 */
import i18n from '@/i18n';
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from './upload';

const t = (key: string, params?: Record<string, unknown>) => i18n.t(`validation.${key}`, params);

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** Required text with a length limit (names, titles…). */
export function textError(value: string, { max, min = 1, required = true }: { max: number; min?: number; required?: boolean }): string {
  const v = value.trim();
  if (!v) return required ? t('required') : '';
  if (v.length < min) return t('tooShort', { min });
  if (v.length > max) return t('tooLong', { max });
  if (CONTROL_CHARS.test(v)) return t('badCharacters');
  return '';
}

export function emailError(value: string): string {
  const v = value.trim();
  if (!v) return t('required');
  if (v.length > 254 || !EMAIL_RE.test(v)) return t('email');
  return '';
}

/** Luhn checksum — the same check card networks use to catch typos. */
export function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return digits.length > 0 && sum % 10 === 0;
}

export function cardNumberError(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (!digits) return t('required');
  if (digits.length < 12 || digits.length > 19 || !luhn(digits)) return t('cardNumber');
  return '';
}

/** "MM/YY": a real month, and not before the current month. */
export function expiryError(value: string, now = new Date()): string {
  if (!value) return t('required');
  const m = /^(\d{2})\/(\d{2})$/.exec(value);
  if (!m) return t('expiryFormat');
  const month = Number(m[1]);
  const year = 2000 + Number(m[2]);
  if (month < 1 || month > 12) return t('expiryMonth');
  if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) return t('expired');
  if (year > now.getFullYear() + 20) return t('expiryFormat');
  return '';
}

/** 3 digits, or 4 for American Express. */
export function cvcError(value: string, cardNumber: string): string {
  const amex = /^3[47]/.test(cardNumber.replace(/\D/g, ''));
  const n = amex ? 4 : 3;
  if (!value) return t('required');
  if (!new RegExp(`^\\d{${n}}$`).test(value)) return t('cvc', { n });
  return '';
}

/** As printed on the card: letters (any language) and digits, spaces, dots, apostrophes, hyphens — at least one letter. */
export function cardNameError(value: string): string {
  const v = value.trim();
  if (!v) return t('required');
  if (v.length < 2 || v.length > 80 || !/^[\p{L}\p{N}][\p{L}\p{N} .'-]*$/u.test(v) || !/\p{L}/u.test(v)) return t('cardName');
  return '';
}

/** Image picked for a cover or avatar. */
export function imageError(file: File): string {
  if (!IMAGE_TYPES.includes(file.type)) return t('imageType');
  if (file.size > MAX_IMAGE_BYTES) return t('imageSize', { mb: MAX_IMAGE_BYTES / 1024 / 1024 });
  return '';
}
