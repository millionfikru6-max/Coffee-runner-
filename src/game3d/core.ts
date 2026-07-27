/**
 * Shared 3D helpers: deterministic RNG, geometry/material caches and pooling.
 *
 * Everything in the 3D layer allocates through here so that a whole run only
 * ever creates a few dozen GPU resources, which is what keeps the game smooth
 * on mid-range phones.
 */

import * as THREE from 'three';

export type Quality = 'high' | 'low';

/* ------------------------------- world scale ------------------------------ */

/** Lane separation in metres. */
export const LANE_W = 2.15;
/** How many metres of track the engine's z-range (1 → 0) maps onto. */
export const DEPTH_M = 62;
/** Engine z value at which the player stands. */
export const PLAYER_Z = 0.08;
/** Pixels-of-jump → metres conversion (engine jumps in screen px). */
export const JUMP_SCALE = 0.0132;

/** Convert an engine z (1 = far, 0 = behind camera) into world Z metres. */
export function zToWorld(z: number): number {
  return -(z - PLAYER_Z) * DEPTH_M;
}

/** Convert a lane index into world X metres. */
export function laneToWorld(lane: number): number {
  return (lane - 1) * LANE_W;
}

/* ---------------------------------- rng ----------------------------------- */

/** Small, fast, deterministic PRNG so scenery is stable between frames. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* -------------------------------- resources ------------------------------- */

const geoCache = new Map<string, THREE.BufferGeometry>();
const matCache = new Map<string, THREE.Material>();

export function geo<T extends THREE.BufferGeometry>(key: string, build: () => T): T {
  const hit = geoCache.get(key);
  if (hit) return hit as T;
  const g = build();
  geoCache.set(key, g);
  return g;
}

export interface MatOpts {
  color: THREE.ColorRepresentation;
  roughness?: number;
  metalness?: number;
  flat?: boolean;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  depthWrite?: boolean;
  toneMapped?: boolean;
}

/** Cached standard material. Keyed on every visible option. */
export function mat(key: string, o: MatOpts): THREE.MeshStandardMaterial {
  const hit = matCache.get(key);
  if (hit) return hit as THREE.MeshStandardMaterial;
  const m = new THREE.MeshStandardMaterial({
    color: o.color,
    roughness: o.roughness ?? 0.85,
    metalness: o.metalness ?? 0.02,
    flatShading: o.flat ?? false,
    emissive: o.emissive ?? 0x000000,
    emissiveIntensity: o.emissiveIntensity ?? 1,
    transparent: o.transparent ?? false,
    opacity: o.opacity ?? 1,
    side: o.side ?? THREE.FrontSide,
    depthWrite: o.depthWrite ?? true,
  });
  m.toneMapped = o.toneMapped ?? true;
  matCache.set(key, m);
  return m;
}

/** Cached unlit material — used for glows, water sheen and UI-ish billboards. */
export function basicMat(
  key: string,
  o: {
    color: THREE.ColorRepresentation;
    transparent?: boolean;
    opacity?: number;
    side?: THREE.Side;
    depthWrite?: boolean;
    blending?: THREE.Blending;
  },
): THREE.MeshBasicMaterial {
  const hit = matCache.get(key);
  if (hit) return hit as THREE.MeshBasicMaterial;
  const m = new THREE.MeshBasicMaterial({
    color: o.color,
    transparent: o.transparent ?? false,
    opacity: o.opacity ?? 1,
    side: o.side ?? THREE.FrontSide,
    depthWrite: o.depthWrite ?? true,
    blending: o.blending ?? THREE.NormalBlending,
  });
  m.toneMapped = false;
  matCache.set(key, m);
  return m;
}

export function disposeResources() {
  geoCache.forEach((g) => g.dispose());
  matCache.forEach((m) => m.dispose());
  geoCache.clear();
  matCache.clear();
}

/* ------------------------------ shared shapes ----------------------------- */

