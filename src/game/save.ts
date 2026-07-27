/**
 * Durable save system.
 *
 * The original code did `localStorage.setItem(JSON.stringify(profile))` on
 * every coin, mission tick and purchase. That has four real problems on
 * mobile: it blocks the main thread mid-run, a tab kill during the write
 * leaves truncated JSON that wipes all progress, there's no way to evolve the
 * schema, and quota errors silently destroy the save.
 *
 * This module fixes all four:
 *
 *  - **Checksummed envelope** so corruption is detected rather than parsed
 *    into a half-valid profile.
 *  - **A/B slots plus a backup** — we alternate writes between two keys and
 *    keep the last known-good. A crash mid-write can only ever damage the
 *    slot being written; the other one is still intact.
 *  - **Versioned migrations** that run in order, so old saves upgrade
 *    cleanly instead of being reset.
 *  - **Throttled, idle-scheduled writes** with a flush on pagehide, so we
 *    never stall a frame but never lose data either.
 */

const SLOT_A = 'coffee-runner-save-a';
const SLOT_B = 'coffee-runner-save-b';
const META = 'coffee-runner-save-meta';
/** Legacy key from the original build — imported once, then left alone. */
const LEGACY_KEY = 'coffee-runner-profile-v2';

/** Bump this and add a migration when the profile shape changes. */
export const SAVE_VERSION = 3;

interface Envelope<T> {
  v: number;
  /** Monotonic counter so we can pick the newer of the two slots. */
  seq: number;
  /** FNV-1a of the serialised payload. */
  sum: string;
  at: string;
  data: T;
}

/** FNV-1a — fast, dependency-free, and plenty for detecting truncation. */
function checksum(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* nothing we can do */
  }
}

export type Migration<T> = (data: Record<string, unknown>) => Record<string, unknown> | T;

export interface SaveOptions<T> {
  /** Produce a brand-new save. */
  defaults: () => T;
  /** Repair/normalise a loaded object (fills missing fields, clamps values). */
  normalise: (raw: Record<string, unknown>, defaults: T) => T;
  /** Keyed by the version they upgrade *from*. */
  migrations: Record<number, Migration<T>>;
}

export interface LoadResult<T> {
  data: T;
  /** How the save was obtained — useful for telling the player what happened. */
  source: 'fresh' | 'slot' | 'backup' | 'legacy' | 'recovered';
  migratedFrom?: number;
}

export class SaveStore<T extends object> {
  private opts: SaveOptions<T>;
  private seq = 0;
  private nextSlot: typeof SLOT_A | typeof SLOT_B = SLOT_A;
  private pending: T | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private idleHandle: number | null = null;
  private lastWrite = 0;
  private throttleMs: number;
  private listenersAttached = false;

  constructor(opts: SaveOptions<T>, throttleMs = 900) {
    this.opts = opts;
    this.throttleMs = throttleMs;
  }

  /* ---------------------------------- load --------------------------------- */

  private readSlot(key: string): Envelope<Record<string, unknown>> | null {
    const raw = safeGet(key);
    if (!raw) return null;
    try {
      const env = JSON.parse(raw) as Envelope<Record<string, unknown>>;
      if (!env || typeof env !== 'object' || typeof env.sum !== 'string') return null;
      // Verify integrity before trusting a single field.
      if (checksum(JSON.stringify(env.data)) !== env.sum) return null;
      return env;
    } catch {
      return null;
    }
  }

  load(): LoadResult<T> {
    const defaults = this.opts.defaults();
    const a = this.readSlot(SLOT_A);
    const b = this.readSlot(SLOT_B);

    // Prefer the highest sequence number that passes its checksum.
    let chosen: Envelope<Record<string, unknown>> | null = null;
    let source: LoadResult<T>['source'] = 'slot';
    if (a && b) chosen = a.seq >= b.seq ? a : b;
    else chosen = a ?? b;

    // If one slot was corrupt but the other survived, that's the backup path.
    if ((a && !b) || (b && !a)) source = 'backup';

    if (!chosen) {
      // Fall back to the original build's un-versioned key so existing
      // players keep their coins, characters and leaderboard.
      const legacy = safeGet(LEGACY_KEY);
      if (legacy) {
        try {
          const parsed = JSON.parse(legacy) as Record<string, unknown>;
          const migrated = this.runMigrations(parsed, Number(parsed.version ?? 2));
          const data = this.opts.normalise(migrated, defaults);
          this.seq = 1;
          this.write(data, true);
          return { data, source: 'legacy', migratedFrom: Number(parsed.version ?? 2) };
        } catch {
          /* fall through to fresh */
        }
      }
      this.seq = 0;
      return { data: defaults, source: 'fresh' };
    }

    this.seq = chosen.seq;
    this.nextSlot = chosen === a ? SLOT_B : SLOT_A;

    const from = chosen.v;
    const migrated = from < SAVE_VERSION ? this.runMigrations(chosen.data, from) : chosen.data;
    const data = this.opts.normalise(migrated, defaults);
    if (from < SAVE_VERSION) {
      this.write(data, true);
      return { data, source, migratedFrom: from };
    }
    return { data, source };
  }

