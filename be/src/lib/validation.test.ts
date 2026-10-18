import { describe, expect, it } from 'vitest';
import { birthDate, email, longText, text } from './validation';

describe('text()', () => {
  const name = text(1, 10);
  it('trims, normalises and removes control characters', () => {
    expect(name.parse('  Lạc\u0000 Trôi ​ ')).toBe('Lạc Trôi');
    // 'e' + combining circumflex (how some keyboards type Vietnamese) becomes the single letter 'ê'.
    expect(name.parse('Lê')).toBe('Lê');
  });
  it('turns line breaks into spaces in one-line text', () => {
    expect(name.parse('a\nb\tc')).toBe('a b c');
  });
  it('rejects empty (after cleaning) and too long values', () => {
    expect(name.safeParse('   ').success).toBe(false);
    expect(name.safeParse('\u0007\u0008').success).toBe(false);
    expect(name.safeParse('12345678901').success).toBe(false);
  });
});

describe('longText()', () => {
  it('keeps line breaks', () => {
    expect(longText(50).parse(' line 1\nline 2 ')).toBe('line 1\nline 2');
  });
});

describe('email', () => {
  it('accepts spaces and capitals around a valid address', () => {
    expect(email.parse('  An.Nguyen@Mail.COM ')).toBe('an.nguyen@mail.com');
  });
  it('rejects invalid addresses', () => {
    for (const bad of ['', 'abc', 'a@b', '@mail.com', 'a b@mail.com']) expect(email.safeParse(bad).success).toBe(false);
  });
});

describe('birthDate', () => {
  it('accepts real past dates', () => {
    expect(birthDate.safeParse('2000-02-29').success).toBe(true);
  });
  it('rejects impossible, ancient and future dates', () => {
    for (const bad of ['2001-02-29', '1899-12-31', '2999-01-01', '2000-13-01', 'yesterday']) expect(birthDate.safeParse(bad).success).toBe(false);
  });
});
