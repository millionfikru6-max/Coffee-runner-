/** Lightweight WebAudio synthesizer for juicy SFX + shared context for music */

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let enabled = true;

export function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.35;
      masterGain.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
  return ctx;
}

export function getMaster(): GainNode | null {
  return masterGain;
}

export function setAudioEnabled(on: boolean) {
  enabled = on;
}

function tone(
  freq: number,
  duration: number,
  type: OscillatorType = 'square',
  volume = 0.3,
  slideTo?: number,
  delay = 0,
) {
  if (!enabled) return;
  const ac = ensureCtx();
  if (!ac || !masterGain) return;

  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + duration);
  }
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(t0);
  osc.stop(t0 + duration);
}

function noise(duration: number, volume = 0.15, freq = 800, delay = 0, sweepTo?: number) {
  if (!enabled) return;
  const ac = ensureCtx();
  if (!ac || !masterGain) return;

  const t0 = ac.currentTime + delay;
  const bufferSize = Math.floor(ac.sampleRate * duration);
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const gain = ac.createGain();
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(freq, t0);
  if (sweepTo !== undefined) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t0 + duration);
  }
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  src.start(t0);
}

export const sfx = {
  jump: () => tone(300, 0.12, 'square', 0.18, 560),
  land: () => {
    tone(140, 0.08, 'sine', 0.22, 70);
    noise(0.05, 0.08, 300);
  },
  slide: () => noise(0.12, 0.12, 500, 0, 200),
  lane: () => tone(460, 0.05, 'triangle', 0.14, 520),
  bean: () => {
    tone(660, 0.07, 'sine', 0.2);
    tone(880, 0.09, 'sine', 0.16, undefined, 0.04);
  },
  coin: () => {
    tone(880, 0.06, 'square', 0.13);
    tone(1175, 0.12, 'square', 0.16, undefined, 0.05);
  },
  powerup: () => {
    tone(392, 0.08, 'square', 0.16);
    tone(523, 0.08, 'square', 0.16, undefined, 0.07);
    tone(659, 0.1, 'square', 0.18, undefined, 0.14);
    tone(784, 0.16, 'square', 0.2, undefined, 0.21);
  },
  shieldBreak: () => {
    tone(980, 0.18, 'sine', 0.22, 240);
    noise(0.15, 0.18, 2400, 0, 400);
  },
  nearMiss: () => noise(0.14, 0.1, 400, 0, 1800),
  hit: () => {
    tone(120, 0.25, 'sawtooth', 0.3, 40);
    noise(0.2, 0.25);
  },
  combo: () => tone(523, 0.08, 'sine', 0.2, 784),
  ui: () => tone(520, 0.05, 'triangle', 0.12),
  buy: () => {
    tone(740, 0.07, 'square', 0.16);
    tone(1108, 0.12, 'square', 0.18, undefined, 0.06);
  },
  error: () => tone(160, 0.16, 'sawtooth', 0.14, 110),
  fanfare: () => {
    tone(523, 0.1, 'square', 0.16);
    tone(659, 0.1, 'square', 0.16, undefined, 0.1);
    tone(784, 0.12, 'square', 0.18, undefined, 0.2);
    tone(1046, 0.24, 'square', 0.2, undefined, 0.3);
  },
  revive: () => {
    tone(220, 0.35, 'sawtooth', 0.16, 880);
    tone(440, 0.3, 'triangle', 0.14, 1760, undefined);
  },
  adReward: () => {
    tone(880, 0.06, 'sine', 0.16);
    tone(1175, 0.06, 'sine', 0.16, undefined, 0.06);
    tone(1568, 0.14, 'sine', 0.18, undefined, 0.12);
  },
  start: () => {
    tone(392, 0.1, 'square', 0.2);
    tone(523, 0.1, 'square', 0.2, undefined, 0.1);
    tone(659, 0.15, 'square', 0.22, undefined, 0.2);
  },
  gameOver: () => {
    tone(392, 0.15, 'sawtooth', 0.2, 300);
    tone(294, 0.2, 'sawtooth', 0.2, 200, 0.15);
    tone(220, 0.35, 'sawtooth', 0.22, 110, 0.32);
  },
};
