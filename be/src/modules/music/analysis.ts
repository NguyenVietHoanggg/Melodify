/**
 * Audio analysis for user uploads — the same kind of "audio features" Spotify computes:
 *
 *  • Tempo (BPM): onset envelope (spectral flux = how much new energy appears in each frame) →
 *    autocorrelation → the strongest periodicity between 60 and 200 BPM, with a soft preference for
 *    ~120 BPM to avoid half/double-tempo mistakes.
 *  • Key: chromagram (energy per pitch class C…B) correlated with the 24 Krumhansl–Schmuckler key
 *    profiles (major & minor).
 *  • Energy / danceability / valence / acousticness: simple, explainable estimates from loudness,
 *    onset density, beat regularity, brightness and mode. Approximations — good enough to group songs.
 *
 * CPU work yields to the event loop regularly so a long analysis never freezes the API.
 */
import { fft, hann } from '../../lib/fft';
import type { MusicalKey } from './keys';

export interface AudioAnalysis {
  durationMs: number;
  bpm: number | null;
  key: MusicalKey | null;
  energy: number;
  danceability: number;
  valence: number;
  acousticness: number;
  loudnessDb: number;
}

const TARGET_RATE = 11025;
const yieldToEventLoop = () => new Promise<void>((r) => setImmediate(r));
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Mix to mono and downsample (averaging = a crude low-pass filter that avoids aliasing). */
function toMono(channels: Float32Array[], sampleRate: number): { data: Float32Array; rate: number } {
  const factor = Math.max(1, Math.floor(sampleRate / TARGET_RATE));
  const len = Math.floor(channels[0]!.length / factor);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    let s = 0;
    for (let k = 0; k < factor; k++) for (const ch of channels) s += ch[i * factor + k] ?? 0;
    out[i] = s / (factor * channels.length);
  }
  return { data: out, rate: sampleRate / factor };
}

const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i]! - ma) * (b[i]! - mb);
    da += (a[i]! - ma) ** 2;
    db += (b[i]! - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

export function detectKey(chroma: number[]): { key: MusicalKey; confidence: number } {
  let best = { key: { pitch: 0, mode: 1 } as MusicalKey, confidence: -Infinity };
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const [mode, profile] of [[1, MAJOR], [0, MINOR]] as const) {
      // Rotate the profile so index `tonic` holds the tonic weight.
      const rotated = chroma.map((_, pc) => profile[(pc - tonic + 12) % 12]!);
      const r = pearson(chroma, rotated);
      if (r > best.confidence) best = { key: { pitch: tonic, mode }, confidence: r };
    }
  }
  return best;
}

export function detectTempo(onset: Float64Array, framesPerSec: number): { bpm: number | null; strength: number } {
  const minLag = Math.floor((60 * framesPerSec) / 200);
  const maxLag = Math.ceil((60 * framesPerSec) / 60);
  let bestLag = 0;
  let bestScore = -Infinity;
  const scores: number[] = [];
  let norm = 0;
  for (let i = 0; i < onset.length; i++) norm += onset[i]! * onset[i]!;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let ac = 0;
    for (let i = lag; i < onset.length; i++) ac += onset[i]! * onset[i - lag]!;
    const bpm = (60 * framesPerSec) / lag;
    // Log-Gaussian tempo prior centred on 120 BPM (σ ≈ 1 octave) resolves half/double ambiguity.
    const prior = Math.exp(-0.5 * Math.log2(bpm / 120) ** 2 / 0.9 ** 2);
    const score = (ac / (norm || 1)) * prior;
    scores[lag] = score;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (!bestLag || bestScore <= 0) return { bpm: null, strength: 0 };
  // Parabolic interpolation around the peak for sub-frame precision.
  const y0 = scores[bestLag - 1] ?? bestScore;
  const y2 = scores[bestLag + 1] ?? bestScore;
  const denom = y0 - 2 * bestScore + y2;
  const shift = denom ? (0.5 * (y0 - y2)) / denom : 0;
  const lag = bestLag + Math.max(-0.5, Math.min(0.5, shift));
  return { bpm: Math.round(((60 * framesPerSec) / lag) * 10) / 10, strength: bestScore };
}

