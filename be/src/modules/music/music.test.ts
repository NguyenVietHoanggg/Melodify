import { describe, expect, it } from 'vitest';
import { camelotDistance, keyLabel, parseKey, toCamelot } from './keys';
import { balancedShuffle, fisherYates, interleaveRecommendations, mulberry32 } from './shuffle';
import { smartReorder, totalTransitionCost, type MixFeatures } from './reorder';
import { autoTransition, snapToBars } from './transitions';

describe('keys / Camelot wheel', () => {
  it('parses provider spellings', () => {
    expect(parseKey('E flat minor')).toEqual({ pitch: 3, mode: 0 });
    expect(parseKey('C# major')).toEqual({ pitch: 1, mode: 1 });
    expect(parseKey('F sharp minor')).toEqual({ pitch: 6, mode: 0 });
    expect(parseKey('Bb')).toEqual({ pitch: 10, mode: 1 });
    expect(parseKey('Am')).toEqual({ pitch: 9, mode: 0 });
    expect(parseKey('not a key')).toBeNull();
  });

  it('maps keys to the right Camelot codes', () => {
    expect(toCamelot({ pitch: 0, mode: 1 }).code).toBe('8B'); // C major
    expect(toCamelot({ pitch: 9, mode: 0 }).code).toBe('8A'); // A minor
    expect(toCamelot({ pitch: 7, mode: 1 }).code).toBe('9B'); // G major
    expect(toCamelot({ pitch: 11, mode: 1 }).code).toBe('1B'); // B major
    expect(toCamelot({ pitch: 3, mode: 0 }).code).toBe('2A'); // E♭ minor
  });

  it('measures harmonic distance', () => {
    const C = { pitch: 0, mode: 1 as const };
    expect(camelotDistance(C, { pitch: 9, mode: 0 })).toBe(1); // relative minor
    expect(camelotDistance(C, { pitch: 7, mode: 1 })).toBe(1); // one step on the wheel
    expect(camelotDistance(C, { pitch: 6, mode: 1 })).toBe(6); // tritone: opposite side
    expect(keyLabel({ pitch: 3, mode: 0 })).toBe('E♭m');
  });
});

describe('shuffle', () => {
  const tracks = [
    ...['a1', 'a2', 'a3', 'a4'].map((id) => ({ id, artist: 'A' })),
    ...['b1', 'b2'].map((id) => ({ id, artist: 'B' })),
    ...['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].map((id) => ({ id, artist: `solo-${id}` })),
  ];

  it('fisher-yates keeps every item exactly once', () => {
    const out = fisherYates(tracks, mulberry32(1));
    expect(out.map((t) => t.id).sort()).toEqual(tracks.map((t) => t.id).sort());
  });

  it('balanced shuffle never plays the same artist back-to-back here', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const out = balancedShuffle(tracks, (t) => t.artist, { rng: mulberry32(seed) });
      expect(out).toHaveLength(tracks.length);
      for (let i = 1; i < out.length; i++) expect(out[i]!.artist === 'A' && out[i - 1]!.artist === 'A').toBe(false);
    }
  });

  it('interleaves one recommendation every 3 tracks', () => {
    const out = interleaveRecommendations([1, 2, 3, 4, 5, 6, 7], ['x', 'y', 'z'], 3);
    expect(out).toEqual([1, 2, 3, 'x', 4, 5, 6, 'y', 7]);
  });
});

describe('smart reorder & transitions', () => {
  const k = (s: string) => parseKey(s);
  const t = (id: string, bpm: number, key: string, energy: number): MixFeatures => ({ id, bpm, key: k(key), energy });
  const messy = [
    t('1', 128, 'A minor', 0.8),
    t('2', 90, 'F# major', 0.3),
    t('3', 126, 'E minor', 0.75),
    t('4', 92, 'C# major', 0.35),
    t('5', 128, 'D minor', 0.85),
    t('6', 88, 'G# minor', 0.3),
  ];

  it('produces a permutation with a lower total cost', () => {
    const out = smartReorder(messy);
    expect(out.map((x) => x.id).sort()).toEqual(messy.map((x) => x.id).sort());
    expect(totalTransitionCost(out)).toBeLessThan(totalTransitionCost(messy));
  });

  it('respects keepFirst', () => {
    expect(smartReorder(messy, { keepFirst: true })[0]!.id).toBe('1');
  });

  it('auto-picks a beat-matched blend for compatible tracks', () => {
    const r = autoTransition(t('a', 124, 'A minor', 0.6), t('b', 125, 'C major', 0.65));
    expect(r.preset).toBe('blend');
    expect(r.tempoMatchRate).toBeCloseTo(124 / 125, 5);
    expect(snapToBars(12_000, 120)).toBe(12_000); // 6 bars of 2s at 120 BPM
  });
});

