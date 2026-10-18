/**
 * Smart Reorder — reorder a playlist so every transition is smooth (close BPM, compatible keys,
 * gentle energy changes). Finding the order with the minimum total cost is the Travelling
 * Salesman Problem (NP-hard), so we use the standard practical recipe:
 *   1. nearest-neighbour construction from several starting tracks, keep the cheapest path;
 *   2. 2-opt local search: keep reversing segments while that lowers the total cost.
 * For playlist sizes (≤ a few hundred tracks) this runs in milliseconds and is near-optimal.
 */
import { camelotDistance, type MusicalKey } from './keys';

export interface MixFeatures {
  id: string;
  bpm: number | null;
  key: MusicalKey | null;
  energy: number | null; // 0..1
}

/** Tempo difference that treats half/double time as equal (85 BPM ≈ 170 BPM for mixing). */
export function bpmDistance(a: number, b: number): number {
  const ratios = [b / a, (b * 2) / a, b / (a * 2)];
  return Math.min(...ratios.map((r) => Math.abs(1 - r)));
}

/** Cost of playing `b` right after `a`. Symmetric (required by 2-opt). ~0 = seamless, 3+ = rough. */
export function transitionCost(a: MixFeatures, b: MixFeatures): number {
  let cost = 0;
  if (a.bpm && b.bpm) cost += Math.min(bpmDistance(a.bpm, b.bpm) / 0.08, 3); // 8% tempo gap ≈ 1 unit
  else cost += 1;
  if (a.key && b.key) cost += [0, 0.3, 0.8, 1.4, 1.8, 2.2, 2.5, 2.8][camelotDistance(a.key, b.key)] ?? 3;
  else cost += 1;
  if (a.energy != null && b.energy != null) cost += Math.abs(a.energy - b.energy) * 2;
  else cost += 0.5;
  return cost;
}

function pathCost(order: number[], c: number[][]): number {
  let total = 0;
  for (let i = 1; i < order.length; i++) total += c[order[i - 1]!]![order[i]!]!;
  return total;
}

export interface SmartReorderOptions {
  /** Keep the first track where it is (e.g. the user's chosen opener). */
  keepFirst?: boolean;
  /** Max nearest-neighbour starting points tried (bounded for big playlists). */
  maxStarts?: number;
}

export function smartReorder<T extends MixFeatures>(tracks: readonly T[], opts: SmartReorderOptions = {}): T[] {
  const n = tracks.length;
  if (n < 3) return tracks.slice();
  const c: number[][] = tracks.map((a) => tracks.map((b) => (a === b ? 0 : transitionCost(a, b))));

  const starts = opts.keepFirst ? [0] : [...Array(n).keys()].slice(0, opts.maxStarts ?? 60);
  let best: number[] = [];
  let bestCost = Infinity;
  for (const start of starts) {
    const visited = new Uint8Array(n);
    const order = [start];
    visited[start] = 1;
    for (let step = 1; step < n; step++) {
      const last = order[order.length - 1]!;
      let next = -1;
      let nextCost = Infinity;
      for (let j = 0; j < n; j++) {
        if (!visited[j] && c[last]![j]! < nextCost) {
          nextCost = c[last]![j]!;
          next = j;
        }
      }
      visited[next] = 1;
      order.push(next);
    }
    const cost = pathCost(order, c);
    if (cost < bestCost) {
      bestCost = cost;
      best = order;
    }
  }

  // 2-opt on an open path: reversing order[i..j] only changes the edges at both ends.
  const first = opts.keepFirst ? 1 : 0;
  let improved = true;
  for (let pass = 0; improved && pass < 50; pass++) {
    improved = false;
    for (let i = Math.max(first, 1); i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = best[i - 1]!;
        const b = best[i]!;
        const d = best[j]!;
        const e = j + 1 < n ? best[j + 1]! : -1;
        const before = c[a]![b]! + (e >= 0 ? c[d]![e]! : 0);
        const after = c[a]![d]! + (e >= 0 ? c[b]![e]! : 0);
        if (after + 1e-9 < before) {
          best = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
          improved = true;
        }
      }
    }
    // Reversing a prefix (when the first track is free) can also help: treat it as i = 0.
    if (!opts.keepFirst) {
      for (let j = 1; j < n - 1; j++) {
        const before = c[best[j]!]![best[j + 1]!]!;
        const after = c[best[0]!]![best[j + 1]!]!;
        if (after + 1e-9 < before) {
          best = [...best.slice(0, j + 1).reverse(), ...best.slice(j + 1)];
          improved = true;
        }
      }
    }
  }
  return best.map((i) => tracks[i]!);
}

export function totalTransitionCost(tracks: readonly MixFeatures[]): number {
  let total = 0;
  for (let i = 1; i < tracks.length; i++) total += transitionCost(tracks[i - 1]!, tracks[i]!);
  return total;
}
