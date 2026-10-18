import { describe, expect, it } from 'vitest';
import { fold, interpretLocally, normalizeLlmIntent, targetFeatures } from './interpret';

describe('AI prompt interpretation (keyword fallback)', () => {
  it('folds Vietnamese diacritics', () => {
    expect(fold('Đêm Mưa buồn')).toBe('dem mua buon');
  });

  it('understands a Vietnamese mood request', () => {
    const i = interpretLocally('Nhạc buồn cho đêm mưa');
    expect(i.moods).toContain('Melancholy');
    expect(i.valence?.[1]).toBeLessThan(0.5);
    expect(i.energy?.[1]).toBeLessThan(0.5);
    expect(i.keywords).toEqual(expect.arrayContaining(['rain']));
    expect(i.title).toBe('Nhạc buồn cho đêm mưa');
  });

  it('maps genres, energy and tempo', () => {
    const i = interpretLocally('Rap sôi động để tập gym');
    expect(i.genres).toContain('hiphop');
    expect(i.energy?.[0]).toBeGreaterThan(0.5);
    expect(i.bpm?.[0]).toBeGreaterThanOrEqual(120);
  });

  it('parses decades and song counts', () => {
    expect(interpretLocally('Tình ca thập niên 90').decades).toEqual([1990]);
    expect(interpretLocally('love songs from the 80s').decades).toEqual([1980]);
    const i = interpretLocally('2000s party, 40 songs', 'en');
    expect(i.decades).toEqual([2000]);
    expect(i.count).toBe(40);
    expect(i.description).toContain('2000s party');
  });

  it('does not match words inside other words', () => {
    // "buong" (let go) must not trigger "buon" (sad)
    expect(interpretLocally('buông bỏ').moods).not.toContain('Melancholy');
  });

  it('target features follow the request', () => {
    const sad = targetFeatures(interpretLocally('nhạc buồn'));
    const gym = targetFeatures(interpretLocally('workout'));
    expect(sad.valence).toBeLessThan(gym.valence);
    expect(sad.energy).toBeLessThan(gym.energy);
  });
});

describe('AI model output validation', () => {
  it('keeps only our vocabulary and clamps values', () => {
    const i = normalizeLlmIntent(
      {
        onTopic: true, title: '"Mưa đêm"', description: 'Chill', genres: ['lofi', 'k-drama-ost'], moods: ['Melancholy', 'Spooky'],
        energy: 'low', valence: 'whatever', tempo: 'slow', decades: [1994, 1850], artists: ['Vũ.'], keywords: ['Rain'], count: 500,
      },
      'mưa',
    )!;
    expect(i.title).toBe('Mưa đêm');
    expect(i.genres).toEqual(['lofi']);
    expect(i.moods).toEqual(['Melancholy']);
    expect(i.valence).toBeNull();
    expect(i.bpm).toEqual([50, 98]);
    expect(i.decades).toEqual([1990]);
    expect(i.keywords).toEqual(['rain']);
    expect(i.count).toBe(50);
  });

  it('rejects off-topic or broken output', () => {
    expect(normalizeLlmIntent({ onTopic: false, title: 'x' }, 'x')).toBeNull();
    expect(normalizeLlmIntent('nope', 'x')).toBeNull();
  });
});
