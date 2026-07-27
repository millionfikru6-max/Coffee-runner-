/**
 * Generative Ethiopian-inspired background music.
 * A looping masinko-style plucked melody over an anchihoye-flavored scale,
 * with a kebero-style drum pattern — synthesized, no external assets.
 */

import { ensureCtx, getMaster } from './audio';

// Anchihoye-flavored scale (A, Bb, C, E, F) across two octaves
const SCALE = [220.0, 233.08, 261.63, 329.63, 349.23, 440.0, 466.16, 523.25, 659.25, 698.46];

// Pre-composed 16-step phrases (scale degrees, -1 = rest)
const PHRASES: number[][] = [
  [2, -1, 4, -1, 5, -1, 4, 2, 1, -1, 2, -1, 0, -1, -1, -1],
  [4, 5, 4, -1, 2, -1, 1, 2, 0, -1, -1, 2, 4, -1, 2, -1],
  [5, -1, 7, -1, 8, -1, 7, 5, 4, -1, 2, 4, 5, -1, 4, -1],
  [0, 2, 4, 2, 5, -1, 4, -1, 2, 1, 2, -1, 0, -1, -1, -1],
];

const BPM = 94;
const STEP = 60 / BPM / 2; // 8th notes

class MusicEngine {
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextStepTime = 0;
  private step = 0;
  private phrase = 0;
  private enabled = true;
  private started = false;
  private gain: GainNode | null = null;

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) this.stop();
  }

  start() {
    if (!this.enabled || this.timer !== null) return;
    const ac = ensureCtx();
    const master = getMaster();
    if (!ac || !master) return;

    if (!this.gain) {
      this.gain = ac.createGain();
      this.gain.gain.value = 0.16;
      this.gain.connect(master);
    }
    this.started = true;
    this.nextStepTime = ac.currentTime + 0.08;
    this.timer = setInterval(() => this.schedule(), 30);
  }

  stop() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  suspend() {
    const ac = ensureCtx();
    if (ac && ac.state === 'running') void ac.suspend();
  }

  resume() {
    const ac = ensureCtx();
    if (ac && ac.state === 'suspended') void ac.resume();
    if (this.started && this.enabled && this.timer === null) this.start();
  }

  private schedule() {
    const ac = ensureCtx();
    if (!ac || !this.gain) return;

    while (this.nextStepTime < ac.currentTime + 0.14) {
      this.playStep(this.step, this.nextStepTime);
      this.nextStepTime += STEP;
      this.step = (this.step + 1) % 16;
      if (this.step === 0 && Math.random() < 0.6) {
        this.phrase = (this.phrase + 1) % PHRASES.length;
      }
    }
  }

  private playStep(step: number, t: number) {
    const ac = ensureCtx();
    if (!ac || !this.gain) return;

    // ---- kebero-style drums ----
    const kickSteps = [0, 3, 4, 10];
    if (kickSteps.includes(step)) this.kick(t);
    // shaker 8ths, accented
    this.shaker(t, step % 4 === 2 ? 0.1 : 0.05);
    if (step === 6 || step === 14) this.rim(t);

    // ---- bass ----
    if (step === 0 || step === 4 || step === 8 || step === 12) {
      const bassNote = step === 8 ? SCALE[0] / 2 : SCALE[0] / 2 * (step === 4 ? 1.189 : 1); // A2 / Bb2
      this.pluck(bassNote, t, 0.22, 'sine', STEP * 3.2);
    }

    // ---- masinko-style lead ----
    const deg = PHRASES[this.phrase][step];
    if (deg >= 0) {
      const f = SCALE[deg];
      this.pluck(f, t, 0.14, 'triangle', STEP * 1.8);
      // masinko shimmer — slight detuned double stop
      if (Math.random() < 0.35) this.pluck(f * 1.005, t + 0.012, 0.07, 'sawtooth', STEP * 1.2);
      // occasional grace note
      if (Math.random() < 0.18 && deg > 0) {
        this.pluck(SCALE[deg - 1], t + STEP * 0.5, 0.08, 'triangle', STEP * 0.9);
      }
    }
  }

  private pluck(freq: number, t: number, vol: number, type: OscillatorType, dur: number) {
    const ac = ensureCtx();
    if (!ac || !this.gain) return;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2600, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + dur);
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(lp);
    lp.connect(gain);
    gain.connect(this.gain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private kick(t: number) {
    const ac = ensureCtx();
    if (!ac || !this.gain) return;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, t);
    osc.frequency.exponentialRampToValueAtTime(44, t + 0.12);
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(gain);
    gain.connect(this.gain);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  private shaker(t: number, vol: number) {
    const ac = ensureCtx();
    if (!ac || !this.gain) return;
    const len = Math.floor(ac.sampleRate * 0.05);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5200;
    const gain = ac.createGain();
    gain.gain.value = vol;
    src.connect(hp);
    hp.connect(gain);
    gain.connect(this.gain);
    src.start(t);
  }

  private rim(t: number) {
    const ac = ensureCtx();
    if (!ac || !this.gain) return;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'square';
    osc.frequency.value = 1180;
    gain.gain.setValueAtTime(0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    osc.connect(gain);
    gain.connect(this.gain);
    osc.start(t);
    osc.stop(t + 0.05);
  }
}

export const music = new MusicEngine();