describe('lyrics', () => {
  it('parses LRC timestamps (including several stamps on one line)', async () => {
    const { parseLrc } = await import('../lyrics/lrc');
    const lines = parseLrc('[00:01.50] Hello\n[00:03.2]World\n[01:00.00][01:30.00] Chorus\nno stamp');
    expect(lines).toEqual([
      { t: 1500, text: 'Hello' },
      { t: 3200, text: 'World' },
      { t: 60000, text: 'Chorus' },
      { t: 90000, text: 'Chorus' },
    ]);
  });
});

describe('mock payment gateway', () => {
  it('validates card numbers with the Luhn checksum', async () => {
    const { luhnValid, cardBrand, charge } = await import('../billing/mockGateway');
    expect(luhnValid('4242 4242 4242 4242')).toBe(true);
    expect(luhnValid('4242 4242 4242 4241')).toBe(false); // one wrong digit
    expect(cardBrand('5555555555554444')).toBe('mastercard');
    expect(cardBrand('9704000000000018')).toBe('napas');
    const card = { number: '4242424242424242', expMonth: 12, expYear: 2099, cvc: '123', name: 'Test' };
    expect(charge(card, 65000).status).toBe('succeeded');
    expect(charge({ ...card, number: '4000000000000002' }, 65000)).toMatchObject({ status: 'failed', code: 'card_declined' });
    expect(charge({ ...card, number: '4000002760003184' }, 65000).status).toBe('requires_action');
    expect(charge({ ...card, expYear: 2001 }, 65000)).toMatchObject({ status: 'failed', code: 'expired_card' });
  });
});

describe('audio analysis', () => {
  // 20 s synthetic song: a kick on every beat at 120 BPM over a sustained A-minor chord.
  function synth(bpm: number, freqs: number[], seconds = 20, rate = 22050) {
    const n = rate * seconds;
    const out = new Float32Array(n);
    const beat = Math.round((60 / bpm) * rate);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (const f of freqs) s += 0.12 * Math.sin((2 * Math.PI * f * i) / rate);
      const sinceBeat = i % beat;
      if (sinceBeat < rate * 0.05) s += 0.8 * Math.exp(-sinceBeat / (rate * 0.01)) * Math.sin((2 * Math.PI * 60 * i) / rate);
      out[i] = s;
    }
    return out;
  }

  it('finds the tempo and key of a synthetic A-minor track at 120 BPM', async () => {
    const { analyzePcm } = await import('./analysis');
    const a = await analyzePcm([synth(120, [220, 261.63, 329.63])], 22050);
    expect(a.bpm).not.toBeNull();
    expect(Math.abs(a.bpm! - 120)).toBeLessThan(3);
    expect(a.key).toEqual({ pitch: 9, mode: 0 }); // A minor
    expect(a.durationMs).toBe(20000);
  });

  it('finds a faster tempo and a major key (C major chord at 140 BPM)', async () => {
    const { analyzePcm } = await import('./analysis');
    const a = await analyzePcm([synth(140, [261.63, 329.63, 392.0])], 22050);
    expect(Math.abs(a.bpm! - 140)).toBeLessThan(3);
    expect(a.key).toEqual({ pitch: 0, mode: 1 }); // C major
  });
});

describe('audio decoding path', () => {
  it('decodes a WAV file and analyses it end-to-end', async () => {
    const { analyzeAudio } = await import('./analysis');
    const rate = 22050;
    const seconds = 12;
    const n = rate * seconds;
    const pcm = new Int16Array(n);
    const beat = Math.round(0.5 * rate); // 120 BPM
    for (let i = 0; i < n; i++) {
      let s = 0.12 * Math.sin((2 * Math.PI * 220 * i) / rate) + 0.12 * Math.sin((2 * Math.PI * 261.63 * i) / rate) + 0.12 * Math.sin((2 * Math.PI * 329.63 * i) / rate);
      const since = i % beat;
      if (since < rate * 0.05) s += 0.8 * Math.exp(-since / (rate * 0.01)) * Math.sin((2 * Math.PI * 60 * i) / rate);
      pcm[i] = Math.max(-32768, Math.min(32767, Math.round(s * 20000)));
    }
    // Minimal 16-bit mono WAV container
    const wav = new Uint8Array(44 + pcm.byteLength);
    const v = new DataView(wav.buffer);
    const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF'); v.setUint32(4, 36 + pcm.byteLength, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
    v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, pcm.byteLength, true);
    wav.set(new Uint8Array(pcm.buffer), 44);
    const a = await analyzeAudio(wav);
    expect(Math.abs(a.bpm! - 120)).toBeLessThan(3);
    expect(a.key).toEqual({ pitch: 9, mode: 0 });
    expect(Math.abs(a.durationMs - 12000)).toBeLessThan(50);
  });
});
