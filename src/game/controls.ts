/**
 * Mobile-first gesture controller.
 *
 * The original build only resolved a swipe on pointer-up, which added the
 * whole duration of the swipe to input latency — on a phone that's 80-150ms
 * and it feels broken. This version:
 *
 *  - fires the moment a swipe passes its threshold (during pointermove),
 *    so the action lands as soon as the intent is clear;
 *  - supports swipe chaining (lift-free double swipes) by re-arming after
 *    each recognised gesture;
 *  - scales thresholds to device pixel density instead of using raw pixels;
 *  - keeps a short input buffer so a jump pressed just before landing still
 *    registers, which is what makes runners feel responsive;
 *  - distinguishes taps from swipes by distance *and* velocity;
 *  - ignores gestures that start on UI (elements marked data-ui).
 */

export interface ControlActions {
  moveLane: (dir: -1 | 1) => void;
  jump: () => void;
  slide: () => void;
  isPlaying: () => boolean;
  /** True when the player is airborne — lets us buffer the next input. */
  isAirborne: () => boolean;
  vibrate: (ms: number) => void;
}

interface Touch {
  id: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  t: number;
  consumed: boolean;
  moved: boolean;
}

type Buffered = { action: 'jump' | 'slide'; at: number } | null;

/** Input buffer window: an action queued this recently still fires on landing. */
const BUFFER_MS = 160;

export class GestureController {
  private touch: Touch | null = null;
  private buffered: Buffered = null;
  private threshold = 26;
  private actions: ControlActions;
  private detach: (() => void)[] = [];

  constructor(el: HTMLElement, actions: ControlActions) {
    this.actions = actions;
    // Bigger screens need a slightly longer swipe to avoid accidental triggers.
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 3) : 1;
    const shortSide = typeof window !== 'undefined' ? Math.min(window.innerWidth, window.innerHeight) : 400;
    this.threshold = Math.max(18, Math.min(46, shortSide * 0.055)) * (dpr > 2 ? 1.1 : 1);

    const down = (e: PointerEvent) => this.onDown(e);
    const move = (e: PointerEvent) => this.onMove(e);
    const up = (e: PointerEvent) => this.onUp(e);
    const cancel = () => {
      this.touch = null;
    };

    el.addEventListener('pointerdown', down, { passive: true });
    el.addEventListener('pointermove', move, { passive: true });
    el.addEventListener('pointerup', up, { passive: true });
    el.addEventListener('pointercancel', cancel, { passive: true });
    el.addEventListener('lostpointercapture', cancel, { passive: true });

    this.detach.push(() => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      el.removeEventListener('lostpointercapture', cancel);
    });
  }

  private fromUI(e: PointerEvent): boolean {
    const t = e.target as HTMLElement | null;
    return !!t?.closest?.('[data-ui]');
  }

  private onDown(e: PointerEvent) {
    if (this.fromUI(e)) return;
    this.touch = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      t: performance.now(),
      consumed: false,
      moved: false,
    };
  }

  private onMove(e: PointerEvent) {
    const t = this.touch;
    if (!t || t.id !== e.pointerId) return;
    t.x = e.clientX;
    t.y = e.clientY;

    if (!this.actions.isPlaying()) return;

    const dx = t.x - t.startX;
    const dy = t.y - t.startY;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (Math.max(adx, ady) > 6) t.moved = true;
    if (Math.max(adx, ady) < this.threshold) return;

    // Resolve immediately — this is the latency win over the old pointerup path.
    if (adx > ady) {
      this.actions.moveLane(dx > 0 ? 1 : -1);
      this.actions.vibrate(8);
    } else if (dy < 0) {
      this.doJump();
    } else {
      this.doSlide();
    }

    // Re-arm from the current position so a continuous zig-zag keeps working.
    t.startX = t.x;
    t.startY = t.y;
    t.t = performance.now();
    t.consumed = true;
  }

  private onUp(e: PointerEvent) {
    const t = this.touch;
    this.touch = null;
    if (!t || t.id !== e.pointerId) return;
    if (!this.actions.isPlaying()) return;
    if (t.consumed) return;

    const dt = performance.now() - t.t;
    const dx = e.clientX - t.startX;
    const dy = e.clientY - t.startY;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const dist = Math.hypot(dx, dy);

    // A flick that never crossed the distance threshold still counts if it
    // was fast enough — short, quick swipes are common with thumbs.
    const velocity = dist / Math.max(1, dt);
    if (dist > this.threshold * 0.45 && velocity > 0.5) {
      if (adx > ady) this.actions.moveLane(dx > 0 ? 1 : -1);
      else if (dy < 0) this.doJump();
      else this.doSlide();
      return;
    }

    // Otherwise: a tap is a jump.
    if (!t.moved && dt < 400) {
      this.doJump();
    }
  }

  private doJump() {
    if (this.actions.isAirborne()) {
      this.buffered = { action: 'jump', at: performance.now() };
      return;
    }
    this.actions.jump();
    this.actions.vibrate(10);
  }

  private doSlide() {
    if (this.actions.isAirborne()) {
      // Swiping down mid-air should slam you down and slide on contact.
      this.buffered = { action: 'slide', at: performance.now() };
      return;
    }
    this.actions.slide();
    this.actions.vibrate(10);
  }

  /** Call once per frame; flushes a buffered action once the player lands. */
  tick() {
    const b = this.buffered;
    if (!b) return;
    if (performance.now() - b.at > BUFFER_MS) {
      this.buffered = null;
      return;
    }
    if (this.actions.isAirborne()) return;
    this.buffered = null;
    if (b.action === 'jump') this.actions.jump();
    else this.actions.slide();
  }

  dispose() {
    for (const d of this.detach) d();
    this.detach.length = 0;
  }
}
