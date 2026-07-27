/**
 * Procedural biome ambience.
 *
 * Each biome gets a continuous bed (wind, water, city hum) plus randomised
 * one-shots (birds, goat bells, distant horns, insects) that cross-fade as
 * you travel. Everything is synthesised, so there are no audio downloads and
 * the whole soundscape costs a handful of oscillators.
 */

import type { Biome, TimeOfDay, Weather } from './types';
import { buses } from './audioBus';

interface Bed {
  source: AudioBufferSourceNode;
  gain: GainNode;
  filter: BiquadFilterNode;
}

function noiseBuffer(ac: AudioContext, seconds = 4): AudioBuffer {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // Brown-ish noise: much more natural for wind and water than white.
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.2;
    }
    // Smooth the loop point so there's no click every 4 seconds.
    const fade = Math.floor(ac.sampleRate * 0.05);
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      d[i] *= t;
      d[len - 1 - i] *= t;
    }
  }
  return buf;
}

export class Ambience {
  private started = false;
  private enabled = true;
  private wind: Bed | null = null;
  private water: Bed | null = null;
  private city: { osc: OscillatorNode; gain: GainNode } | null = null;
  private rain: Bed | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private biome: Biome = 'coffee_highlands';
  private tod: TimeOfDay = 'day';

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) this.stop();
    else if (this.started) this.start();
  }

  start() {
    if (!this.enabled || this.wind) return;
    if (!buses.init()) return;
    const ac = buses.context;
    const out = buses.bus('ambience');
    if (!ac || !out) return;

    this.started = true;
    const buf = noiseBuffer(ac);

    const makeBed = (freq: number, type: BiquadFilterType, gain: number): Bed => {
      const source = ac.createBufferSource();
      source.buffer = buf;
      source.loop = true;
      const filter = ac.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = 0.7;
      const g = ac.createGain();
      g.gain.value = gain;
      source.connect(filter);
      filter.connect(g);
      g.connect(out);
      source.start();
      return { source, gain: g, filter };
    };

    this.wind = makeBed(420, 'lowpass', 0);
    this.water = makeBed(900, 'bandpass', 0);
    this.rain = makeBed(3200, 'highpass', 0);

    // City hum: a low drone under the traffic noise.
    const osc = ac.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 58;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 160;
    const cg = ac.createGain();
    cg.gain.value = 0;
    osc.connect(lp);
    lp.connect(cg);
    cg.connect(out);
    osc.start();
    this.city = { osc, gain: cg };

    this.scheduleOneShot();
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    for (const bed of [this.wind, this.water, this.rain]) {
      if (!bed) continue;
      try {
        bed.source.stop();
      } catch {
        /* already stopped */
      }
      bed.gain.disconnect();
    }
    this.wind = this.water = this.rain = null;
    if (this.city) {
      try {
        this.city.osc.stop();
      } catch {
        /* already stopped */
      }
      this.city.gain.disconnect();
      this.city = null;
    }
  }

  /** Called from the game loop when the world state changes. */
  setScene(biome: Biome, tod: TimeOfDay, weather: Weather, windStrength: number, speed01: number) {
    this.biome = biome;
    this.tod = tod;
    if (!this.wind || !this.water || !this.rain || !this.city) return;
    const ac = buses.context;
    if (!ac) return;
    const now = ac.currentTime;
    const glide = 1.2;

    buses.setReverb(biome);

    // ---- wind: strongest high in the Simiens, and it rises with your speed
    const windLevel =
      (biome === 'simien_mountains' ? 0.5 : biome === 'coffee_highlands' ? 0.28 : 0.2) *
      (0.5 + windStrength) +
      speed01 * 0.12;
    this.wind.gain.gain.setTargetAtTime(windLevel, now, glide);
    this.wind.filter.frequency.setTargetAtTime(320 + windStrength * 700 + speed01 * 500, now, glide);

    // ---- water: the Blue Nile roars, the highlands just trickle
    const waterLevel = biome === 'blue_nile' ? 0.42 : biome === 'simien_mountains' ? 0.12 : 0;
    this.water.gain.gain.setTargetAtTime(waterLevel, now, glide);

    // ---- city hum
    const cityLevel = biome === 'addis_ababa' ? (tod === 'night' ? 0.1 : 0.2) : 0;
    this.city.gain.gain.setTargetAtTime(cityLevel, now, glide);

    // ---- rain
    const rainLevel = weather === 'storm' ? 0.5 : weather === 'rain' ? 0.32 : 0;
    this.rain.gain.gain.setTargetAtTime(rainLevel, now, 0.8);
  }

  /** Randomised wildlife / village one-shots layered over the bed. */
  private scheduleOneShot() {
    if (!this.enabled) return;
    const delay = 2200 + Math.random() * 4800;
    this.timer = setTimeout(() => {
      this.playOneShot();
      this.scheduleOneShot();
    }, delay);
  }

  private playOneShot() {
    const ac = buses.context;
    const out = buses.bus('ambience');
    if (!ac || !out || !this.enabled) return;
    const t = ac.currentTime;
    const pan = (Math.random() - 0.5) * 1.6;

    const voice = (
      freq: number,
      dur: number,
      type: OscillatorType,
      vol: number,
      slideTo?: number,
      delay = 0,
    ) => {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      const p = ac.createStereoPanner();
      p.pan.value = pan;
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t + delay);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + delay + dur);
      g.gain.setValueAtTime(0.0001, t + delay);
      g.gain.exponentialRampToValueAtTime(vol, t + delay + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
      osc.connect(g);
      g.connect(p);
      p.connect(out);
      osc.start(t + delay);
      osc.stop(t + delay + dur + 0.03);
    };

    const night = this.tod === 'night';

    if (night) {
      // Crickets and the occasional distant hyena whoop.
      if (Math.random() < 0.7) {
        for (let i = 0; i < 4; i++) voice(4200 + Math.random() * 400, 0.03, 'square', 0.012, undefined, i * 0.07);
      } else if (this.biome === 'simien_mountains' || this.biome === 'coffee_highlands') {
        voice(300, 0.5, 'sine', 0.05, 620);
        voice(620, 0.35, 'sine', 0.03, 420, 0.5);
      }
      return;
    }

    switch (this.biome) {
      case 'addis_ababa':
        // Bajaj horn, two quick beeps.
        voice(660, 0.14, 'square', 0.035);
        voice(660, 0.12, 'square', 0.03, undefined, 0.2);
        break;
      case 'traditional_village':
        if (Math.random() < 0.5) {
          // Goat bell.
          voice(1180, 0.22, 'triangle', 0.03);
          voice(1560, 0.18, 'triangle', 0.02, undefined, 0.05);
        } else {
          // Bleat.
          voice(420, 0.28, 'sawtooth', 0.028, 300);
        }
        break;
      case 'blue_nile':
        // Fish eagle / kingfisher call.
        voice(1500, 0.12, 'sine', 0.03, 1900);
        voice(1900, 0.1, 'sine', 0.024, 1400, 0.14);
        voice(1700, 0.14, 'sine', 0.02, 1200, 0.28);
        break;
      case 'simien_mountains':
        // Raven croak, thin air.
        voice(240, 0.2, 'sawtooth', 0.03, 180);
        voice(220, 0.16, 'sawtooth', 0.022, 170, 0.26);
        break;
      case 'coffee_highlands':
      default: {
        // Songbird trill.
        const base = 2100 + Math.random() * 700;
        for (let i = 0; i < 5; i++) {
          voice(base * (1 + (i % 2) * 0.18), 0.05, 'sine', 0.022, undefined, i * 0.075);
        }
        break;
      }
    }
  }
}

export const ambience = new Ambience();
