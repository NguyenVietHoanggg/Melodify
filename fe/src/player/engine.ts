/**
 * Audio engine — two "decks" like a DJ mixer, built on the Web Audio API:
 *
 *   deck A: <audio> → BiquadFilter → Gain ─┐
 *                                          ├→ master Gain (volume) → speakers
 *   deck B: <audio> → BiquadFilter → Gain ─┘
 *
 * The backend sends a transition RECIPE (gain curves, filter sweeps, tempo nudge); the engine only
 * executes it with sample-accurate automation (AudioParam.setValueCurveAtTime). No decisions here.
 *
 * Podcasts use a separate plain <audio> element: many podcast hosts don't send CORS headers, and a
 * media element routed into Web Audio without CORS would play silence.
 */
import type { CurvePoint, FilterSweep, TransitionRecipe } from '@contracts';

interface Deck {
  el: HTMLAudioElement;
  source: MediaElementAudioSourceNode | null;
  filter: BiquadFilterNode | null;
  gain: GainNode | null;
  uid: string | null;
}

type Listener = {
  ended?: (uid: string) => void;
  error?: (uid: string) => void;
  waiting?: (waiting: boolean) => void;
};

/** Resample a recipe curve (points at arbitrary t) to N evenly spaced values for setValueCurveAtTime. */
function sample(curve: CurvePoint[], n = 64): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    let k = 0;
    while (k < curve.length - 2 && curve[k + 1]!.t < t) k++;
    const a = curve[k]!;
    const b = curve[k + 1] ?? a;
    const span = b.t - a.t || 1;
    out[i] = a.v + ((b.v - a.v) * Math.min(1, Math.max(0, t - a.t))) / span;
  }
  return out;
}

