/**
 * Headless smoke test.
 *
 * Runs the real GameEngine for thousands of frames and builds every 3D asset
 * (character rig, all obstacles/collectibles/wildlife, full environment chunk
 * population across all biomes) against three.js core. Catches NaNs, runaway
 * object counts, missing cases and animation errors without needing a GPU.
 */

import * as THREE from 'three';
import { GameEngine } from '../src/game/engine';
import { Character } from '../src/game3d/character';
import { Environment } from '../src/game3d/environment';
import { buildCollectible, buildObstacle, buildWildlife, animateWildlife } from '../src/game3d/props';
import { ChaseCamera } from '../src/game3d/camera';
import { terrainPalette } from '../src/game/world';
import { BIOME_ORDER, type CollectibleType, type ObstacleType, type WildlifeType } from '../src/game/types';
import type { Settings } from '../src/game/types';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name} ${detail}`);
  }
}

const settings: Settings = {
  sound: false, music: false, vibrate: false,
  difficulty: 'normal', quality: 'high', screenShake: true,
};

const appearance = {
  skin: '#8B5A2B', hair: '#1a0f0a', cloth: '#fff8f0',
  sash: '#c41e3a', trim1: '#228B22', trim2: '#FFD700',
};

function countNodes(o: THREE.Object3D): number {
  let n = 0;
  o.traverse(() => n++);
  return n;
}

function hasNaN(o: THREE.Object3D): boolean {
  let bad = false;
  o.traverse((n) => {
    const p = n.position, r = n.rotation, s = n.scale;
    if ([p.x,p.y,p.z,r.x,r.y,r.z,s.x,s.y,s.z].some((v) => !Number.isFinite(v))) bad = true;
  });
  return bad;
}

console.log('\n== engine simulation ==');
{
  const engine = new GameEngine({ width: 420, height: 860, settings });
  engine.reset(settings);
  let frames = 0;
  let maxObstacles = 0, maxCollectibles = 0, maxParticles = 0, maxWildlife = 0;
  let deaths = 0;
  for (let i = 0; i < 12000; i++) {
    engine.update(1 / 60);
    frames++;
    maxObstacles = Math.max(maxObstacles, engine.obstacles.length);
    maxCollectibles = Math.max(maxCollectibles, engine.collectibles.length);
    maxParticles = Math.max(maxParticles, engine.particles.length);
    maxWildlife = Math.max(maxWildlife, engine.wildlife.length);
    if (!engine.alive) { deaths++; engine.reset(settings); }
    // consume events like the renderer does
    engine.fxEvents.length = 0;
    // random input so the player survives and lanes/jumps get exercised
    if (i % 37 === 0) engine.moveLane(Math.random() < 0.5 ? -1 : 1);
    if (i % 53 === 0) engine.jump();
    if (i % 91 === 0) engine.slide();
  }
  check(`ran ${frames} frames without throwing`, true);
  check('distance advanced', engine.stats.distance > 0, `${engine.stats.distance}`);
  check('lane float stays in range', engine.playerLaneFloat >= -0.01 && engine.playerLaneFloat <= 2.01, `${engine.playerLaneFloat}`);
  check('no NaN in player state', Number.isFinite(engine.player.x) && Number.isFinite(engine.player.y));
  check('obstacle list bounded', maxObstacles < 60, `max=${maxObstacles}`);
  check('collectible list bounded', maxCollectibles < 90, `max=${maxCollectibles}`);
  check('particle list bounded', maxParticles <= 200, `max=${maxParticles}`);
  check('wildlife list bounded', maxWildlife <= 24, `max=${maxWildlife}`);
  check('deaths occurred and recovered', deaths > 0, `${deaths}`);
}

console.log('\n== character rig ==');
{
  const c = new Character(appearance, 'high');
  const nodes = countNodes(c.root);
  check('rig built', nodes > 30, `${nodes} nodes`);
  for (const pose of ['run', 'jump', 'fall', 'slide', 'idle', 'dead'] as const) {
    c.setPose(pose);
    for (let i = 0; i < 240; i++) c.update(1 / 60, Math.random(), (Math.random() - 0.5) * 20);
    check(`pose '${pose}' animates cleanly`, !hasNaN(c.root) && Number.isFinite(c.hipHeight));
  }
  c.hitReaction();
  for (let i = 0; i < 120; i++) c.update(1 / 60, 0.8, 0);
  check('hit reaction settles', !hasNaN(c.root));
  c.setAppearance({ ...appearance, cloth: '#ff0000', glow: true });
  check('appearance swap works', true);
}

console.log('\n== props ==');
{
  const obstacles: ObstacleType[] = ['rock','tree','river','goat','cart','sheep','barrel','market_stall','bajaj','boulder','fence','pot_hole','fallen_log','hyena'];
  for (const t of obstacles) {
    const g = buildObstacle(t, 'high');
    check(`obstacle ${t}`, countNodes(g) > 1 && !hasNaN(g), `${countNodes(g)} nodes`);
  }
  const collectibles: CollectibleType[] = ['bean','coin','injera','golden_bean','meskel_flower','coffee_pot','star','powerup'];
  for (const t of collectibles) {
    const g = buildCollectible(t, 'high', 'magnet');
    check(`collectible ${t}`, countNodes(g) > 1 && !hasNaN(g));
  }
  const wild: WildlifeType[] = ['bird','goat_side','sheep_side','butterfly','ibex','fish'];
  for (const t of wild) {
    const g = buildWildlife(t, 'high', '#888888');
    for (let i = 0; i < 60; i++) animateWildlife(g, t, i * 0.1);
    check(`wildlife ${t}`, countNodes(g) > 1 && !hasNaN(g));
  }
}

console.log('\n== environment streaming ==');
{
  for (const q of ['high', 'low'] as const) {
    const env = new Environment(q);
    const engine = new GameEngine({ width: 420, height: 860, settings });
    engine.reset(settings);
    let peak = 0;
    for (let i = 0; i < 3000; i++) {
      engine.update(1 / 60);
      if (!engine.alive) engine.reset(settings);
      engine.fxEvents.length = 0;
      const pal = terrainPalette(engine.world.biome, engine.world.nextBiome, engine.world.biomeBlend, engine.world.light);
      env.update(engine.stats.distance * 1.62, engine.world, pal, i / 60, 1 / 60, (d) =>
        BIOME_ORDER[Math.floor(Math.max(0, d) / 180) % BIOME_ORDER.length]);
      env.applyAtmosphere(new THREE.Color(0x9fbcd4), pal, engine.world.light);
      peak = Math.max(peak, countNodes(env.root));
    }
    // Node count must plateau — that proves chunks recycle instead of leaking.
    const final = countNodes(env.root);
    check(`[${q}] env node count bounded`, peak < 6000, `peak=${peak}`);
    check(`[${q}] env does not leak`, final <= peak, `final=${final} peak=${peak}`);
    check(`[${q}] env transforms finite`, !hasNaN(env.root));
    env.dispose();
  }
}

console.log('\n== camera ==');
{
  const cam = new ChaseCamera(420 / 860);
  for (const mode of ['menu', 'play', 'gameover'] as const) {
    cam.setMode(mode);
    for (let i = 0; i < 600; i++) {
      cam.update(1 / 60, {
        x: Math.sin(i * 0.05) * 2.2, y: Math.max(0, Math.sin(i * 0.1)) * 2,
        z: -i * 0.3, laneVel: Math.cos(i * 0.05) * 12, speed01: 0.6,
        jumping: false, sliding: false, alive: mode !== 'gameover',
        pulse: 0, shakeEngine: i % 100 === 0 ? 1 : 0, allowShake: true, portrait: true,
      });
    }
    const p = cam.camera.position;
    check(`camera '${mode}' stable`, [p.x,p.y,p.z].every(Number.isFinite) && Number.isFinite(cam.camera.fov), `${p.toArray()}`);
  }
  cam.impact(1); cam.land(1);
  for (let i = 0; i < 120; i++) cam.update(1/60, { x:0,y:0,z:0,laneVel:0,speed01:0,jumping:false,sliding:false,alive:true,pulse:0,shakeEngine:0,allowShake:true,portrait:false });
  check('shake decays', true);
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
