/**
 * Adaptive performance governor.
 *
 * Mobile GPUs vary by an order of magnitude, so rather than guessing from the
 * user agent we measure. The governor watches a rolling frame-time median and
 * steps the render scale (and, if needed, the quality tier) up or down to hold
 * the target framerate. Changes are rate-limited and hysteretic so the picture
 * never oscillates.
 */

export type PerfTier = 'high' | 'low';

export interface PerfState {
  /** Multiplier applied to devicePixelRatio, 0.55 – 1.0. */
  scale: number;
  tier: PerfTier;
  fps: number;
}

const TARGET_MS = 1000 / 60;
/** Above this we're dropping frames badly enough to act. */
const BAD_MS = 1000 / 48;
/** Below this we have headroom to spend. */
const GOOD_MS = 1000 / 58;

const MIN_SCALE = 0.55;
const MAX_SCALE = 1;
const WINDOW = 90;
/** Don't change anything more often than this. */
const COOLDOWN_MS = 1400;

export class PerfGovernor {
  private samples: number[] = [];
  private cursor = 0;
  private lastChange = 0;
  private scale: number;
  private tier: PerfTier;
  private autoTier: boolean;
  private sorted: number[] = [];

  /** Injectable clock so the governor's timing is testable. */
  private now: () => number;

  constructor(initialTier: PerfTier, autoTier = true, now?: () => number) {
    this.now = now ?? (() => performance.now());
    this.tier = initialTier;
    this.autoTier = autoTier;
    // Start conservative on obviously-weak devices, otherwise full res.
    this.scale = initialTier === 'low' ? 0.75 : MAX_SCALE;
  }

  /** Force the tier (user changed the quality setting by hand). */
  setTier(tier: PerfTier, manual: boolean) {
    this.tier = tier;
    if (manual) this.autoTier = false;
    this.scale = tier === 'low' ? Math.min(this.scale, 0.85) : this.scale;
    this.samples.length = 0;
    this.lastChange = this.now();
  }

  private median(): number {
    const n = this.samples.length;
    if (n === 0) return TARGET_MS;
    this.sorted.length = 0;
    for (let i = 0; i < n; i++) this.sorted.push(this.samples[i]);
    this.sorted.sort((a, b) => a - b);
    return this.sorted[n >> 1];
  }

  /**
   * Feed one frame's duration. Returns a new state when something changed,
   * otherwise null (so callers can skip work).
   */
  sample(frameMs: number): PerfState | null {
    // Ignore absurd spikes (tab switches, GC pauses, first frames).
    if (frameMs > 200 || frameMs <= 0) return null;

    if (this.samples.length < WINDOW) this.samples.push(frameMs);
    else {
      this.samples[this.cursor] = frameMs;
      this.cursor = (this.cursor + 1) % WINDOW;
    }
    if (this.samples.length < WINDOW * 0.6) return null;

    const now = this.now();
    if (now - this.lastChange < COOLDOWN_MS) return null;

    const med = this.median();
    let changed = false;

    if (med > BAD_MS) {
      // Shed resolution first — it's the cheapest, least visible lever.
      if (this.scale > MIN_SCALE) {
        this.scale = Math.max(MIN_SCALE, this.scale - 0.12);
        changed = true;
      } else if (this.autoTier && this.tier === 'high') {
        this.tier = 'low';
        this.scale = 0.75;
        changed = true;
      }
    } else if (med < GOOD_MS) {
      // Claw resolution back before promoting the tier again.
      if (this.scale < MAX_SCALE) {
        this.scale = Math.min(MAX_SCALE, this.scale + 0.06);
        changed = true;
      } else if (this.autoTier && this.tier === 'low' && med < TARGET_MS * 0.72) {
        this.tier = 'high';
        changed = true;
      }
    }

    if (!changed) return null;
    this.lastChange = now;
    this.samples.length = 0;
    this.cursor = 0;
    return { scale: this.scale, tier: this.tier, fps: 1000 / med };
  }

  get state(): PerfState {
    return { scale: this.scale, tier: this.tier, fps: 1000 / this.median() };
  }
}

/** One-time device hints used to pick the starting tier. */
export function detectInitialTier(): PerfTier {
  if (typeof navigator === 'undefined') return 'high';
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const cores = navigator.hardwareConcurrency ?? 4;
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const shortSide =
    typeof window !== 'undefined' ? Math.min(window.innerWidth, window.innerHeight) : 800;

  // Low-memory or few-core devices, and very high-DPI small screens (which
  // have the most pixels per unit of GPU), start on the low tier.
  if (mem !== undefined && mem <= 3) return 'low';
  if (cores <= 4) return 'low';
  if (dpr >= 3 && shortSide < 420) return 'low';
  return 'high';
}
