/**
 * The 3D renderer: turns the existing GameEngine's snapshot into a real
 * three.js scene each frame.
 *
 * Deliberately a drop-in replacement for the old 2D Renderer — same
 * `resize()` / `render(engine)` / `setQuality()` surface — so the game loop,
 * engine physics, progression and UI are untouched.
 */

import * as THREE from 'three';
import type { GameEngine } from '../game/engine';
import type {
  Appearance,
  Biome,
  Collectible,
  Obstacle,
  Wildlife,
  WorldState,
} from '../game/types';
import { BIOME_DISTANCE, BIOME_ORDER } from '../game/types';
import { skyPalette, terrainPalette } from '../game/world';
import {
  JUMP_SCALE,
  ObjectPool,
  PLAYER_Z,
  type Quality,
  laneToWorld,
  zToWorld,
} from './core';
import { Character } from './character';
import { Environment } from './environment';
import { Sky } from './sky';
import { ChaseCamera } from './camera';
import { Auras, FloatingText3D, Particles3D, Rain, SpeedLines } from './effects';
import { animateAnimal, animateWildlife, buildCollectible, buildObstacle, buildWildlife } from './props';

/** Engine distance → biome, matching world.ts exactly. */
function biomeForDistance(d: number): Biome {
  const idx = Math.floor(Math.max(0, d) / BIOME_DISTANCE) % BIOME_ORDER.length;
  return BIOME_ORDER[idx];
}

const COLLECT_COLORS: Record<string, number> = {
  bean: 0x8a6440,
  coin: 0xffd23f,
  injera: 0xe4d2a8,
  golden_bean: 0xffd23f,
  meskel_flower: 0xffb020,
  coffee_pot: 0xb08050,
  star: 0xfff2a0,
  powerup: 0x9fd8ff,
};

export class Scene3D {
  readonly scene = new THREE.Scene();
  private renderer: THREE.WebGLRenderer;
  private chase: ChaseCamera;
  private sky: Sky;
  private env: Environment;
  private character!: Character;
  private playerRig = new THREE.Group();
  private shadowBlob: THREE.Mesh;
  private auras: Auras;
  private particles: Particles3D;
  private rain: Rain;
  private speedLines: SpeedLines;
  private texts: FloatingText3D;

  private obstaclePools = new Map<string, ObjectPool<THREE.Group>>();
  private obstacleRoot = new THREE.Group();
  private collectiblePools = new Map<string, ObjectPool<THREE.Group>>();
  private collectibleRoot = new THREE.Group();
  private wildlifePools = new Map<string, ObjectPool<THREE.Group>>();
  private wildlifeRoot = new THREE.Group();

  private quality: Quality = 'high';
  private lastTime = 0;
  private runnerZ = 0;
  private prevPlayerX = 0;
  private laneVel = 0;
  private wasJumping = false;
  private wasAlive = true;
  private lastCombo = 0;
  private lastShield = 0;
  private seenCollectibles = new Set<number>();
  private seenTexts = new Set<number>();
  private width = 0;
  private height = 0;

  /** Public so the loop can report the actual GPU frame cost. */
  lastFrameMs = 0;

