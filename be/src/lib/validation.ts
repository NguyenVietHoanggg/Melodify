/**
 * Shared rules for text people type (names, titles, descriptions…). The frontend checks the same things
 * for instant feedback, but only these count: a modified client can send anything.
 */
import { z } from 'zod';

// Control characters (and zero-width ones) have no business in a name and can break layouts or logs.
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‍⁠﻿]/g;
const NEWLINES = /[\r\n\t]+/g;

const clean = (multiline: boolean) => (value: string) => {
  let v = value.normalize('NFC').replace(CONTROL, '');
  if (!multiline) v = v.replace(NEWLINES, ' ');
  return v.trim();
};

/** One-line text: normalised, control characters removed, trimmed, then length-checked. */
export const text = (min: number, max: number) => z.string().max(max * 4).transform(clean(false)).pipe(z.string().min(min).max(max));

/** Multi-line text (descriptions, lyrics, report details): keeps line breaks. */
export const longText = (max: number) => z.string().max(max * 4).transform(clean(true)).pipe(z.string().max(max));

/** Emails are compared trimmed and lower-cased ("  An@Mail.com " = "an@mail.com"). */
export const email = z.string().max(254).trim().toLowerCase().pipe(z.email());

/** A real birth date: a valid calendar day, not before 1900 and not in the future. */
export const birthDate = z.iso.date().refine((d) => d >= '1900-01-01' && d <= new Date().toISOString().slice(0, 10), {
  message: 'invalid_birth_date',
});
