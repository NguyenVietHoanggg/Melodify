/**
 * k-means clustering on feature vectors — how Daily Mixes find a listener's distinct "tastes"
 * (e.g. one cluster of lo-fi, one of EDM, one of acoustic).
 *
 * Steps: normalise vectors (so distance = cosine), pick k starting centres with k-means++ (spread out,
 * avoids bad random starts), then repeat "assign each point to its nearest centre → move each centre to
 * the weighted mean of its points" until nothing changes.
 */
import { mulberry32, type Rng } from '../music/shuffle';

const normalize = (v: number[]) => {
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
};
const dist2 = (a: number[], b: number[]) => a.reduce((s, x, i) => s + (x - b[i]!) ** 2, 0);

export function kmeans(vectors: number[][], weights: number[], k: number, rng: Rng = mulberry32(42), maxIter = 25): number[] {
  const points = vectors.map(normalize);
  const n = points.length;
  if (n === 0) return [];
  k = Math.max(1, Math.min(k, n));

  // k-means++ initialisation: each new centre is picked with probability ∝ squared distance to the nearest one.
  const centres: number[][] = [points[Math.floor(rng() * n)]!];
  while (centres.length < k) {
    const d = points.map((p) => Math.min(...centres.map((c) => dist2(p, c))));
    const total = d.reduce((s, x) => s + x, 0);
    let r = rng() * total;
    let idx = 0;
    while (idx < n - 1 && r > d[idx]!) r -= d[idx++]!;
    centres.push(points[idx]!);
  }

  const assign = new Array<number>(n).fill(-1);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    points.forEach((p, i) => {
      let best = 0;
      let bestD = Infinity;
      centres.forEach((c, j) => {
        const d = dist2(p, c);
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      });
      if (assign[i] !== best) {
        assign[i] = best;
        changed = true;
      }
    });
    if (!changed) break;
    centres.forEach((_, j) => {
      const members = points.map((p, i) => ({ p, w: weights[i] ?? 1 })).filter((_, i) => assign[i] === j);
      if (!members.length) return;
      const total = members.reduce((s, m) => s + m.w, 0);
      centres[j] = normalize(members[0]!.p.map((_, d) => members.reduce((s, m) => s + m.p[d]! * m.w, 0) / total));
    });
  }
  return assign;
}
