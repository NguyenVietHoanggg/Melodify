/**
 * "Mix" transitions (Spotify Premium feature, 2025): DJ-style blends between consecutive tracks.
 *
 * The backend DECIDES the transition and sends the frontend a fully-specified recipe:
 * gain curves for both decks + optional filter sweeps. The frontend audio engine only
 * executes the recipe with the Web Audio API — no decision-making in the UI.
 */
import type { CurvePoint, TransitionPreset, TransitionRecipe } from '../../contracts';
import { camelotDistance } from './keys';
import { bpmDistance, type MixFeatures } from './reorder';

export const TRANSITION_PRESETS: readonly TransitionPreset[] = ['fade', 'rise', 'blend', 'wave', 'melt', 'slam'];
export type { TransitionPreset, TransitionRecipe };

const equalPowerOut = (steps = 8): CurvePoint[] =>
  [...Array(steps + 1).keys()].map((i) => ({ t: i / steps, v: Math.cos((i / steps) * Math.PI * 0.5) }));
const equalPowerIn = (steps = 8): CurvePoint[] =>
  [...Array(steps + 1).keys()].map((i) => ({ t: i / steps, v: Math.sin((i / steps) * Math.PI * 0.5) }));

/** Rounds a duration to a whole number of 4-beat bars so blends land on the beat. */
export function snapToBars(ms: number, bpm: number | null): number {
  if (!bpm) return ms;
  const barMs = (60_000 / bpm) * 4;
  return Math.max(barMs, Math.round(ms / barMs) * barMs);
}

export function buildRecipe(
  preset: TransitionPreset,
  durationMs: number,
  a?: MixFeatures,
  b?: MixFeatures,
  auto = false,
): TransitionRecipe {
  const tempoMatchRate =
    preset === 'blend' && a?.bpm && b?.bpm && bpmDistance(a.bpm, b.bpm) < 0.06 ? a.bpm / b.bpm : null;
  const base = { preset, durationMs, tempoMatchRate, auto };
  switch (preset) {
    case 'fade':
      return { ...base, out: { gain: equalPowerOut() }, in: { gain: equalPowerIn() } };
    case 'rise':
      // Outgoing track "rises" away through a high-pass sweep, then the new track lands.
      return {
        ...base,
        out: {
          gain: [{ t: 0, v: 1 }, { t: 0.7, v: 0.8 }, { t: 1, v: 0 }],
          filter: { type: 'highpass', param: 'frequency', curve: [{ t: 0, v: 20 }, { t: 0.85, v: 2500 }, { t: 1, v: 6000 }] },
        },
        in: { gain: [{ t: 0, v: 0 }, { t: 0.55, v: 0.15 }, { t: 1, v: 1 }] },
      };
    case 'blend':
      // Classic DJ "bass swap": both tracks overlap, the incoming bass is cut until the midpoint.
      return {
        ...base,
        out: {
          gain: [{ t: 0, v: 1 }, { t: 0.5, v: 0.9 }, { t: 1, v: 0 }],
          filter: { type: 'lowshelf', param: 'gain', frequency: 200, curve: [{ t: 0, v: 0 }, { t: 0.49, v: 0 }, { t: 0.51, v: -24 }, { t: 1, v: -24 }] },
        },
        in: {
          gain: [{ t: 0, v: 0 }, { t: 0.5, v: 0.9 }, { t: 1, v: 1 }],
          filter: { type: 'lowshelf', param: 'gain', frequency: 200, curve: [{ t: 0, v: -24 }, { t: 0.49, v: -24 }, { t: 0.51, v: 0 }, { t: 1, v: 0 }] },
        },
      };
    case 'wave': {
      // Volumes swell back and forth like waves while crossing over.
      const out: CurvePoint[] = [];
      const inn: CurvePoint[] = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        const wobble = 0.15 * Math.sin(t * Math.PI * 6);
        out.push({ t, v: Math.max(0, Math.cos(t * Math.PI * 0.5) + wobble * (1 - t)) });
        inn.push({ t, v: Math.max(0, Math.sin(t * Math.PI * 0.5) - wobble * t) });
      }
      return { ...base, out: { gain: out }, in: { gain: inn } };
    }
    case 'melt':
      // Outgoing track melts away through a closing low-pass filter.
      return {
        ...base,
        out: {
          gain: [{ t: 0, v: 1 }, { t: 0.8, v: 0.6 }, { t: 1, v: 0 }],
          filter: { type: 'lowpass', param: 'frequency', curve: [{ t: 0, v: 20000 }, { t: 0.6, v: 1200 }, { t: 1, v: 250 }] },
        },
        in: { gain: equalPowerIn() },
      };
    case 'slam':
      // Hard cut right on the bar line with a tiny de-click fade.
      return {
        ...base,
        out: { gain: [{ t: 0, v: 1 }, { t: 0.92, v: 1 }, { t: 1, v: 0 }] },
        in: { gain: [{ t: 0, v: 0 }, { t: 0.9, v: 0 }, { t: 1, v: 1 }] },
      };
  }
}

/**
 * "Auto" mode: pick the preset & length from the two tracks' features.
 *  - same tempo + compatible keys → long beat-matched Blend
 *  - big energy jump up            → Rise
 *  - big energy drop               → Melt
 *  - both very energetic           → Slam on the downbeat
 *  - otherwise                     → equal-power Fade
 */
export function autoTransition(a: MixFeatures, b: MixFeatures): TransitionRecipe {
  const tempoClose = a.bpm && b.bpm ? bpmDistance(a.bpm, b.bpm) < 0.06 : false;
  const keysOk = a.key && b.key ? camelotDistance(a.key, b.key) <= 1 : false;
  const de = a.energy != null && b.energy != null ? b.energy - a.energy : 0;

  let preset: TransitionPreset = 'fade';
  let seconds = 6;
  if (tempoClose && keysOk) {
    preset = 'blend';
    seconds = 12;
  } else if (de > 0.3) {
    preset = 'rise';
    seconds = 8;
  } else if (de < -0.3) {
    preset = 'melt';
    seconds = 8;
  } else if ((a.energy ?? 0) > 0.8 && (b.energy ?? 0) > 0.8) {
    preset = 'slam';
    seconds = 2;
  }
  return buildRecipe(preset, snapToBars(seconds * 1000, a.bpm), a, b, true);
}
