/**
 * Audio bus architecture.
 *
 * The original build sent every sound straight to one master gain, so music
 * and SFX fought each other and nothing had space. This adds a proper mix:
 *
 *   sfxBus  ─┬─► sfxComp ─┐
 *   musicBus─┴─► duckGain ┼─► masterComp ─► destination
 *   ambBus  ─────────────►┘
 *        └─► reverbSend ─► convolver ─► reverbReturn ─┘
 *
 * - separate SFX / music / ambience buses with independent volumes,
 * - a convolution reverb whose size changes per biome (a tukul village is
 *   dry, the Simien escarpment and the Blue Nile gorge are huge),
 * - side-chain ducking so music dips under important SFX,
 * - a limiter on the master so layered hits never clip on phone speakers,
 * - stereo panning helpers so obstacles and pickups play from their lane.
 */

import { ensureCtx, getMaster } from './audio';

export type BusName = 'sfx' | 'music' | 'ambience';

export interface ReverbProfile {
  /** Impulse length in seconds. */
  seconds: number;
  /** Exponential decay rate; higher = tighter. */
  decay: number;
  /** Wet level 0..1. */
  wet: number;
}

/** Per-biome acoustic character — this is what makes places sound different. */
export const REVERB_PROFILES: Record<string, ReverbProfile> = {
  coffee_highlands: { seconds: 1.6, decay: 2.6, wet: 0.16 },
  traditional_village: { seconds: 1.1, decay: 3.4, wet: 0.1 },
  addis_ababa: { seconds: 1.3, decay: 3.0, wet: 0.13 },
  simien_mountains: { seconds: 3.4, decay: 1.7, wet: 0.3 },
  blue_nile: { seconds: 2.6, decay: 2.0, wet: 0.24 },
};

function buildImpulse(ac: AudioContext, p: ReverbProfile): AudioBuffer {
  const rate = ac.sampleRate;
  const len = Math.max(1, Math.floor(rate * p.seconds));
  const buf = ac.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // Noise burst with an exponential tail; slight L/R decorrelation
      // keeps the tail wide instead of collapsing to the centre.
      const env = Math.pow(1 - t, p.decay);
      data[i] = (Math.random() * 2 - 1) * env * (ch === 0 ? 1 : 0.92);
    }
  }
  return buf;
}

class AudioBuses {
  private ready = false;
  private ac: AudioContext | null = null;

  sfx: GainNode | null = null;
  music: GainNode | null = null;
  ambience: GainNode | null = null;

  private duck: GainNode | null = null;
  private reverbSend: GainNode | null = null;
  private reverbReturn: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;

  private volumes: Record<BusName, number> = { sfx: 1, music: 0.55, ambience: 0.5 };
  private currentProfile = '';
  private duckUntil = 0;

  /** Build the graph lazily on the first user gesture. */
  init(): boolean {
    if (this.ready) return true;
    const ac = ensureCtx();
    const master = getMaster();
    if (!ac || !master) return false;
    this.ac = ac;

    // Limiter: fast attack, hard ratio. Stops layered hits from clipping.
    this.limiter = ac.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 4;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.16;
    this.limiter.connect(master);

    this.reverbReturn = ac.createGain();
    this.reverbReturn.gain.value = 0.18;
    this.reverbReturn.connect(this.limiter);

    this.convolver = ac.createConvolver();
    this.convolver.connect(this.reverbReturn);

    this.reverbSend = ac.createGain();
    this.reverbSend.gain.value = 1;
    this.reverbSend.connect(this.convolver);

    this.sfx = ac.createGain();
    this.sfx.gain.value = this.volumes.sfx;
    this.sfx.connect(this.limiter);
    this.sfx.connect(this.reverbSend);

    this.duck = ac.createGain();
    this.duck.gain.value = 1;
    this.duck.connect(this.limiter);

    this.music = ac.createGain();
    this.music.gain.value = this.volumes.music;
    this.music.connect(this.duck);

    this.ambience = ac.createGain();
    this.ambience.gain.value = this.volumes.ambience;
    this.ambience.connect(this.limiter);
    this.ambience.connect(this.reverbSend);

    // Mark ready before setReverb: it calls init() and would otherwise recurse.
    this.ready = true;
    this.setReverb('coffee_highlands');
    return true;
  }

  get context() {
    return this.ac;
  }

  bus(name: BusName): GainNode | null {
    if (!this.init()) return null;
    return name === 'sfx' ? this.sfx : name === 'music' ? this.music : this.ambience;
  }

  setVolume(name: BusName, v: number) {
    this.volumes[name] = v;
    const b = this.bus(name);
    if (b && this.ac) {
      b.gain.setTargetAtTime(v, this.ac.currentTime, 0.05);
    }
  }

  /** Swap the reverb impulse when the biome changes. */
  setReverb(biome: string) {
    if (!this.init() || !this.ac || !this.convolver || !this.reverbReturn) return;
    if (biome === this.currentProfile) return;
    const p = REVERB_PROFILES[biome] ?? REVERB_PROFILES.coffee_highlands;
    this.currentProfile = biome;
    this.convolver.buffer = buildImpulse(this.ac, p);
    this.reverbReturn.gain.setTargetAtTime(p.wet, this.ac.currentTime, 0.6);
  }

  /**
   * Duck the music bus for `ms` — used on impacts, power-ups and fanfares so
   * the important sound always cuts through.
   */
  duckMusic(amount = 0.45, ms = 320) {
    if (!this.init() || !this.ac || !this.duck) return;
    const now = this.ac.currentTime;
    const until = now + ms / 1000;
    if (until < this.duckUntil) return;
    this.duckUntil = until;
    this.duck.gain.cancelScheduledValues(now);
    this.duck.gain.setValueAtTime(this.duck.gain.value, now);
    this.duck.gain.linearRampToValueAtTime(1 - amount, now + 0.03);
    this.duck.gain.setTargetAtTime(1, now + ms / 1000, 0.12);
  }

  /** Create a panner for lane-positioned sounds. -1 left … 1 right. */
  panner(pan: number): StereoPannerNode | null {
    if (!this.init() || !this.ac) return null;
    const p = this.ac.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    return p;
  }
}

export const buses = new AudioBuses();

/** Lane index (0,1,2) → stereo pan position. */
export function lanePan(lane: number): number {
  return (lane - 1) * 0.55;
}