function makeElement(crossOrigin: boolean): HTMLAudioElement {
  const el = new Audio();
  el.preload = 'auto';
  if (crossOrigin) el.crossOrigin = 'anonymous';
  // Browsers keep the pitch when playbackRate changes (needed for Mix tempo matching).
  (el as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
  return el;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private decks: [Deck, Deck] = [
    { el: makeElement(true), source: null, filter: null, gain: null, uid: null },
    { el: makeElement(true), source: null, filter: null, gain: null, uid: null },
  ];
  private plain: HTMLAudioElement = makeElement(false);
  private plainUid: string | null = null;
  private activeIdx: 0 | 1 = 0;
  private usingPlain = false;
  private listeners: Listener = {};
  private volume = 0.8;
  private muted = false;
  private transitionTimer = 0;
  private speaking = false;

  constructor() {
    const wire = (el: HTMLAudioElement, uidOf: () => string | null) => {
      el.addEventListener('ended', () => {
        const uid = uidOf();
        if (uid) this.listeners.ended?.(uid);
      });
      el.addEventListener('error', () => {
        const uid = uidOf();
        if (uid && el.src) this.listeners.error?.(uid);
      });
      el.addEventListener('waiting', () => this.listeners.waiting?.(true));
      el.addEventListener('playing', () => this.listeners.waiting?.(false));
    };
    this.decks.forEach((d) => wire(d.el, () => (this.decks[this.activeIdx] === d ? d.uid : null)));
    wire(this.plain, () => (this.usingPlain ? this.plainUid : null));
  }

  on(l: Listener) {
    this.listeners = { ...this.listeners, ...l };
  }

  /** Must run inside a user gesture the first time (browser autoplay policy). */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      for (const d of this.decks) {
        d.source = this.ctx.createMediaElementSource(d.el);
        d.filter = this.ctx.createBiquadFilter();
        d.gain = this.ctx.createGain();
        this.resetFilter(d);
        d.source.connect(d.filter).connect(d.gain).connect(this.master);
      }
      this.applyVolume();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private resetFilter(d: Deck) {
    if (!d.filter || !this.ctx) return;
    d.filter.frequency.cancelScheduledValues(0);
    d.filter.gain.cancelScheduledValues(0);
    d.filter.type = 'lowshelf';
    d.filter.frequency.value = 200;
    d.filter.gain.value = 0; // a 0 dB shelf is transparent
  }

  private get deck() {
    return this.decks[this.activeIdx];
  }
  private get idle() {
    return this.decks[this.activeIdx === 0 ? 1 : 0];
  }
  private get el(): HTMLAudioElement {
    return this.usingPlain ? this.plain : this.deck.el;
  }

  private applyVolume() {
    // Perceived loudness is roughly logarithmic; squaring the slider value feels linear to the ear.
    const v = this.muted ? 0 : this.volume * this.volume;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
    this.plain.volume = v;
    if (!this.ctx) for (const d of this.decks) d.el.volume = v;
  }

  setVolume(volume: number, muted: boolean) {
    this.volume = Math.min(1, Math.max(0, volume));
    this.muted = muted;
    this.applyVolume();
  }

  /** Load an item into the active deck (music) or the plain element (podcasts). */
  load(uid: string, url: string, opts: { music: boolean; positionMs: number; autoplay: boolean }) {
    this.cancelTransition();
    this.stopSpeech();
    if (opts.music) {
      this.plain.pause();
      this.usingPlain = false;
      const d = this.deck;
      if (d.uid !== uid || d.el.src !== url) {
        d.uid = uid;
        d.el.src = url;
      }
      if (d.gain && this.ctx) d.gain.gain.setValueAtTime(1, this.ctx.currentTime);
      d.el.playbackRate = 1;
      this.idle.el.pause();
    } else {
      for (const d of this.decks) d.el.pause();
      this.usingPlain = true;
      this.plainUid = uid;
      if (this.plain.src !== url) this.plain.src = url;
    }
    const el = this.el;
    const seekWhenReady = () => {
      if (opts.positionMs > 0) el.currentTime = opts.positionMs / 1000;
    };
    if (el.readyState >= 1) seekWhenReady();
    else el.addEventListener('loadedmetadata', seekWhenReady, { once: true });
    if (opts.autoplay) void this.play();
  }

  /** Warm up the next item on the idle deck so the switch is instant. */
  preload(uid: string, url: string) {
    const d = this.idle;
    if (this.usingPlain || d.uid === uid) return;
    d.uid = uid;
    d.el.src = url;
    d.el.load();
  }

  async play() {
    try {
      await this.el.play();
    } catch {
      // Autoplay blocked until the user interacts; the controller will retry on the next gesture.
    }
  }

  pause() {
    this.el.pause();
    this.idle.el.pause();
    if (this.speaking) window.speechSynthesis?.pause();
  }

  stopAll() {
    this.cancelTransition();
    this.stopSpeech();
    for (const d of this.decks) d.el.pause();
    this.plain.pause();
  }

  seek(ms: number) {
    this.el.currentTime = Math.max(0, ms / 1000);
  }

  get paused() {
    return this.speaking ? false : this.el.paused;
  }
  get currentUid() {
    return this.usingPlain ? this.plainUid : this.deck.uid;
  }
  get positionMs() {
    return Math.round(this.el.currentTime * 1000);
  }
  get durationMs() {
    const d = this.el.duration;
    return Number.isFinite(d) ? Math.round(d * 1000) : 0;
  }

  /**
   * Execute a Mix/crossfade recipe: the idle deck (already preloaded with `uid`) starts from 0 and both
   * decks follow their automation curves. When it's done the idle deck becomes the active one.
   */
  startTransition(recipe: TransitionRecipe, uid: string, url: string) {
    if (!this.ctx || this.usingPlain) return false;
    const from = this.deck;
    const to = this.idle;
    if (to.uid !== uid) {
      to.uid = uid;
      to.el.src = url;
    }
    const now = this.ctx.currentTime + 0.05;
    const dur = recipe.durationMs / 1000;
    const automate = (d: Deck, gain: CurvePoint[], filter?: FilterSweep) => {
      d.gain!.gain.cancelScheduledValues(0);
      d.gain!.gain.setValueCurveAtTime(sample(gain), now, dur);
      if (filter) {
        d.filter!.type = filter.type;
        if (filter.type === 'lowshelf') d.filter!.frequency.value = filter.frequency ?? 200;
        const param = filter.param === 'gain' ? d.filter!.gain : d.filter!.frequency;
        param.cancelScheduledValues(0);
        param.setValueCurveAtTime(sample(filter.curve), now, dur);
      } else {
        this.resetFilter(d);
      }
    };
    to.el.currentTime = 0;
    to.el.playbackRate = recipe.tempoMatchRate ?? 1;
    automate(from, recipe.out.gain, recipe.out.filter);
    automate(to, recipe.in.gain, recipe.in.filter);
    void to.el.play();
    this.activeIdx = this.activeIdx === 0 ? 1 : 0;

    window.clearTimeout(this.transitionTimer);
    this.transitionTimer = window.setTimeout(() => {
      from.el.pause();
      this.resetFilter(from);
      this.resetFilter(to);
      // Ease the tempo nudge back to normal so the new song continues at its own speed.
      to.el.playbackRate = 1;
    }, recipe.durationMs + 100);
    return true;
  }

  private cancelTransition() {
    window.clearTimeout(this.transitionTimer);
    if (!this.ctx) return;
    for (const d of this.decks) {
      d.gain?.gain.cancelScheduledValues(0);
      d.gain?.gain.setValueAtTime(1, this.ctx.currentTime);
      this.resetFilter(d);
      d.el.playbackRate = 1;
    }
  }

  /** Spoken (text-to-speech) audio ad. */
  speak(uid: string, text: string, lang: string, onEnd: () => void) {
    this.stopAll();
    const synth = window.speechSynthesis;
    if (!synth) {
      window.setTimeout(onEnd, 8000);
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 1.05;
    u.volume = this.muted ? 0 : this.volume;
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
    if (voice) u.voice = voice;
    this.speaking = true;
    this.plainUid = uid;
    u.onend = () => {
      this.speaking = false;
      onEnd();
    };
    synth.cancel();
    synth.speak(u);
  }

  private stopSpeech() {
    if (this.speaking) {
      this.speaking = false;
      window.speechSynthesis?.cancel();
    }
  }

  resumeSpeech() {
    window.speechSynthesis?.resume();
  }
}

export const audioEngine = new AudioEngine();
