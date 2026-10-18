/**
 * Shuffle algorithms.
 *
 * Pure random (Fisher–Yates) often plays the same artist 2–3 times in a row, which listeners
 * perceive as "not random". Spotify's answer (engineering blog, 2014) is a *balanced* shuffle:
 * spread each artist's songs evenly across the playlist, with a bit of randomness.
 */

export type Rng = () => number;

/** Small deterministic PRNG so tests (and "same seed → same order" across devices) are reproducible. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Classic unbiased in-place shuffle on a copy. O(n). */
export function fisherYates<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

export interface BalancedShuffleOptions<T> {
  rng?: Rng;
  /**
   * "Fewer repeats": 0..1 how recently the user heard this item (1 = just now).
   * Recently played songs are nudged towards the end of the shuffle.
   */
  recency?: (item: T) => number;
}

/**
 * Balanced shuffle:
 *  1. group items by artist and shuffle inside each group;
 *  2. give the k-th item of an n-sized group the position  offset + k/n  (offset random in [0, 1/n)),
 *     plus ±10% jitter so groups don't interleave in a fixed pattern;
 *  3. sort everything by position;
 *  4. repair pass: spreading only makes back-to-back repeats *unlikely* (with 4 songs by one artist
 *     in 12, ~27% of shuffles would still have a pair), so swap away any remaining neighbours.
 * Result: an artist with 4 songs in a 40-song playlist appears roughly every 10 songs.
 */
export function balancedShuffle<T>(
  items: readonly T[],
  artistOf: (item: T) => string | null | undefined,
  { rng = Math.random, recency }: BalancedShuffleOptions<T> = {},
): T[] {
  const groups = new Map<string, { item: T; key: string }[]>();
  items.forEach((item, i) => {
    const key = artistOf(item) ?? `__solo_${i}`;
    const g = groups.get(key);
    if (g) g.push({ item, key });
    else groups.set(key, [{ item, key }]);
  });

  const positioned: { item: T; key: string; pos: number }[] = [];
  for (const group of groups.values()) {
    const shuffled = fisherYates(group, rng);
    const spacing = 1 / shuffled.length;
    const offset = rng() * spacing;
    shuffled.forEach((entry, k) => {
      const jitter = (rng() - 0.5) * spacing * 0.2;
      const freshnessPenalty = recency ? Math.min(1, Math.max(0, recency(entry.item))) * 0.35 : 0;
      positioned.push({ ...entry, pos: offset + k * spacing + jitter + freshnessPenalty });
    });
  }
  positioned.sort((a, b) => a.pos - b.pos);
  separateNeighbours(positioned);
  return positioned.map((p) => p.item);
}

/**
 * Swap items until no two neighbours share a key (when that is possible at all).
 * For each clash we try the nearest positions first — forwards and backwards, so a clash at the very
 * end of the list can still be fixed — and keep a swap only if it creates no new clash.
 */
function separateNeighbours(list: { key: string }[]): void {
  const clash = (p: number) => p >= 0 && p + 1 < list.length && list[p]!.key === list[p + 1]!.key;
  const trySwap = (i: number, j: number): boolean => {
    [list[i], list[j]] = [list[j]!, list[i]!];
    if (![i - 1, i, j - 1, j].some(clash)) return true;
    [list[i], list[j]] = [list[j]!, list[i]!];
    return false;
  };
  for (let i = 1; i < list.length; i++) {
    if (!clash(i - 1)) continue;
    for (let d = 1; d < list.length; d++) {
      const forward = i + d < list.length && trySwap(i, i + d);
      if (forward || (i - 1 - d >= 0 && trySwap(i, i - 1 - d))) break;
    }
  }
}

/**
 * Smart Shuffle merge: after every `every` items of the user's own list, insert one recommendation.
 * `pick` chooses which remaining recommendation fits best between `prev` and `next`
 * (e.g. by transition smoothness); default = first remaining.
 */
export function interleaveRecommendations<T, R>(
  base: readonly T[],
  recommendations: readonly R[],
  every = 3,
  pick: (prev: T | undefined, next: T | undefined, remaining: readonly R[]) => number = () => 0,
): (T | R)[] {
  const pool = recommendations.slice();
  const out: (T | R)[] = [];
  base.forEach((item, i) => {
    out.push(item);
    if ((i + 1) % every === 0 && pool.length > 0) {
      const idx = Math.min(Math.max(pick(item, base[i + 1], pool), 0), pool.length - 1);
      out.push(pool.splice(idx, 1)[0] as R);
    }
  });
  return out;
}