export const G = {
  box: () => geo('box', () => new THREE.BoxGeometry(1, 1, 1)),
  /** Box with the origin at the bottom face — handy for trunks and posts. */
  boxUp: () =>
    geo('boxUp', () => {
      const g = new THREE.BoxGeometry(1, 1, 1);
      g.translate(0, 0.5, 0);
      return g;
    }),
  sphere: (q: Quality) =>
    geo(`sphere-${q}`, () => new THREE.SphereGeometry(0.5, q === 'high' ? 16 : 10, q === 'high' ? 12 : 8)),
  lowSphere: () => geo('lowSphere', () => new THREE.IcosahedronGeometry(0.5, 1)),
  rock: () => geo('rock', () => new THREE.IcosahedronGeometry(0.5, 0)),
  rock2: () => geo('rock2', () => new THREE.DodecahedronGeometry(0.5, 0)),
  cyl: (q: Quality) =>
    geo(`cyl-${q}`, () => {
      const g = new THREE.CylinderGeometry(0.5, 0.5, 1, q === 'high' ? 12 : 7);
      return g;
    }),
  /** Cylinder with origin at the base. */
  cylUp: (q: Quality) =>
    geo(`cylUp-${q}`, () => {
      const g = new THREE.CylinderGeometry(0.5, 0.5, 1, q === 'high' ? 12 : 7);
      g.translate(0, 0.5, 0);
      return g;
    }),
  cone: (q: Quality) => geo(`cone-${q}`, () => new THREE.ConeGeometry(0.5, 1, q === 'high' ? 14 : 8)),
  coneUp: (q: Quality) =>
    geo(`coneUp-${q}`, () => {
      const g = new THREE.ConeGeometry(0.5, 1, q === 'high' ? 14 : 8);
      g.translate(0, 0.5, 0);
      return g;
    }),
  plane: () => geo('plane', () => new THREE.PlaneGeometry(1, 1)),
  circle: (q: Quality) => geo(`circle-${q}`, () => new THREE.CircleGeometry(0.5, q === 'high' ? 20 : 10)),
  torus: (q: Quality) =>
    geo(`torus-${q}`, () => new THREE.TorusGeometry(0.42, 0.1, q === 'high' ? 10 : 6, q === 'high' ? 18 : 10)),
  capsule: (q: Quality) => geo(`capsule-${q}`, () => new THREE.CapsuleGeometry(0.5, 1, 3, q === 'high' ? 10 : 6)),
};

/* --------------------------------- pooling -------------------------------- */

/**
 * Keeps a set of reusable Object3Ds keyed by entity id. Anything not touched
 * during a frame is hidden and recycled, so no per-frame allocation happens.
 */
export class ObjectPool<T extends THREE.Object3D> {
  private live = new Map<number, T>();
  private free: T[] = [];
  private touched = new Set<number>();

  constructor(
    private parent: THREE.Object3D,
    private factory: () => T,
    private onRecycle?: (o: T) => void,
  ) {}

  begin() {
    this.touched.clear();
  }

  acquire(id: number): T {
    this.touched.add(id);
    const hit = this.live.get(id);
    if (hit) return hit;
    const o = this.free.pop() ?? this.factory();
    o.visible = true;
    this.parent.add(o);
    this.live.set(id, o);
    return o;
  }

  /** Was this id already alive before `acquire` this frame? */
  has(id: number) {
    return this.live.has(id);
  }

  end() {
    for (const [id, o] of this.live) {
      if (this.touched.has(id)) continue;
      o.visible = false;
      this.parent.remove(o);
      this.onRecycle?.(o);
      this.free.push(o);
      this.live.delete(id);
    }
  }

  clear() {
    for (const [, o] of this.live) {
      o.visible = false;
      this.parent.remove(o);
      this.free.push(o);
    }
    this.live.clear();
  }

  get size() {
    return this.live.size;
  }
}

/* -------------------------------- utilities ------------------------------- */

const tmpColor = new THREE.Color();

/** Parse '#rrggbb' or 'rgb(r,g,b)' (world.ts emits both) into a THREE.Color. */
export function parseColor(css: string): THREE.Color {
  try {
    return new THREE.Color(css);
  } catch {
    return new THREE.Color('#888888');
  }
}

export function mixColors(a: string, b: string, t: number): THREE.Color {
  const ca = parseColor(a);
  tmpColor.copy(parseColor(b));
  return ca.lerp(tmpColor, THREE.MathUtils.clamp(t, 0, 1));
}

export function damp(current: number, target: number, lambda: number, dt: number): number {
  return THREE.MathUtils.damp(current, target, lambda, dt);
}

/** Enable shadows on an object and all of its descendants. */
export function setShadows(root: THREE.Object3D, cast: boolean, receive: boolean) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = cast;
      m.receiveShadow = receive;
    }
  });
}