  private runMigrations(data: Record<string, unknown>, from: number): Record<string, unknown> {
    let cur = data;
    for (let v = from; v < SAVE_VERSION; v++) {
      const m = this.opts.migrations[v];
      if (!m) continue;
      try {
        cur = m(cur) as Record<string, unknown>;
      } catch {
        // A failed migration shouldn't nuke the save — stop and normalise
        // whatever we have.
        break;
      }
    }
    return cur;
  }

  /* ---------------------------------- save --------------------------------- */

  /** Queue a save. Cheap to call on every state change. */
  save(data: T) {
    this.pending = data;
    this.attachFlushHandlers();

    const now = Date.now();
    const since = now - this.lastWrite;
    if (since >= this.throttleMs) {
      this.scheduleIdle();
    } else if (this.timer === null) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.scheduleIdle();
      }, this.throttleMs - since);
    }
  }

  /** Write during idle time so we never stall a gameplay frame. */
  private scheduleIdle() {
    if (this.idleHandle !== null) return;
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: object) => number })
      .requestIdleCallback;
    if (ric) {
      this.idleHandle = ric(() => {
        this.idleHandle = null;
        this.flush();
      }, { timeout: 400 });
    } else {
      this.idleHandle = setTimeout(() => {
        this.idleHandle = null;
        this.flush();
      }, 0) as unknown as number;
    }
  }

  /** Write immediately. Called on pagehide and before destructive actions. */
  flush() {
    if (!this.pending) return;
    const data = this.pending;
    this.pending = null;
    this.write(data, false);
  }

  private write(data: T, immediate: boolean) {
    const payload = JSON.stringify(data);
    this.seq += 1;
    const env: Envelope<T> = {
      v: SAVE_VERSION,
      seq: this.seq,
      sum: checksum(payload),
      at: new Date().toISOString(),
      data,
    };
    const serialised = JSON.stringify(env);
    const slot = this.nextSlot;

    if (!safeSet(slot, serialised)) {
      // Quota exceeded. Never delete the other slot to make room — it holds
      // the last known-good save, and if the retry also fails we'd have
      // destroyed the player's progress for nothing. Drop only expendable
      // keys, then retry; if it still fails, keep the data queued so the
      // next flush (or a later frame, once space frees up) can try again.
      safeRemove(META);
      if (!safeSet(slot, serialised)) {
        this.seq -= 1;
        this.pending = data;
        return;
      }
    }

    // Only advance the slot pointer after a confirmed successful write, so
    // the previous good save always stays recoverable.
    this.nextSlot = slot === SLOT_A ? SLOT_B : SLOT_A;
    this.lastWrite = Date.now();
    safeSet(META, JSON.stringify({ seq: this.seq, slot, v: SAVE_VERSION }));
    void immediate;
  }

  /** Wipe everything, including the legacy key. */
  clear() {
    this.pending = null;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.seq = 0;
    this.nextSlot = SLOT_A;
    for (const k of [SLOT_A, SLOT_B, META, LEGACY_KEY]) safeRemove(k);
  }

  /* --------------------------- export / import ----------------------------- */

  /** Base64 save code the player can copy to move devices. */
  export(data: T): string {
    const payload = JSON.stringify({ v: SAVE_VERSION, sum: checksum(JSON.stringify(data)), data });
    try {
      // encodeURIComponent first so non-ASCII (names, emoji) survives btoa.
      return btoa(unescape(encodeURIComponent(payload)));
    } catch {
      return '';
    }
  }

  /** Returns null if the code is malformed or fails its checksum. */
  import(code: string): T | null {
    try {
      const json = decodeURIComponent(escape(atob(code.trim())));
      const parsed = JSON.parse(json) as { v: number; sum: string; data: Record<string, unknown> };
      if (!parsed?.data) return null;
      if (checksum(JSON.stringify(parsed.data)) !== parsed.sum) return null;
      const migrated =
        parsed.v < SAVE_VERSION ? this.runMigrations(parsed.data, parsed.v) : parsed.data;
      return this.opts.normalise(migrated, this.opts.defaults());
    } catch {
      return null;
    }
  }

  private attachFlushHandlers() {
    if (this.listenersAttached) return;
    this.listenersAttached = true;
    const flush = () => this.flush();
    // Guard every hook: this also runs under test harnesses and in webviews
    // where parts of the DOM API are missing.
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      // pagehide is the only event reliably delivered when iOS Safari kills a tab.
      window.addEventListener('pagehide', flush);
      window.addEventListener('beforeunload', flush);
    }
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.flush();
      });
    }
  }
}
