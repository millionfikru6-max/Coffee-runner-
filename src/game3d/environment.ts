/**
 * Streaming 3D environment: terrain, mountains, coffee farms, tukul villages,
 * waterfalls, valleys and the Blue Nile gorge.
 *
 * The world is built from fixed-length chunks that recycle as the runner moves,
 * so scenery cost is constant regardless of distance. Every chunk is seeded
 * deterministically from its index, which means the same stretch of road always
 * looks the same and nothing pops between frames.
 */

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Biome, WorldState } from '../game/types';
import { G, type Quality, mat, mulberry32, parseColor } from './core';
import type { TerrainPalette } from '../game/world';

/**
 * Wind shader injected into foliage materials.
 *
 * Every plant used to be its own Object3D swaying on the CPU, which meant one
 * draw call per bush. Now props are merged into a handful of meshes per chunk
 * and the sway happens in the vertex shader instead — the motion is per-vertex
 * (so tall plants bend more than short ones, which looks better than rigidly
 * rotating a whole bush) and it costs zero extra draw calls.
 */
const windUniforms = { uTime: { value: 0 }, uWind: { value: 0.3 } };

export function applyWind(material: THREE.Material, strength = 1) {
  const m = material as THREE.Material & { userData: { windApplied?: boolean } };
  if (m.userData.windApplied) return material;
  m.userData.windApplied = true;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = windUniforms.uWind;
    shader.uniforms.uWindAmp = { value: strength };
    shader.vertexShader =
      'uniform float uTime;\nuniform float uWind;\nuniform float uWindAmp;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         // Sway scales with height above the prop base, so trunks stay planted
         // and canopies move — and each prop gets a phase offset from its
         // world position so a field doesn't pulse in unison.
         float bend = max(0.0, transformed.y) * 0.055 * uWindAmp;
         float phase = uTime * 1.6 + (modelMatrix[3][0] + modelMatrix[3][2]) * 0.35 + position.x * 0.12;
         float gust = 0.6 + 0.4 * sin(uTime * 0.37);
         transformed.x += sin(phase) * bend * (0.35 + uWind) * gust;
         transformed.z += cos(phase * 0.83) * bend * 0.55 * (0.35 + uWind) * gust;`,
      );
  };
  m.needsUpdate = true;
  return material;
}

/** Advance the shared wind clock. Called once per frame. */
export function updateWind(time: number, wind: number) {
  windUniforms.uTime.value = time;
  windUniforms.uWind.value = wind;
}

/**
 * Flatten a prop hierarchy into merged geometry grouped by material.
 * This is the core mobile optimisation: a tukul made of 7 meshes and a coffee
 * bush made of 9 stop being 16 draw calls and become part of one.
 */
function collectGeometry(
  root: THREE.Object3D,
  out: Map<THREE.Material, THREE.BufferGeometry[]>,
  parentMatrix: THREE.Matrix4,
) {
  root.updateMatrixWorld(true);
  root.traverse((n) => {
    const mesh = n as THREE.Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material as THREE.Material;
    if (Array.isArray(mesh.material)) return;
    const g = mesh.geometry.clone();
    const m = new THREE.Matrix4().multiplyMatrices(parentMatrix, mesh.matrixWorld);
    g.applyMatrix4(m);
    // Merging requires identical attribute sets; drop anything exotic.
    for (const key of Object.keys(g.attributes)) {
      if (key !== 'position' && key !== 'normal' && key !== 'uv') g.deleteAttribute(key);
    }
    if (!g.attributes.uv) {
      const count = g.attributes.position.count;
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    // mergeGeometries requires every input to agree on indexing. Our shapes
    // are a mix (ShapeGeometry is indexed, others aren't), so flatten them
    // all to non-indexed before merging.
    const flat = g.index ? g.toNonIndexed() : g;
    if (flat !== g) g.dispose();
    const list = out.get(material) ?? [];
    list.push(flat);
    out.set(material, list);
  });
}

export const CHUNK_LEN = 20;
const CHUNK_COUNT_HIGH = 11;
const CHUNK_COUNT_LOW = 8;
const ROAD_W = 7.4;

interface ChunkProp {
  obj: THREE.Object3D;
  spin?: number;
}

class Chunk {
  readonly group = new THREE.Group();
  index = -1;
  biome: Biome | null = null;
  props: ChunkProp[] = [];
  private content = new THREE.Group();

  constructor(private quality: Quality) {
    this.group.add(this.content);
    this.buildGround();
  }

  private groundMats: THREE.MeshStandardMaterial[] = [];
  private roadMat!: THREE.MeshStandardMaterial;
  private vergeMats: THREE.MeshStandardMaterial[] = [];

  private buildGround() {
    // Per-chunk materials so each chunk can tint to its own biome while a
    // neighbouring chunk still shows the previous one — that's what makes the
    // biome transition read as a real place rather than a global colour flip.
    this.roadMat = new THREE.MeshStandardMaterial({ color: 0x6b4f3a, roughness: 0.96 });
    const road = new THREE.Mesh(G.plane(), this.roadMat);
    road.rotation.x = -Math.PI / 2;
    road.scale.set(ROAD_W, CHUNK_LEN, 1);
    road.position.z = -CHUNK_LEN / 2;
    road.receiveShadow = true;
    this.group.add(road);

    // Wheel-rut detailing along the dirt track.
    const rutMat = new THREE.MeshStandardMaterial({ color: 0x54402f, roughness: 1 });
    this.groundMats.push(rutMat);
    for (const sx of [-1, 1]) {
      const rut = new THREE.Mesh(G.plane(), rutMat);
      rut.rotation.x = -Math.PI / 2;
      rut.scale.set(0.5, CHUNK_LEN, 1);
      rut.position.set(sx * 2.1, 0.012, -CHUNK_LEN / 2);
      this.group.add(rut);
    }

    // Grass shoulders left and right, wide enough to hide the horizon seam.
    for (const sx of [-1, 1]) {
      const m = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.95 });
      this.vergeMats.push(m);
      const verge = new THREE.Mesh(G.plane(), m);
      verge.rotation.x = -Math.PI / 2;
      verge.scale.set(70, CHUNK_LEN, 1);
      verge.position.set(sx * (35 + ROAD_W / 2 - 0.2), -0.02, -CHUNK_LEN / 2);
      verge.receiveShadow = true;
      this.group.add(verge);
    }

    // Stone kerb so the road edge catches the light.
    const kerbMat = new THREE.MeshStandardMaterial({ color: 0x8a7358, roughness: 0.9, flatShading: true });
    this.groundMats.push(kerbMat);
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const k = new THREE.Mesh(G.box(), kerbMat);
        k.scale.set(0.3, 0.16, 1.4);
        k.position.set(sx * (ROAD_W / 2 + 0.1), 0.06, -2 - i * 4);
        k.rotation.y = (i % 2 ? 1 : -1) * 0.05;
        k.receiveShadow = true;
        this.group.add(k);
      }
    }
  }

  applyPalette(t: TerrainPalette) {
    this.roadMat.color.copy(parseColor(t.road));
    for (const m of this.vergeMats) m.color.copy(parseColor(t.field));
    this.groundMats[0].color.copy(parseColor(t.roadDark));
  }

  /** Geometry staged for merging this rebuild. */
  private pending = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private batches: THREE.Mesh[] = [];

  clearProps() {
    for (const p of this.props) {
      this.content.remove(p.obj);
      disposeTree(p.obj);
    }
    this.props.length = 0;
    for (const b of this.batches) {
      this.content.remove(b);
      b.geometry.dispose();
    }
    this.batches.length = 0;
    this.pending.clear();
  }

  /**
   * Stage a prop for merging. The source hierarchy is discarded — only its
   * baked geometry survives, so a whole chunk of scenery collapses into one
   * draw call per material.
   */
  add(obj: THREE.Object3D) {
    obj.updateMatrixWorld(true);
    collectGeometry(obj, this.pending, new THREE.Matrix4());
    disposeTree(obj);
  }

  /** Props that must stay dynamic (rotating water wheels, etc.). */
  addDynamic(obj: THREE.Object3D, spin?: number) {
    this.content.add(obj);
    this.props.push({ obj, spin });
  }

  /** Merge everything staged since the last rebuild. */
  finalise() {
    for (const [material, geos] of this.pending) {
      if (geos.length === 0) continue;
      let merged: THREE.BufferGeometry | null = null;
      try {
        merged = BufferGeometryUtils.mergeGeometries(geos, false);
      } catch {
        merged = null;
      }
      for (const g of geos) g.dispose();
      if (!merged) continue;
      merged.userData.own = true;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.content.add(mesh);
      this.batches.push(mesh);
    }
    this.pending.clear();
  }

  animate(time: number, wind: number) {
    for (const p of this.props) {
      if (p.spin !== undefined) p.obj.rotation.y = time * p.spin;
    }
    void wind;
  }

  get q() {
    return this.quality;
  }
}

function disposeTree(o: THREE.Object3D) {
  o.traverse((n) => {
    const m = n as THREE.Mesh;
    if (m.isMesh && (m.geometry as THREE.BufferGeometry | undefined)?.userData?.own) {
      m.geometry.dispose();
    }
  });
}

/* --------------------------------- props ---------------------------------- */

const M = {
  bark: () => mat('bark', { color: 0x5a4030, roughness: 0.95, flat: true }),
  darkBark: () => mat('darkbark', { color: 0x3f2c1e, roughness: 0.95, flat: true }),
  leafDark: () => applyWind(mat('leafD', { color: 0x1f5c22, roughness: 0.88, flat: true }), 1),
  leafMid: () => applyWind(mat('leafM', { color: 0x2f7a2c, roughness: 0.88, flat: true }), 1),
  leafLight: () => applyWind(mat('leafL', { color: 0x489a3a, roughness: 0.88, flat: true }), 1.2),
  cherry: () => applyWind(mat('cherry', { color: 0xc4271f, roughness: 0.5 }), 1),
  thatch: () => mat('thatch', { color: 0xb08a4a, roughness: 1, flat: true }),
  thatchDark: () => mat('thatchD', { color: 0x8a6a34, roughness: 1, flat: true }),
  mudWall: () => mat('mud', { color: 0xc7a077, roughness: 0.98 }),
  mudWall2: () => mat('mud2', { color: 0xa9805a, roughness: 0.98 }),
  stone: () => mat('stone', { color: 0x8b8378, roughness: 0.95, flat: true }),
  rockDark: () => mat('rockD', { color: 0x5d5348, roughness: 0.96, flat: true }),
  snow: () => mat('snow', { color: 0xf2f6fb, roughness: 0.6 }),
  water: () =>
    mat('water', {
      color: 0x2f86ad,
      roughness: 0.12,
      metalness: 0.45,
      transparent: true,
      opacity: 0.86,
    }),
  foam: () => mat('foam', { color: 0xeaf6ff, roughness: 0.4, emissive: 0x6fa8c8, emissiveIntensity: 0.18 }),
  concrete: () => mat('concrete', { color: 0x9a958c, roughness: 0.92 }),
  window: () => mat('window', { color: 0x2a3038, roughness: 0.25, metalness: 0.6 }),
  windowLit: () =>
    mat('windowLit', { color: 0xffcf7a, roughness: 0.3, emissive: 0xffb347, emissiveIntensity: 1.4 }),
  cloth1: () => mat('cloth1', { color: 0xe8e2d4, roughness: 0.85 }),
  red: () => mat('red', { color: 0xc41e3a, roughness: 0.7 }),
  green: () => mat('greenP', { color: 0x0f8a3c, roughness: 0.7 }),
  yellow: () => mat('yellowP', { color: 0xf5c518, roughness: 0.6 }),
  flowerY: () => applyWind(mat('flowerY', { color: 0xffd23f, roughness: 0.6, emissive: 0x775500, emissiveIntensity: 0.25 }), 1.6),
};

/** Coffee bush heavy with red cherries — the signature highland prop. */
function coffeeBush(rand: () => number, q: Quality): THREE.Group {
  const g = new THREE.Group();
  const h = 1.1 + rand() * 0.5;
  const trunk = new THREE.Mesh(G.cylUp(q), M.bark());
  trunk.scale.set(0.1, h * 0.55, 0.1);
  trunk.castShadow = true;
  g.add(trunk);

  const tiers = q === 'high' ? 3 : 2;
  for (let i = 0; i < tiers; i++) {
    const s = 1 - i * 0.24;
    const leaf = new THREE.Mesh(G.lowSphere(), i % 2 ? M.leafMid() : M.leafDark());
    leaf.scale.set(1.15 * s, 0.62 * s, 1.15 * s);
    leaf.position.y = h * 0.5 + i * 0.34;
    leaf.rotation.y = rand() * Math.PI;
    leaf.castShadow = true;
    g.add(leaf);
  }
  if (q === 'high') {
    const berries = 5;
    for (let i = 0; i < berries; i++) {
      const b = new THREE.Mesh(G.lowSphere(), M.cherry());
      const a = (i / berries) * Math.PI * 2 + rand();
      b.scale.setScalar(0.13);
      b.position.set(Math.cos(a) * 0.52, h * 0.55 + rand() * 0.5, Math.sin(a) * 0.52);
      g.add(b);
    }
  }
  return g;
}

/** Tukul — round mud-walled hut with a conical thatch roof. */
function tukul(rand: () => number, q: Quality): THREE.Group {
  const g = new THREE.Group();
  const r = 1.5 + rand() * 0.6;
  const wallH = 1.5 + rand() * 0.35;

  const wall = new THREE.Mesh(G.cylUp(q), rand() < 0.5 ? M.mudWall() : M.mudWall2());
  wall.scale.set(r * 2, wallH, r * 2);
  wall.castShadow = true;
  wall.receiveShadow = true;
  g.add(wall);

  const roof = new THREE.Mesh(G.coneUp(q), M.thatch());
  roof.scale.set(r * 2.65, 1.7 + rand() * 0.5, r * 2.65);
  roof.position.y = wallH;
  roof.castShadow = true;
  g.add(roof);

  // thatch banding
  for (let i = 0; i < 2; i++) {
    const band = new THREE.Mesh(G.coneUp(q), M.thatchDark());
    const s = 0.72 - i * 0.3;
    band.scale.set(r * 2.65 * s, (1.7 + rand() * 0.4) * s, r * 2.65 * s);
    band.position.y = wallH + (1 - s) * 1.1;
    g.add(band);
  }

  const finial = new THREE.Mesh(G.cylUp(q), M.darkBark());
  finial.scale.set(0.1, 0.5, 0.1);
  finial.position.y = wallH + 1.85;
  g.add(finial);

  const door = new THREE.Mesh(G.box(), M.darkBark());
  door.scale.set(0.62, 1.0, 0.12);
  door.position.set(0, 0.5, r * 0.99);
  g.add(door);
  return g;
}

/** Terraced coffee/teff field steps carved into the hillside. */
function terrace(rand: () => number, side: number): THREE.Group {
  const g = new THREE.Group();
  const steps = 4;
  for (let i = 0; i < steps; i++) {
    const w = 12 + rand() * 6;
    const step = new THREE.Mesh(G.box(), i % 2 ? M.leafMid() : M.leafLight());
    step.scale.set(w, 0.5 + i * 0.2, 7);
    step.position.set(side * (9 + i * 5.5), (0.25 + i * 0.55) - 0.2, -rand() * 5);
    step.receiveShadow = true;
    g.add(step);

    const wall = new THREE.Mesh(G.box(), M.stone());
    wall.scale.set(w, 0.55, 0.5);
    wall.position.set(side * (9 + i * 5.5), 0.3 + i * 0.55, -rand() * 5 + side * 0 + 3.4);
    g.add(wall);
  }
  return g;
}

/** Enset (false banana) plant — everywhere in the southern highlands. */
function enset(rand: () => number): THREE.Group {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(G.cylUp('low'), M.leafDark());
  stem.scale.set(0.22, 0.9, 0.22);
  g.add(stem);
  const blades = 6;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + rand();
    const leaf = new THREE.Mesh(G.plane(), M.leafLight());
    leaf.material = M.leafLight();
    const pivot = new THREE.Group();
    pivot.rotation.y = a;
    pivot.position.y = 0.85;
    leaf.scale.set(0.55, 2.4, 1);
    leaf.position.set(0, 0.9, 0.25);
    leaf.rotation.x = -0.55 - rand() * 0.3;
    (leaf.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    pivot.add(leaf);
    g.add(pivot);
  }
  return g;
}

/** Tall acacia with the classic flat African canopy. */
function acacia(rand: () => number, q: Quality): THREE.Group {
  const g = new THREE.Group();
  const h = 4 + rand() * 2.4;
  const trunk = new THREE.Mesh(G.cylUp(q), M.bark());
  trunk.scale.set(0.42, h, 0.36);
  trunk.castShadow = true;
  g.add(trunk);
  for (let i = 0; i < 3; i++) {
    const branch = new THREE.Mesh(G.cylUp(q), M.bark());
    branch.scale.set(0.16, 1.8, 0.16);
    branch.position.y = h * 0.72;
    branch.rotation.z = (i - 1) * 0.55;
    g.add(branch);
  }
  const canopy = new THREE.Mesh(G.lowSphere(), M.leafDark());
  canopy.scale.set(5.4 + rand() * 1.6, 1.15, 4.6 + rand());
  canopy.position.y = h + 0.5;
  canopy.castShadow = true;
  g.add(canopy);
  const top = new THREE.Mesh(G.lowSphere(), M.leafMid());
  top.scale.set(3.6, 0.85, 3.2);
  top.position.y = h + 1.0;
  g.add(top);
  return g;
}

/** Giant lobelia — the alien-looking Simien highland plant. */
function lobelia(rand: () => number, q: Quality): THREE.Group {
  const g = new THREE.Group();
  const h = 2.2 + rand() * 1.4;
  const stalk = new THREE.Mesh(G.cylUp(q), mat('lobStalk', { color: 0x6b6b3a, roughness: 0.9 }));
  stalk.scale.set(0.34, h, 0.34);
  stalk.castShadow = true;
  g.add(stalk);
  const crown = new THREE.Mesh(G.coneUp(q), mat('lobCrown', { color: 0x8fa54a, roughness: 0.85, flat: true }));
  crown.scale.set(1.5, 1.8, 1.5);
  crown.position.y = h;
  g.add(crown);
  for (let i = 0; i < 5; i++) {
    const frond = new THREE.Mesh(G.box(), mat('lobFrond', { color: 0x6f8a3d, roughness: 0.9 }));
    frond.scale.set(0.12, 1.5, 0.3);
    frond.position.y = h * 0.55;
    frond.rotation.z = Math.cos((i / 5) * Math.PI * 2) * 0.9;
    frond.rotation.x = Math.sin((i / 5) * Math.PI * 2) * 0.9;
    g.add(frond);
  }
  return g;
}

/** Papyrus / reed clump for the Blue Nile banks. */
function reeds(rand: () => number): THREE.Group {
  const g = new THREE.Group();
  const m = applyWind(mat('reed', { color: 0x8fa63f, roughness: 0.9 }), 2.2);
  for (let i = 0; i < 7; i++) {
    const r = new THREE.Mesh(G.cylUp('low'), m);
    const h = 1.1 + rand() * 1.1;
    r.scale.set(0.07, h, 0.07);
    r.position.set((rand() - 0.5) * 1.3, 0, (rand() - 0.5) * 1.3);
    r.rotation.z = (rand() - 0.5) * 0.3;
    g.add(r);
    const tuft = new THREE.Mesh(G.lowSphere(), mat('reedTuft', { color: 0xd9c98a, roughness: 0.9 }));
    tuft.scale.setScalar(0.26);
    tuft.position.set(r.position.x, h, r.position.z);
    g.add(tuft);
  }
  return g;
}

/** Corrugated-roof shop / apartment block for Addis. */
function building(rand: () => number, q: Quality, night: boolean): THREE.Group {
  const g = new THREE.Group();
  const h = 5 + rand() * 11;
  const w = 4 + rand() * 3.5;
  const d = 4 + rand() * 3;
  const body = new THREE.Mesh(G.boxUp(), M.concrete());
  body.scale.set(w, h, d);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  const floors = Math.max(2, Math.floor(h / 2.4));
  const winMat = night && rand() < 0.55 ? M.windowLit() : M.window();
  for (let f = 0; f < floors; f++) {
    for (let c = -1; c <= 1; c++) {
      if (rand() < 0.18) continue;
      const win = new THREE.Mesh(G.box(), rand() < 0.35 && night ? M.windowLit() : winMat);
      win.scale.set(w * 0.2, 1.0, 0.12);
      win.position.set(c * w * 0.29, 1.4 + f * 2.3, d / 2 + 0.02);
      g.add(win);
    }
  }
  // corrugated roof
  const roof = new THREE.Mesh(G.box(), mat('tin', { color: 0x7d7f82, roughness: 0.55, metalness: 0.5 }));
  roof.scale.set(w * 1.08, 0.22, d * 1.08);
  roof.position.y = h;
  g.add(roof);

  if (q === 'high' && rand() < 0.5) {
    const tank = new THREE.Mesh(G.cylUp(q), mat('tank', { color: 0x3f5f8a, roughness: 0.7 }));
    tank.scale.set(0.9, 1.1, 0.9);
    tank.position.set(w * 0.22, h + 0.2, -d * 0.2);
    g.add(tank);
  }
  return g;
}

/** Market umbrella with produce crates. */
function marketStand(rand: () => number, q: Quality): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(G.cylUp(q), M.darkBark());
  pole.scale.set(0.1, 2.2, 0.1);
  g.add(pole);
  const canopy = new THREE.Mesh(G.coneUp(q), rand() < 0.5 ? M.red() : M.yellow());
  canopy.scale.set(3.2, 0.9, 3.2);
  canopy.position.y = 2.1;
  canopy.castShadow = true;
  g.add(canopy);
  for (let i = 0; i < 3; i++) {
    const crate = new THREE.Mesh(G.boxUp(), M.bark());
    crate.scale.set(0.7, 0.5, 0.7);
    crate.position.set((rand() - 0.5) * 1.8, 0, (rand() - 0.5) * 1.8);
    crate.rotation.y = rand();
    crate.castShadow = true;
    g.add(crate);
    const fruit = new THREE.Mesh(G.lowSphere(), rand() < 0.5 ? M.red() : M.green());
    fruit.scale.setScalar(0.42);
    fruit.position.set(crate.position.x, 0.6, crate.position.z);
    g.add(fruit);
  }
  return g;
}

/** Coffee-ceremony scene: jebena on a brazier with woven mesob stools. */
function coffeeCeremony(q: Quality): THREE.Group {
  const g = new THREE.Group();
  const mesob = new THREE.Mesh(G.coneUp(q), mat('mesob', { color: 0xd8b25e, roughness: 0.9 }));
  mesob.scale.set(1.2, 1.1, 1.2);
  mesob.castShadow = true;
  g.add(mesob);
  const jebena = new THREE.Mesh(G.sphere(q), mat('jebena', { color: 0x2d2119, roughness: 0.55 }));
  jebena.scale.set(0.5, 0.62, 0.5);
  jebena.position.y = 1.4;
  g.add(jebena);
  const spout = new THREE.Mesh(G.cylUp(q), mat('jebena', { color: 0x2d2119, roughness: 0.55 }));
  spout.scale.set(0.09, 0.6, 0.09);
  spout.position.set(0.28, 1.5, 0);
  spout.rotation.z = -0.8;
  g.add(spout);
  const neck = new THREE.Mesh(G.cylUp(q), mat('jebena', { color: 0x2d2119, roughness: 0.55 }));
  neck.scale.set(0.14, 0.45, 0.14);
  neck.position.y = 1.7;
  g.add(neck);
  const embers = new THREE.Mesh(G.circle(q), mat('embers', { color: 0xff6a1e, emissive: 0xff4500, emissiveIntensity: 2.2, roughness: 1 }));
  embers.rotation.x = -Math.PI / 2;
  embers.scale.setScalar(0.9);
  embers.position.y = 0.06;
  g.add(embers);
  return g;
}

/** Wooden drying bed covered in coffee cherries. */
function dryingBed(rand: () => number): THREE.Group {
  const g = new THREE.Group();
  const table = new THREE.Mesh(G.box(), M.bark());
  table.scale.set(4.5, 0.12, 2.4);
  table.position.y = 0.75;
  table.castShadow = true;
  g.add(table);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(G.boxUp(), M.darkBark());
      leg.scale.set(0.12, 0.75, 0.12);
      leg.position.set(sx * 2.05, 0, sz * 1.0);
      g.add(leg);
    }
  }
  const beans = new THREE.Mesh(G.box(), rand() < 0.5 ? M.cherry() : mat('beanTan', { color: 0xd9c39a, roughness: 0.95 }));
  beans.scale.set(4.2, 0.14, 2.1);
  beans.position.y = 0.86;
  g.add(beans);
  return g;
}

/** Meskel daisy patch — the yellow flowers that blanket Ethiopia in September. */
function meskelPatch(rand: () => number): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const f = new THREE.Mesh(G.circle('low'), M.flowerY());
    (f.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    f.scale.setScalar(0.22 + rand() * 0.14);
    f.position.set((rand() - 0.5) * 4, 0.06 + rand() * 0.35, (rand() - 0.5) * 4);
    f.rotation.x = -Math.PI / 2 + (rand() - 0.5) * 0.5;
    g.add(f);
  }
  return g;
}

/* ----------------------------- big set pieces ----------------------------- */

/** Multi-tier waterfall with mist, used in Blue Nile and highland valleys. */
export function buildWaterfall(q: Quality): { group: THREE.Group; sheets: THREE.Mesh[] } {
  const group = new THREE.Group();
  const sheets: THREE.Mesh[] = [];

  const cliff = new THREE.Mesh(G.boxUp(), M.rockDark());
  cliff.scale.set(26, 26, 12);
  cliff.position.y = -1;
  group.add(cliff);

  const lip = new THREE.Mesh(G.boxUp(), M.stone());
  lip.scale.set(27, 1.2, 13);
  lip.position.y = 24.5;
  group.add(lip);

  // water sheets — scrolled by shifting the texture-less UV via offset in y
  for (let i = 0; i < 3; i++) {
    const wm = new THREE.MeshStandardMaterial({
      color: 0xbfe4f5,
      roughness: 0.15,
      metalness: 0.25,
      transparent: true,
      opacity: 0.82 - i * 0.12,
      emissive: 0x2f7ea6,
      emissiveIntensity: 0.22,
    });
    const sheet = new THREE.Mesh(G.plane(), wm);
    sheet.scale.set(6.5 - i * 1.4, 25, 1);
    sheet.position.set((i - 1) * 6.2, 12, 6.2 + i * 0.25);
    sheets.push(sheet);
    group.add(sheet);
  }

  // plunge pool + foam
  const pool = new THREE.Mesh(G.circle(q), M.water());
  pool.rotation.x = -Math.PI / 2;
  pool.scale.setScalar(30);
  pool.position.set(0, 0.1, 16);
  group.add(pool);

  for (let i = 0; i < 6; i++) {
    const foam = new THREE.Mesh(G.circle(q), M.foam());
    foam.rotation.x = -Math.PI / 2;
    foam.scale.setScalar(4 + i * 1.6);
    foam.position.set((i - 3) * 3.5, 0.16, 8 + i * 0.6);
    group.add(foam);
  }

  // mist billboards
  const mistMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });
  for (let i = 0; i < 5; i++) {
    const mist = new THREE.Mesh(G.plane(), mistMat);
    mist.scale.set(12 + i * 3, 8 + i * 2, 1);
    mist.position.set((i - 2) * 4, 2 + i * 1.4, 9);
    group.add(mist);
  }

  return { group, sheets };
}

/* ------------------------------- environment ------------------------------ */

export class Environment {
  readonly root = new THREE.Group();
  private chunks: Chunk[] = [];
  private ridgeFar: THREE.Mesh;
  private ridgeMid: THREE.Mesh;
  private ridgeNear: THREE.Mesh;
  private ridgeFarMat: THREE.MeshBasicMaterial;
  private ridgeMidMat: THREE.MeshBasicMaterial;
  private ridgeNearMat: THREE.MeshBasicMaterial;
  private valleyFloor: THREE.Mesh;
  private valleyMat: THREE.MeshBasicMaterial;
  private waterfall: THREE.Group;
  private waterfallSheets: THREE.Mesh[];
  private quality: Quality;
  private chunkCount: number;
  private baseIndex = 0;

  constructor(quality: Quality) {
    this.quality = quality;
    this.chunkCount = quality === 'high' ? CHUNK_COUNT_HIGH : CHUNK_COUNT_LOW;

    for (let i = 0; i < this.chunkCount; i++) {
      const c = new Chunk(quality);
      this.chunks.push(c);
      this.root.add(c.group);
    }

    // Distant mountain silhouettes: three parallax ridges built from noise.
    this.ridgeFarMat = new THREE.MeshBasicMaterial({ color: 0x5a6f86, fog: false });
    this.ridgeMidMat = new THREE.MeshBasicMaterial({ color: 0x46586d, fog: false });
    this.ridgeNearMat = new THREE.MeshBasicMaterial({ color: 0x35434f, fog: false });
    this.ridgeFar = new THREE.Mesh(ridgeGeometry(1337, 900, 150, 44), this.ridgeFarMat);
    this.ridgeMid = new THREE.Mesh(ridgeGeometry(4242, 700, 110, 40), this.ridgeMidMat);
    this.ridgeNear = new THREE.Mesh(ridgeGeometry(9001, 560, 78, 36), this.ridgeNearMat);
    this.ridgeFar.position.set(0, -14, -560);
    this.ridgeMid.position.set(0, -12, -420);
    this.ridgeNear.position.set(0, -10, -300);
    this.ridgeFar.renderOrder = -6;
    this.ridgeMid.renderOrder = -5;
    this.ridgeNear.renderOrder = -4;
    this.root.add(this.ridgeFar, this.ridgeMid, this.ridgeNear);

    // Valley floor behind the ridges — reads as a huge drop into the gorge.
    this.valleyMat = new THREE.MeshBasicMaterial({ color: 0x2f4a3a, fog: false });
    this.valleyFloor = new THREE.Mesh(G.plane(), this.valleyMat);
    this.valleyFloor.rotation.x = -Math.PI / 2;
    this.valleyFloor.scale.set(1400, 700, 1);
    this.valleyFloor.position.set(0, -26, -420);
    this.valleyFloor.renderOrder = -7;
    this.root.add(this.valleyFloor);

    const wf = buildWaterfall(quality);
    this.waterfall = wf.group;
    this.waterfallSheets = wf.sheets;
    this.waterfall.position.set(-64, -6, -180);
    this.waterfall.visible = false;
    this.root.add(this.waterfall);
  }

  /** Reposition/rebuild chunks so the track always covers the camera range. */
  update(
    runnerZ: number,
    world: WorldState,
    palette: TerrainPalette,
    time: number,
    dt: number,
    biomeForDistance: (d: number) => Biome,
  ) {
    // Chunk 0 sits just behind the runner; the rest stream ahead.
    const base = Math.floor(runnerZ / CHUNK_LEN) - 1;
    this.baseIndex = base;

    for (let i = 0; i < this.chunkCount; i++) {
      const idx = base + i;
      const c = this.chunks[i];
      const worldZ = idx * CHUNK_LEN;
      c.group.position.z = -worldZ;

      // metres travelled at this chunk → distance units the engine uses
      const chunkBiome = biomeForDistance(worldZ * 0.62);
      if (c.index !== idx || c.biome !== chunkBiome) {
        c.index = idx;
        c.biome = chunkBiome;
        c.clearProps();
        this.populate(c, idx, chunkBiome, world);
      }
      c.applyPalette(palette);
      c.animate(time, world.wind);
    }
    updateWind(time, world.wind);
    {
    }

    // ridges parallax subtly with travel so mountains feel far but alive
    const px = Math.sin(runnerZ * 0.0016) * 26;
    this.ridgeFar.position.x = px * 0.3;
    this.ridgeMid.position.x = px * 0.6;
    this.ridgeNear.position.x = px;
    this.ridgeFar.position.z = -560 - runnerZ * 0;

    // waterfall: only in water-adjacent biomes, parked at a fixed side spot
    const showFall =
      world.biome === 'blue_nile' ||
      world.nextBiome === 'blue_nile' ||
      world.biome === 'simien_mountains';
    this.waterfall.visible = showFall;
    if (showFall) {
      const anchor = Math.floor((runnerZ + 150) / 260) * 260;
      this.waterfall.position.z = -anchor;
      this.waterfall.position.x = world.biome === 'simien_mountains' ? 72 : -68;
      this.waterfall.rotation.y = world.biome === 'simien_mountains' ? -0.5 : 0.5;
      for (let i = 0; i < this.waterfallSheets.length; i++) {
        const s = this.waterfallSheets[i];
        const m = s.material as THREE.MeshStandardMaterial;
        m.opacity = 0.72 + Math.sin(time * (3 + i) + i) * 0.1;
        s.scale.x = (6.5 - i * 1.4) * (1 + Math.sin(time * 2 + i) * 0.03);
      }
    }

    void dt;
  }

  /** Recolour the distance layers for the current sky/biome. */
  applyAtmosphere(fogColor: THREE.Color, palette: TerrainPalette, light: number) {
    const far = parseColor(palette.mountainFar);
    const mid = parseColor(palette.mountainMid);
    const near = parseColor(palette.mountainNear);
    // Ridges blend toward the fog colour with distance — cheap aerial perspective.
    this.ridgeFarMat.color.copy(far).lerp(fogColor, 0.62);
    this.ridgeMidMat.color.copy(mid).lerp(fogColor, 0.42);
    this.ridgeNearMat.color.copy(near).lerp(fogColor, 0.24);
    this.valleyMat.color.copy(parseColor(palette.fieldDark)).lerp(fogColor, 0.5).multiplyScalar(0.5 + light * 0.5);
  }

  private populate(c: Chunk, idx: number, biome: Biome, world: WorldState) {
    const rand = mulberry32(idx * 7919 + 13);
    const q = this.quality;
    const night = world.timeOfDay === 'night';
    const density = q === 'high' ? 1 : 0.55;

    const place = (obj: THREE.Object3D, x: number, z: number) => {
      obj.position.set(x, 0, z);
      c.add(obj);
    };

    // Side offset helper: keep everything clear of the road.
    const sideX = (r: number, min = 5.4, max = 26) => (r < 0.5 ? -1 : 1) * (min + rand() * (max - min));

    switch (biome) {
      case 'coffee_highlands': {
        const n = Math.round(9 * density);
        for (let i = 0; i < n; i++) {
          const b = coffeeBush(rand, q);
          const s = 0.85 + rand() * 0.5;
          b.scale.setScalar(s);
          place(b, sideX(rand(), 4.9, 22), -rand() * CHUNK_LEN);
        }
        if (rand() < 0.7) place(terrace(rand, rand() < 0.5 ? -1 : 1), 0, -rand() * CHUNK_LEN);
        if (rand() < 0.45) place(dryingBed(rand), sideX(rand(), 7, 13), -rand() * CHUNK_LEN);
        if (rand() < 0.3) place(coffeeCeremony(q), sideX(rand(), 6.5, 10), -rand() * CHUNK_LEN);
        if (rand() < 0.5) place(acacia(rand, q), sideX(rand(), 14, 30), -rand() * CHUNK_LEN);
        if (rand() < 0.6) place(meskelPatch(rand), sideX(rand(), 5, 14), -rand() * CHUNK_LEN);
        break;
      }
      case 'traditional_village': {
        const n = Math.round(3 * density) + 1;
        for (let i = 0; i < n; i++) {
          const t = tukul(rand, q);
          t.rotation.y = rand() * Math.PI;
          place(t, sideX(rand(), 8, 22), -rand() * CHUNK_LEN);
        }
        if (rand() < 0.8) place(coffeeCeremony(q), sideX(rand(), 6, 9), -rand() * CHUNK_LEN);
        for (let i = 0; i < Math.round(3 * density); i++) {
          place(enset(rand), sideX(rand(), 5.2, 16), -rand() * CHUNK_LEN);
        }
        if (rand() < 0.5) place(marketStand(rand, q), sideX(rand(), 6.5, 11), -rand() * CHUNK_LEN);
        // livestock fence line
        if (rand() < 0.5) {
          const fence = new THREE.Group();
          for (let i = 0; i < 8; i++) {
            const post = new THREE.Mesh(G.cylUp('low'), M.bark());
            post.scale.set(0.11, 1.1 + rand() * 0.3, 0.11);
            post.position.set(0, 0, -i * 1.6);
            fence.add(post);
          }
          place(fence, sideX(rand(), 6, 9), -rand() * CHUNK_LEN);
        }
        break;
      }
      case 'addis_ababa': {
        const n = Math.round(4 * density) + 1;
        for (let i = 0; i < n; i++) {
          const b = building(rand, q, night);
          b.rotation.y = (rand() - 0.5) * 0.3;
          place(b, sideX(rand(), 9, 30), -rand() * CHUNK_LEN);
        }
        for (let i = 0; i < Math.round(2 * density); i++) {
          place(marketStand(rand, q), sideX(rand(), 6, 9), -rand() * CHUNK_LEN);
        }
        // street lamps in a rhythm along both sides
        for (let i = 0; i < 2; i++) {
          for (const sx of [-1, 1]) {
            const lamp = new THREE.Group();
            const pole = new THREE.Mesh(G.cylUp(q), mat('lampPole', { color: 0x3a3a3e, roughness: 0.6, metalness: 0.5 }));
            pole.scale.set(0.14, 5, 0.14);
            lamp.add(pole);
            const arm = new THREE.Mesh(G.box(), mat('lampPole', { color: 0x3a3a3e, roughness: 0.6, metalness: 0.5 }));
            arm.scale.set(1.2, 0.1, 0.1);
            arm.position.set(-sx * 0.6, 5, 0);
            lamp.add(arm);
            const head = new THREE.Mesh(G.sphere('low'), night ? M.windowLit() : mat('lampOff', { color: 0xd8d8d0, roughness: 0.4 }));
            head.scale.set(0.42, 0.26, 0.42);
            head.position.set(-sx * 1.15, 4.92, 0);
            lamp.add(head);
            place(lamp, sx * 5.6, -i * 10 - 2);
          }
        }
        break;
      }
      case 'simien_mountains': {
        for (let i = 0; i < Math.round(6 * density); i++) {
          const r = new THREE.Mesh(rand() < 0.5 ? G.rock() : G.rock2(), M.rockDark());
          const s = 1 + rand() * 3.4;
          r.scale.set(s, s * (0.6 + rand() * 0.7), s);
          r.rotation.set(rand(), rand(), rand());
          r.castShadow = true;
          r.receiveShadow = true;
          place(r, sideX(rand(), 5.2, 26), -rand() * CHUNK_LEN);
        }
        for (let i = 0; i < Math.round(3 * density); i++) {
          place(lobelia(rand, q), sideX(rand(), 5.4, 18), -rand() * CHUNK_LEN);
        }
        // escarpment wall: a dramatic cliff on one side
        if (rand() < 0.85) {
          const side = idx % 2 === 0 ? -1 : 1;
          const cliff = new THREE.Group();
          for (let i = 0; i < 4; i++) {
            const slab = new THREE.Mesh(G.boxUp(), i % 2 ? M.stone() : M.rockDark());
            const h = 6 + rand() * 16;
            slab.scale.set(9 + rand() * 6, h, 7 + rand() * 5);
            slab.position.set(side * (i * 3.5), -1, -i * 4.5 - rand() * 3);
            slab.rotation.y = (rand() - 0.5) * 0.4;
            slab.castShadow = true;
            slab.receiveShadow = true;
            cliff.add(slab);
            if (h > 14) {
              const cap = new THREE.Mesh(G.rock(), M.snow());
              cap.scale.set(7, 2.4, 6);
              cap.position.set(slab.position.x, h - 1, slab.position.z);
              cliff.add(cap);
            }
          }
          place(cliff, side * 15, -rand() * 6);
        }
        break;
      }
      case 'blue_nile': {
        // The river runs alongside on one side, with the gorge dropping away.
        const side = idx % 2 === 0 ? 1 : -1;
        const river = new THREE.Mesh(G.plane(), M.water());
        river.rotation.x = -Math.PI / 2;
        river.scale.set(46, CHUNK_LEN + 1, 1);
        river.position.set(side * 32, -1.2, -CHUNK_LEN / 2);
        c.add(river);

        const bank = new THREE.Mesh(G.boxUp(), mat('bank', { color: 0x6d5637, roughness: 0.98 }));
        bank.scale.set(6, 1.4, CHUNK_LEN + 1);
        bank.position.set(side * 9.5, -1.4, -CHUNK_LEN / 2);
        c.add(bank);

        for (let i = 0; i < Math.round(4 * density); i++) {
          place(reeds(rand), side * (7 + rand() * 3), -rand() * CHUNK_LEN);
        }
        for (let i = 0; i < Math.round(3 * density); i++) {
          place(acacia(rand, q), -side * (7 + rand() * 16), -rand() * CHUNK_LEN);
        }
        if (rand() < 0.4) place(tukul(rand, q), -side * (11 + rand() * 8), -rand() * CHUNK_LEN);
        if (rand() < 0.5) place(meskelPatch(rand), -side * (5.5 + rand() * 8), -rand() * CHUNK_LEN);
        break;
      }
    }

    // Roadside grass tufts everywhere — cheap and they hide the road/verge seam.
    const tufts = Math.round(10 * density);
    const tuftMat = applyWind(mat('tuft', { color: 0x3d6b2f, roughness: 0.95 }), 2);
    for (let i = 0; i < tufts; i++) {
      const t = new THREE.Mesh(G.coneUp('low'), tuftMat);
      const s = 0.3 + rand() * 0.5;
      t.scale.set(s, s * 1.7, s);
      place(t, sideX(rand(), 4.2, 9), -rand() * CHUNK_LEN);
    }

    // Collapse everything staged above into a few merged draw calls.
    c.finalise();
  }

  setQuality(q: Quality) {
    if (q === this.quality) return;
    this.quality = q;
    for (const c of this.chunks) {
      c.index = -1; // force repopulate at new density
    }
  }

  get chunkBase() {
    return this.baseIndex;
  }

  dispose() {
    for (const c of this.chunks) c.clearProps();
    this.ridgeFar.geometry.dispose();
    this.ridgeMid.geometry.dispose();
    this.ridgeNear.geometry.dispose();
  }
}

/** Build a jagged mountain-ridge silhouette as a single triangle strip mesh. */
function ridgeGeometry(seed: number, width: number, height: number, segments: number): THREE.BufferGeometry {
  const rand = mulberry32(seed);
  const pts: THREE.Vector2[] = [];
  let h = height * 0.4;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    // layered noise: broad peaks with sharp Simien-style spires on top
    const broad = Math.sin(t * Math.PI * 2.2 + seed) * 0.5 + 0.5;
    h = height * (0.25 + broad * 0.6) + (rand() - 0.5) * height * 0.4;
    if (rand() < 0.18) h += height * 0.35;
    pts.push(new THREE.Vector2((t - 0.5) * width, Math.max(height * 0.12, h)));
  }
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -height);
  for (const p of pts) shape.lineTo(p.x, p.y);
  shape.lineTo(width / 2, -height);
  shape.closePath();
  const g = new THREE.ShapeGeometry(shape);
  g.userData.own = true;
  return g;
}
