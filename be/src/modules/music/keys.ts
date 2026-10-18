/**
 * Musical keys & the Camelot wheel (the system DJs use for "harmonic mixing").
 *
 * A key = pitch class (0 = C, 1 = C♯/D♭ … 11 = B) + mode (1 = major, 0 = minor).
 * Camelot code = number 1..12 + letter (B = major, A = minor), e.g. C major = 8B, A minor = 8A.
 * Neighbours on the wheel (±1 number, or same number other letter) sound good together.
 */
export interface MusicalKey {
  pitch: number;
  mode: 0 | 1;
}

export interface CamelotCode {
  number: number;
  letter: 'A' | 'B';
  code: string;
}

const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const LETTER_PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * Parses the many spellings providers use:
 * "E flat minor" (Audius), "C# major", "Ebm", "F sharp minor", "Bb", "A minor", "G♯m".
 */
export function parseKey(input: string | null | undefined): MusicalKey | null {
  if (!input) return null;
  const s = input.trim().replace(/♯/g, '#').replace(/♭/g, 'b');
  const m = /^([A-Ga-g])\s*(#|b|sharp|flat)?\s*(major|minor|maj|min|m)?$/i.exec(s);
  if (!m) return null;
  const [, letter = '', accidental = '', quality = ''] = m;
  let pitch = LETTER_PITCH[letter.toUpperCase()];
  if (pitch === undefined) return null;
  const acc = accidental.toLowerCase();
  if (acc === '#' || acc === 'sharp') pitch += 1;
  if (acc === 'b' || acc === 'flat') pitch -= 1;
  const q = quality.toLowerCase();
  const mode: 0 | 1 = q === 'minor' || q === 'min' || q === 'm' ? 0 : 1;
  return { pitch: (pitch + 12) % 12, mode };
}

/** "E♭m" / "C" — compact label shown next to BPM in Mix mode. */
export function keyLabel(k: MusicalKey, preferFlats = true): string {
  const name = (preferFlats ? FLAT_NAMES : SHARP_NAMES)[k.pitch] ?? '?';
  return k.mode === 0 ? `${name}m` : name;
}

export function toCamelot(k: MusicalKey): CamelotCode {
  // Walking the circle of fifths (×7 semitones) gives consecutive wheel numbers; C major sits at 8.
  const majorPitch = k.mode === 1 ? k.pitch : (k.pitch + 3) % 12; // a minor key shares its number with its relative major
  const number = (((majorPitch * 7) % 12) + 7) % 12 + 1;
  const letter = k.mode === 1 ? 'B' : 'A';
  return { number, letter, code: `${number}${letter}` };
}

/**
 * 0 = same key, 1 = perfect neighbour (±1 or relative major/minor),
 * 2 = "energy boost" (±2) or diagonal move, larger = clashing.
 */
export function camelotDistance(a: MusicalKey, b: MusicalKey): number {
  const ca = toCamelot(a);
  const cb = toCamelot(b);
  const diff = Math.abs(ca.number - cb.number);
  const steps = Math.min(diff, 12 - diff);
  return steps + (ca.letter === cb.letter ? 0 : 1);
}

export function areKeysCompatible(a: MusicalKey, b: MusicalKey): boolean {
  return camelotDistance(a, b) <= 1;
}