/** Analyse raw PCM (exported so tests can feed synthetic signals). */
export async function analyzePcm(channels: Float32Array[], sampleRate: number): Promise<AudioAnalysis> {
  const durationMs = Math.round((channels[0]!.length / sampleRate) * 1000);
  const { data, rate } = toMono(channels, sampleRate);

  // Analyse up to 90 s from the middle of the song (intros/outros are often unrepresentative).
  const maxLen = Math.floor(rate * 90);
  const start = data.length > maxLen ? Math.floor((data.length - maxLen) / 2) : 0;
  const seg = data.subarray(start, start + Math.min(maxLen, data.length));

  const N = 2048;
  const HOP = 256;
  const window = hann(N);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const bins = N / 2;
  let prev = new Float64Array(bins);
  const frames = Math.max(0, Math.floor((seg.length - N) / HOP));
  const onset = new Float64Array(frames);
  const chroma = new Array<number>(12).fill(0);
  let sumSq = 0;
  let centroidSum = 0;
  let centroidCount = 0;

  // Pitch class of each FFT bin (only 55 Hz – 2 kHz carries reliable pitch information).
  const binPc = new Int8Array(bins).fill(-1);
  for (let b = 1; b < bins; b++) {
    const f = (b * rate) / N;
    if (f >= 55 && f <= 2000) binPc[b] = ((Math.round(12 * Math.log2(f / 440)) % 12) + 12 + 9) % 12;
  }

  for (let fIdx = 0; fIdx < frames; fIdx++) {
    const off = fIdx * HOP;
    for (let i = 0; i < N; i++) {
      const s = seg[off + i]!;
      re[i] = s * window[i]!;
      im[i] = 0;
      if (i < HOP) sumSq += s * s;
    }
    fft(re, im);
    const mag = new Float64Array(bins);
    let flux = 0;
    let weighted = 0;
    let total = 0;
    for (let b = 1; b < bins; b++) {
      const m = Math.log1p(Math.hypot(re[b]!, im[b]!) * 10); // log compression ≈ how loudness is heard
      mag[b] = m;
      const d = m - prev[b]!;
      if (d > 0) flux += d;
      weighted += m * b;
      total += m;
      const pc = binPc[b]!;
      if (pc >= 0) chroma[pc]! += m * m;
    }
    onset[fIdx] = flux;
    if (total > 0) {
      centroidSum += weighted / total / bins;
      centroidCount++;
    }
    prev = mag;
    if (fIdx % 400 === 0) await yieldToEventLoop();
  }

  // Detrend the onset envelope (subtract a ~1 s moving average) so slow volume swells don't count as beats.
  const fps = rate / HOP;
  const win = Math.max(1, Math.round(fps));
  const detrended = new Float64Array(frames);
  let acc = 0;
  for (let i = 0; i < frames; i++) {
    acc += onset[i]!;
    if (i >= win) acc -= onset[i - win]!;
    detrended[i] = Math.max(0, onset[i]! - acc / Math.min(i + 1, win));
  }

  const tempo = frames > fps * 6 ? detectTempo(detrended, fps) : { bpm: null, strength: 0 };
  const chromaTotal = chroma.reduce((s, x) => s + x, 0);
  const key = chromaTotal > 0 ? detectKey(chroma) : null;

  const rms = Math.sqrt(sumSq / Math.max(1, frames * HOP));
  const loudnessDb = 20 * Math.log10(rms || 1e-9);
  const loud = clamp01((loudnessDb + 32) / 24); // -32 dBFS → 0, -8 dBFS → 1
  const onsetMean = detrended.reduce((s, x) => s + x, 0) / Math.max(1, frames);
  const onsetDensity = clamp01(onsetMean / 6);
  const brightness = clamp01((centroidCount ? centroidSum / centroidCount : 0.2) * 3);
  const tempoInPocket = tempo.bpm ? Math.exp(-0.5 * ((tempo.bpm - 118) / 18) ** 2) : 0.3;

  return {
    durationMs,
    bpm: tempo.bpm,
    key: key && key.confidence > 0.35 ? key.key : null,
    energy: clamp01(0.5 * loud + 0.3 * onsetDensity + 0.2 * brightness),
    danceability: clamp01(0.45 * clamp01(tempo.strength * 4) + 0.35 * tempoInPocket + 0.2 * onsetDensity),
    valence: clamp01(0.5 + (key?.key.mode === 1 ? 0.12 : -0.12) + 0.25 * (brightness - 0.5) + 0.1 * (onsetDensity - 0.5)),
    acousticness: clamp01(1 - (0.6 * brightness + 0.4 * loud)),
    loudnessDb: Math.round(loudnessDb * 10) / 10,
  };
}

/** Decode any common audio file (mp3, wav, flac, ogg, aac…) and analyse it. */
export async function analyzeAudio(file: Uint8Array): Promise<AudioAnalysis> {
  const { default: decode } = await import('audio-decode');
  const audio = (await decode(file)) as unknown as {
    sampleRate: number;
    numberOfChannels?: number;
    getChannelData?: (c: number) => Float32Array;
    channelData?: Float32Array[];
  };
  const channels = audio.getChannelData
    ? Array.from({ length: Math.min(2, audio.numberOfChannels ?? 1) }, (_, c) => audio.getChannelData!(c))
    : (audio.channelData ?? []).slice(0, 2);
  if (!channels.length || !channels[0]!.length) throw new Error('Could not decode audio');
  return analyzePcm(channels, audio.sampleRate);
}
