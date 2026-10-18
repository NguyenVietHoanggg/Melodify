/**
 * Sign-up rules live ONLY here. The frontend downloads them (GET /api/auth/policy) to render the live
 * checklist ("10 characters", "1 letter", …) — so changing a rule never requires touching the UI code.
 */
export const PASSWORD_RULES = [
  { id: 'letter', pattern: '[A-Za-z]' },
  { id: 'numberOrSpecial', pattern: '[0-9#?!&@$%^*()_+\\-=.,;:]' },
  { id: 'length', pattern: '^.{10,}$' },
] as const;

export const MIN_AGE = 13;
export const GENDERS = ['male', 'female', 'non_binary', 'other', 'prefer_not_to_say'] as const;

export function passwordProblems(password: string): string[] {
  return PASSWORD_RULES.filter((r) => !new RegExp(r.pattern).test(password)).map((r) => r.id);
}

export function ageOn(birthDate: string, today = new Date()): number {
  const b = new Date(`${birthDate}T00:00:00Z`);
  let age = today.getUTCFullYear() - b.getUTCFullYear();
  const beforeBirthday =
    today.getUTCMonth() < b.getUTCMonth() || (today.getUTCMonth() === b.getUTCMonth() && today.getUTCDate() < b.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}