  constructor(canvas: HTMLCanvasElement, appearance: Appearance, quality: Quality) {
    this.quality = quality;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: quality === 'high',
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
      depth: true,
    });
    this.renderer.setClearColor(0x9fbcd4, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene.fog = new THREE.Fog(0x9fbcd4, 42, 165);

    this.chase = new ChaseCamera(1);
    this.sky = new Sky(quality);
    this.env = new Environment(quality);
    this.scene.add(this.sky.root, this.env.root);

    // ---- player ----
    this.character = new Character(appearance, quality);
    this.playerRig.add(this.character.root);
    this.auras = new Auras();
    this.playerRig.add(this.auras.root);
    this.scene.add(this.playerRig);

    // Soft contact shadow under the runner — reads even when the sun is low.
    const blobMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    });
    this.shadowBlob = new THREE.Mesh(new THREE.CircleGeometry(0.75, 20), blobMat);
    this.shadowBlob.rotation.x = -Math.PI / 2;
    this.shadowBlob.renderOrder = 1;
    this.scene.add(this.shadowBlob);

    this.scene.add(this.obstacleRoot, this.collectibleRoot, this.wildlifeRoot);

    this.particles = new Particles3D(quality);
    this.rain = new Rain(quality);
    this.speedLines = new SpeedLines(quality);
    this.texts = new FloatingText3D(quality === 'high' ? 16 : 8);
    this.scene.add(this.particles.points, this.rain.mesh, this.speedLines.mesh, this.texts.root);
  }

  /* -------------------------------- plumbing ------------------------------- */

  setAppearance(a: Appearance) {
    this.character.setAppearance(a);
  }

  setQuality(q: Quality) {
    if (q === this.quality) return;
    this.quality = q;
    this.renderer.shadowMap.type = q === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.sky.setQuality(q);
    this.env.setQuality(q);
  }

  resize(w: number, h: number, dpr: number) {
    this.width = w;
    this.height = h;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.chase.resize(w / h);
    this.particles.setPixelScale(Math.min(2, dpr) * (h / 800));
  }

  private poolFor(
    map: Map<string, ObjectPool<THREE.Group>>,
    root: THREE.Object3D,
    key: string,
    build: () => THREE.Group,
  ): ObjectPool<THREE.Group> {
    let p = map.get(key);
    if (!p) {
      p = new ObjectPool<THREE.Group>(root, build);
      map.set(key, p);
    }
    return p;
  }

  /* --------------------------------- render -------------------------------- */

  render(engine: GameEngine) {
    const t0 = performance.now();
    const now = t0 / 1000;
    let dt = this.lastTime ? now - this.lastTime : 0.016;
    this.lastTime = now;
    dt = Math.min(0.05, Math.max(0.0005, dt));

    const snap = engine.snapshot();
    const world = snap.world;
    const alive = snap.alive;

    // Engine distance (metres-ish) drives our world Z so the environment
    // streams in perfect lockstep with gameplay.
    this.runnerZ = -snap.stats.distance * 1.62;

    const skyPal = skyPalette(world);
    const terrain = terrainPalette(world.biome, world.nextBiome, world.biomeBlend, world.light);

    /* ---- player transform ---- */
    const px = laneToWorld(engine.playerLaneFloat ?? snap.player.targetLane);
    const jumpH = Math.max(0, engine.ground - snap.player.y) * JUMP_SCALE;
    this.laneVel = (px - this.prevPlayerX) / dt;
    this.prevPlayerX = px;

    this.playerRig.position.set(px, jumpH, this.runnerZ);

    const speed01 = THREE.MathUtils.clamp((snap.speed - 200) / 340, 0, 1);

    // pose selection
    if (!alive) this.character.setPose('dead');
    else if (snap.player.sliding) this.character.setPose('slide');
    else if (snap.player.jumping) this.character.setPose(snap.player.vy > 40 ? 'fall' : 'jump');
    else if (snap.speed < 30) this.character.setPose('idle');
    else this.character.setPose('run');

    this.character.update(dt, speed01, this.laneVel);

    // landing detection → dust + camera dip
    if (this.wasJumping && !snap.player.jumping && alive) {
      this.chase.land(0.85);
      this.particles.emit(px, 0.1, this.runnerZ, this.quality === 'high' ? 16 : 8, {
        color: 0xd7bd96,
        speed: 3.4,
        spread: 1.5,
        size: 26,
        life: 0.55,
        gravity: -5,
        up: 0.8,
      });
    }
    this.wasJumping = snap.player.jumping;

    // running foot dust
    if (alive && !snap.player.jumping && snap.speed > 60) {
      const rate = this.quality === 'high' ? 3 : 1;
      if (Math.random() < dt * 26) {
        this.particles.emit(px + (Math.random() - 0.5) * 0.5, 0.08, this.runnerZ + 0.3, rate, {
          color: world.biome === 'addis_ababa' ? 0xb9b2a6 : 0xc8ab7f,
          speed: 1.4,
          spread: 1.1,
          size: 16,
          life: 0.5,
          gravity: -2.2,
          up: 0.5,
          forward: 3.2,
        });
      }
    }
    // slide sparks / dust plume
    if (alive && snap.player.sliding) {
      this.particles.emit(px, 0.15, this.runnerZ + 0.5, 2, {
        color: 0xe0c79c,
        speed: 2.6,
        spread: 1.4,
        size: 20,
        life: 0.42,
        gravity: -3,
        up: 1.1,
        forward: 4.5,
      });
    }

    // death burst
    if (this.wasAlive && !alive) {
      this.chase.impact(1.1);
      this.particles.emit(px, 1.1, this.runnerZ, this.quality === 'high' ? 46 : 22, {
        color: 0xff7a4a,
        speed: 8,
        spread: 1.6,
        size: 34,
        life: 1,
        gravity: -12,
        up: 3,
      });
      this.particles.emit(px, 0.8, this.runnerZ, this.quality === 'high' ? 24 : 12, {
        color: 0x6b4a2c,
        speed: 5,
        spread: 1.4,
        size: 28,
        life: 1.2,
        gravity: -9,
      });
    }
    this.wasAlive = alive;

    // shield break flash
    if (snap.effects.shield < this.lastShield) {
      this.character.hitReaction();
      this.chase.impact(0.6);
      this.particles.emit(px, 1.2, this.runnerZ, 28, {
        color: 0x6ec2ff,
        speed: 7,
        spread: 1.6,
        size: 30,
        life: 0.8,
        gravity: -4,
        up: 1.5,
      });
    }
    this.lastShield = snap.effects.shield;

    // combo milestone flourish
    if (snap.stats.combo > this.lastCombo && snap.stats.combo % 5 === 0 && snap.stats.combo > 0) {
      this.particles.emit(px, 1.8, this.runnerZ, 18, {
        color: 0xffd23f,
        speed: 5,
        spread: 1.5,
        size: 26,
        life: 0.9,
        gravity: -3,
        up: 2.4,
      });
    }
    this.lastCombo = snap.stats.combo;

    /* ---- contact shadow ---- */
    this.shadowBlob.position.set(px, 0.03, this.runnerZ);
    const shrink = THREE.MathUtils.clamp(1 - jumpH * 0.16, 0.42, 1);
    this.shadowBlob.scale.setScalar(shrink * (snap.player.sliding ? 1.35 : 1));
    (this.shadowBlob.material as THREE.MeshBasicMaterial).opacity = 0.34 * shrink * (0.4 + world.light * 0.6);

    /* ---- world ---- */
    this.sky.update(dt, world, skyPal, snap.time);
    this.sky.follow(0, this.runnerZ);
    this.sky.aimShadow(this.runnerZ);
    this.env.applyAtmosphere(this.sky.fogColor, terrain, world.light);
    this.env.update(-this.runnerZ, world, terrain, snap.time, dt, biomeForDistance);

    // Fog + clear colour track the sky so the horizon never shows a seam.
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(this.sky.fogColor);
    this.renderer.setClearColor(this.sky.fogColor, 1);
    const heavy = world.weather === 'storm' || world.weather === 'rain';
    fog.near = heavy ? 26 : 44;
    fog.far = heavy ? 118 : world.timeOfDay === 'night' ? 135 : 175;

    /* ---- entities ---- */
    this.syncObstacles(snap.obstacles, world, snap.time);
    this.syncCollectibles(snap.collectibles, snap.time, px);
    this.syncWildlife(snap.wildlife, engine);

    /* ---- effects ---- */
    this.auras.root.position.set(px, jumpH, this.runnerZ);
    this.auras.update(dt, snap.time, snap.effects);
    this.particles.update(dt);
    this.rain.update(dt, world.rainIntensity, world.wind, px, this.runnerZ, world.timeOfDay === 'night');
    this.speedLines.update(dt, alive ? Math.max(0, speed01 - 0.28) * 1.4 : 0, this.runnerZ);
    this.syncTexts(engine);
    this.texts.update(dt);
    this.sky.lights.playerLight.position.set(px, jumpH + 2.2, this.runnerZ + 0.5);

    /* ---- camera ---- */
    this.chase.setMode(alive ? 'play' : 'gameover');
    this.chase.update(dt, {
      x: px,
      y: jumpH,
      z: this.runnerZ,
      laneVel: this.laneVel,
      speed01,
      jumping: snap.player.jumping,
      sliding: snap.player.sliding,
      alive,
      pulse: engine.cameraPulse,
      shakeEngine: snap.shake,
      allowShake: engine.settings.screenShake,
      portrait: this.height > this.width * 1.25,
    });

    this.renderer.render(this.scene, this.chase.camera);
    this.lastFrameMs = performance.now() - t0;
  }

  /** Menu framing: slow orbit around an idle runner in the highlands. */
  renderMenu(engine: GameEngine) {
    this.chase.setMode('menu');
    this.render(engine);
  }

  /* ------------------------------- entity sync ------------------------------ */

  private syncObstacles(obstacles: Obstacle[], world: WorldState, time: number) {
    for (const p of this.obstaclePools.values()) p.begin();
    for (const o of obstacles) {
      if (o.z > 1.15 || o.z < -0.15) continue;
      const pool = this.poolFor(this.obstaclePools, this.obstacleRoot, o.type, () => {
        const g = buildObstacle(o.type, this.quality);
        g.traverse((n) => {
          const m = n as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            m.receiveShadow = o.type === 'river' || o.type === 'pot_hole';
          }
        });
        return g;
      });
      const g = pool.acquire(o.id);
      const x = o.multiLane ? 0 : laneToWorld(o.lane);
      g.position.set(x, 0, zToWorld(o.z));
      const wide = o.multiLane ? 1.55 : 1;
      g.scale.set(wide, 1, 1);

      if (o.type === 'goat' || o.type === 'sheep' || o.type === 'hyena') {
        animateAnimal(g, (o.goatPhase ?? 0) * 1.4);
        // livestock wander across their lane, exactly like the 2D version
        g.position.x = x + Math.sin((o.goatPhase ?? 0) * 0.9) * 0.55 * (o.goatDir ?? 1);
        g.rotation.y = Math.PI + Math.sin((o.goatPhase ?? 0) * 0.9) * 0.4 * (o.goatDir ?? 1);
      } else if (o.type === 'bajaj') {
        g.position.y = Math.abs(Math.sin((o.anim ?? 0) * 6)) * 0.045;
        g.rotation.y = Math.PI + Math.sin((o.anim ?? 0) * 3) * 0.05;
      } else if (o.type === 'river' || o.type === 'pot_hole') {
        g.rotation.y = 0;
      } else if (!pool.has(o.id)) {
        g.rotation.y = 0;
      }
    }
    for (const p of this.obstaclePools.values()) p.end();
    void world;
    void time;
  }

  private syncCollectibles(collectibles: Collectible[], time: number, playerX: number) {
    for (const p of this.collectiblePools.values()) p.begin();
    const alive = new Set<number>();

    for (const c of collectibles) {
      alive.add(c.id);
      if (c.z > 1.15 || c.z < -0.15) continue;
      const key = c.type === 'powerup' ? `pu-${c.powerup}` : c.type;
      const pool = this.poolFor(this.collectiblePools, this.collectibleRoot, key, () =>
        buildCollectible(c.type, this.quality, c.powerup),
      );
      const g = pool.acquire(c.id);
      const x = laneToWorld(c.lane);
      const bob = Math.sin(c.bobPhase) * 0.18;
      g.position.set(x, 1.05 + bob, zToWorld(c.z));
      g.rotation.y = (c.spin ?? 0) * 1.6;

      if (c.type === 'coin') g.rotation.z = time * 3.4;
      if (c.type === 'powerup') {
        const ring = g.userData.ring as THREE.Mesh | undefined;
        const ring2 = g.userData.ring2 as THREE.Mesh | undefined;
        if (ring) ring.rotation.z = time * 2.2;
        if (ring2) ring2.rotation.y = time * 2.8;
        g.position.y = 1.2 + bob * 1.2;
      }
      const halo = g.userData.billboard as THREE.Mesh | undefined;
      if (halo) {
        halo.lookAt(this.chase.camera.position);
        halo.scale.setScalar(1.5 + Math.sin(time * 5) * 0.16);
      }
      this.seenCollectibles.add(c.id);
    }

    // Anything that vanished while near the player was collected → sparkle.
    for (const id of this.seenCollectibles) {
      if (alive.has(id)) continue;
      this.seenCollectibles.delete(id);
    }

    for (const p of this.collectiblePools.values()) p.end();
    void playerX;
  }

  /** Called by the loop when the engine reports a pickup, for exact FX. */
  onCollect(type: string, lane: number, points: number, combo: number) {
    const x = laneToWorld(lane);
    const z = zToWorld(PLAYER_Z);
    const color = COLLECT_COLORS[type] ?? 0xffd23f;
    const big = type === 'star' || type === 'golden_bean' || type === 'coffee_pot';
    this.particles.emit(x, 1.2, z, big ? 30 : 14, {
      color,
      speed: big ? 7 : 4.2,
      spread: 1.4,
      size: big ? 32 : 22,
      life: big ? 0.9 : 0.6,
      gravity: -6,
      up: 1.8,
    });
    if (big) {
      this.chase.impact(0.3);
      this.particles.emit(x, 1.2, z, 14, { color: 0xffffff, speed: 9, spread: 1.6, size: 18, life: 0.5, gravity: -3 });
    }
    const label = combo > 1 && combo % 5 === 0 ? `${combo}x COMBO!` : `+${points}`;
    const textColor = combo % 5 === 0 && combo > 1 ? '#ffd23f' : type === 'coin' ? '#ffd23f' : '#ffe9c4';
    this.texts.spawn(x, 2.1, z, label, textColor, big ? 1.25 : 1);
  }

  /** Big centre-screen announcement (region change, power-up, personal best). */
  announce(text: string, color: string) {
    const z = zToWorld(PLAYER_Z) - 5;
    this.texts.spawn(0, 3.6, z, text, color, 1.5);
    this.particles.emit(0, 3.2, z, 26, {
      color,
      speed: 7,
      spread: 1.8,
      size: 28,
      life: 1.1,
      gravity: -3,
      up: 2,
    });
    this.chase.impact(0.35);
  }

  /** Mirror the engine's own floating texts (near-miss, power-up labels). */
  private syncTexts(engine: GameEngine) {
    const list = engine.floatingTexts;
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      const key = Math.round(f.x * 7 + f.y * 13 + f.maxLife * 1000) + i * 100003;
      if (this.seenTexts.has(key)) continue;
      if (f.life < f.maxLife - 0.05) continue;
      this.seenTexts.add(key);
      // Engine texts are in screen px; place them relative to the runner.
      const rel = (f.x - engine.width / 2) / (engine.width / 2);
      this.texts.spawn(
        rel * 3.2,
        2.6 + (engine.ground - f.y) * 0.012,
        zToWorld(PLAYER_Z) - 1.5,
        f.text,
        f.color,
        f.text.length > 10 ? 1.35 : 1,
      );
    }
    if (this.seenTexts.size > 200) this.seenTexts.clear();
  }

  private syncWildlife(wildlife: Wildlife[], engine: GameEngine) {
    for (const p of this.wildlifePools.values()) p.begin();
    for (const w of wildlife) {
      if (w.z > 1.2 || w.z < -0.2) continue;
      const pool = this.poolFor(this.wildlifePools, this.wildlifeRoot, `${w.type}-${w.color}`, () => {
        const g = buildWildlife(w.type, this.quality, w.color);
        g.traverse((n) => {
          const m = n as THREE.Mesh;
          if (m.isMesh) m.castShadow = this.quality === 'high';
        });
        return g;
      });
      const g = pool.acquire(w.id);
      const flying = w.type === 'bird' || w.type === 'butterfly';
      const sideDist = flying ? 6 + w.scale * 8 : 8 + w.scale * 12;
      const x = w.side * sideDist + Math.sin(w.phase * 0.5) * (flying ? 3 : 0.6);
      const y = flying
        ? (w.type === 'bird' ? 7 + Math.sin(w.phase * 0.6) * 2.4 : 1.6 + Math.sin(w.phase) * 0.6)
        : w.type === 'fish'
          ? -0.6 + Math.sin(w.phase * 2) * 0.3
          : 0;
      g.position.set(x, y, zToWorld(w.z));
      g.scale.setScalar(w.scale * (flying ? 1.2 : 1));
      g.rotation.y = flying ? Math.PI * 0.5 * w.side + Math.sin(w.phase * 0.3) * 0.4 : w.side > 0 ? -1.2 : 1.2;
      animateWildlife(g, w.type, w.phase);
    }
    for (const p of this.wildlifePools.values()) p.end();
    void engine;
  }

  /** Reset transient visual state between runs. */
  resetForRun() {
    this.particles.clear();
    this.texts.clear();
    this.seenCollectibles.clear();
    this.seenTexts.clear();
    for (const p of this.obstaclePools.values()) p.clear();
    for (const p of this.collectiblePools.values()) p.clear();
    for (const p of this.wildlifePools.values()) p.clear();
    this.lastCombo = 0;
    this.lastShield = 0;
    this.wasAlive = true;
    this.chase.snapTo(0, 0, 0);
  }

  get info() {
    return this.renderer.info;
  }

  dispose() {
    this.particles.dispose();
    this.rain.dispose();
    this.speedLines.dispose();
    this.texts.dispose();
    this.auras.dispose();
    this.sky.dispose();
    this.env.dispose();
    this.character.dispose();
    this.renderer.dispose();
  }
}
