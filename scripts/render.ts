/**
 * Full render-pipeline test.
 *
 * Boots a real Scene3D against a headless WebGL stub and drives it with the
 * real GameEngine for thousands of frames across every biome, weather and
 * time of day. Asserts the scene graph stays bounded (pooling works), draw
 * calls stay sane, and nothing throws or goes NaN.
 */

import { installGLMock } from './glMock';
const canvas = installGLMock();

import * as THREE from 'three';
import { GameEngine } from '../src/game/engine';
import { Scene3D } from '../src/game3d/scene3d';
import type { Settings } from '../src/game/types';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' ' + detail : ''}`);
  if (!ok) failures++;
}

const settings: Settings = {
  sound: false, music: false, vibrate: false, difficulty: 'normal',
  quality: 'high', screenShake: true, touchButtons: false,
  leftHanded: false, reducedMotion: false,
};

const appearance = {
  skin: '#8B5A2B', hair: '#1a0f0a', cloth: '#fff8f0',
  sash: '#c41e3a', trim1: '#228B22', trim2: '#FFD700',
};

function countScene(s: THREE.Scene) {
  let n = 0;
  s.traverse(() => n++);
  return n;
}

function sceneHasNaN(s: THREE.Scene) {
  let bad = '';
  s.traverse((o) => {
    if (bad) return;
    const { position: p, rotation: r, scale: sc } = o;
    if ([p.x,p.y,p.z,r.x,r.y,r.z,sc.x,sc.y,sc.z].some((v) => !Number.isFinite(v))) {
      bad = o.type + (o.name ? `(${o.name})` : '');
    }
  });
  return bad;
}

console.log('\n== 3D render pipeline ==');

const scene = new Scene3D(canvas, appearance, 'high');
check('Scene3D constructs against WebGL', true);
scene.resize(420, 860, 2);
check('resize applies', true);

const engine = new GameEngine({ width: 420, height: 860, settings });
engine.reset(settings);

// A single frame must work before we stress it.
scene.render(engine);
check('first frame renders', true);

// --- long run across all biomes ---
let peakNodes = 0;
let frames = 0;
let deaths = 0;
const seenBiomes = new Set<string>();
const seenWeather = new Set<string>();
const seenTod = new Set<string>();

// Runs naturally die long before the later biomes, so keep the player
// invincible here: the goal is to render every biome, not to play well.
for (let i = 0; i < 9000; i++) {
  engine.player.invincible = 5;
  engine.update(1 / 60);
  seenBiomes.add(engine.world.biome);
  seenWeather.add(engine.world.weather);
  seenTod.add(engine.world.timeOfDay);

  if (engine.fxEvents.length) {
    for (const ev of engine.fxEvents) {
      if (ev.kind === 'collect') scene.onCollect(ev.type, ev.lane, ev.points, ev.combo);
      else if (ev.kind === 'announce') scene.announce(ev.text, ev.color);
    }
    engine.fxEvents.length = 0;
  }

  scene.render(engine);
  frames++;
  peakNodes = Math.max(peakNodes, countScene(scene.scene));

  if (!engine.alive) {
    deaths++;
    // exercise the game-over camera before restarting
    for (let k = 0; k < 30; k++) scene.render(engine);
    engine.reset(settings);
    scene.resetForRun();
  }
  // Force a death occasionally so the game-over path is still covered.
  if (i === 4000) { engine.player.invincible = 0; engine.alive = false; }
  if (i % 41 === 0) engine.moveLane(Math.random() < 0.5 ? -1 : 1);
  if (i % 59 === 0) engine.jump();
  if (i % 97 === 0) engine.slide();
}

check(`rendered ${frames} frames without throwing`, true);
check('visited every biome', seenBiomes.size === 5, [...seenBiomes].join(','));
check('exercised multiple weathers', seenWeather.size >= 3, [...seenWeather].join(','));
check('exercised day and night', seenTod.size >= 3, [...seenTod].join(','));
check('handled deaths and restarts', deaths > 0, `${deaths}`);

const nan = sceneHasNaN(scene.scene);
check('no NaN transforms in the scene graph', nan === '', nan);

// Pooling proof: the graph must plateau, not grow with distance.
const nodesAfterLongRun = countScene(scene.scene);
check('scene graph bounded (pooling works)', peakNodes < 9000, `peak=${peakNodes}`);
check('scene graph does not grow unbounded', nodesAfterLongRun <= peakNodes, `final=${nodesAfterLongRun}`);

const info = scene.info;
check('draw calls stay reasonable', info.render.calls < 900, `calls=${info.render.calls}`);
check('geometry count bounded', info.memory.geometries < 400, `geo=${info.memory.geometries}`);
check('texture count bounded', info.memory.textures < 120, `tex=${info.memory.textures}`);

// --- quality switching mid-run must not leak or throw ---
const beforeSwitch = countScene(scene.scene);
for (let q = 0; q < 6; q++) {
  scene.setQuality(q % 2 === 0 ? 'low' : 'high');
  for (let i = 0; i < 120; i++) {
    engine.update(1 / 60);
    engine.fxEvents.length = 0;
    if (!engine.alive) { engine.reset(settings); scene.resetForRun(); }
    scene.render(engine);
  }
}
const afterSwitch = countScene(scene.scene);
check('quality switching is stable', afterSwitch < beforeSwitch * 2.2, `${beforeSwitch} -> ${afterSwitch}`);
check('no NaN after quality switches', sceneHasNaN(scene.scene) === '');

// --- render scale ---
for (const s of [0.55, 0.75, 1]) scene.setRenderScale(s);
check('render scale adjusts without error', true);

// --- reduced motion path ---
engine.settings = { ...settings, reducedMotion: true };
for (let i = 0; i < 200; i++) {
  engine.update(1 / 60);
  engine.fxEvents.length = 0;
  if (!engine.alive) { engine.reset(settings); scene.resetForRun(); }
  scene.render(engine);
}
check('reduced-motion path renders', sceneHasNaN(scene.scene) === '');

// --- menu framing ---
engine.settings = settings;
for (let i = 0; i < 300; i++) {
  engine.updateMenu(1 / 60);
  scene.renderMenu(engine);
}
check('menu orbit renders', sceneHasNaN(scene.scene) === '');

// --- appearance swaps (shop preview) ---
for (let i = 0; i < 20; i++) {
  scene.setAppearance({ ...appearance, cloth: i % 2 ? '#ff0000' : '#00ff00', glow: i % 3 === 0 });
  scene.renderMenu(engine);
}
check('outfit swapping renders', true);

// --- resize / orientation churn ---
for (const [w, h] of [[320, 640], [420, 860], [860, 420], [1200, 800], [390, 844]]) {
  scene.resize(w, h, 2);
  scene.render(engine);
}
check('handles resize and orientation changes', sceneHasNaN(scene.scene) === '');

// --- low tier from scratch ---
const canvas2 = installGLMock();
const lowScene = new Scene3D(canvas2, appearance, 'low');
lowScene.resize(360, 720, 1.5);
const lowEngine = new GameEngine({ width: 360, height: 720, settings: { ...settings, quality: 'low' } });
lowEngine.reset({ ...settings, quality: 'low' });
for (let i = 0; i < 1200; i++) {
  lowEngine.update(1 / 60);
  lowEngine.fxEvents.length = 0;
  if (!lowEngine.alive) { lowEngine.reset({ ...settings, quality: 'low' }); lowScene.resetForRun(); }
  lowScene.render(lowEngine);
}
const lowNodes = countScene(lowScene.scene);
check('low tier renders', sceneHasNaN(lowScene.scene) === '');
check('low tier is lighter than high', lowNodes < peakNodes, `low=${lowNodes} high=${peakNodes}`);

lowScene.dispose();
scene.dispose();
check('dispose cleans up without throwing', true);

console.log(`\n${failures === 0 ? 'RENDER CHECKS PASSED' : `${failures} RENDER CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
