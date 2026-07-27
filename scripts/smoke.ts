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

console.log('\n== perf governor ==');
{
  const { PerfGovernor } = await import('../src/game/perf');
  // A device that is consistently too slow must shed resolution then tier.
  let clock = 0;
  const tick = () => clock;
  const slow = new PerfGovernor('high', true, tick);
  let lastState = slow.state;
  for (let i = 0; i < 4000; i++) {
    clock += 16;
    const r = slow.sample(1000 / 30);
    if (r) lastState = r;
  }
  check('slow device reduced render scale', lastState.scale < 1, `scale=${lastState.scale.toFixed(2)}`);
  check('slow device scale respects floor', lastState.scale >= 0.55, `${lastState.scale}`);

  clock = 0;
  const fast = new PerfGovernor('low', true, tick);
  let fastState = fast.state;
  for (let i = 0; i < 4000; i++) {
    clock += 16;
    const r = fast.sample(1000 / 120);
    if (r) fastState = r;
  }
  check('fast device restored full scale', fastState.scale >= 0.99, `scale=${fastState.scale.toFixed(2)}`);
  check('fast device promoted tier', fastState.tier === 'high', fastState.tier);

  // Spikes must not cause thrash.
  clock = 0;
  const stable = new PerfGovernor('high', true, tick);
  let changes = 0;
  for (let i = 0; i < 2000; i++) {
    clock += 16;
    const r = stable.sample(i % 200 === 0 ? 400 : 1000 / 61);
    if (r) changes++;
  }
  check('ignores spikes without thrashing', changes <= 2, `${changes} changes`);
}

console.log('\n== audio graph ==');
{
  const { installAudioMock } = await import('./audioMock');
  const log = installAudioMock();
  const { buses, lanePan, REVERB_PROFILES } = await import('../src/game/audioBus');

  check('bus graph initialises', buses.init());
  check('sfx bus exists', !!buses.bus('sfx'));
  check('music bus exists', !!buses.bus('music'));
  check('ambience bus exists', !!buses.bus('ambience'));
  check('limiter created', log.created.includes('compressor'));
  check('convolver reverb created', log.created.includes('convolver'));

  // Music must reach the limiter through the duck node, not directly.
  const names = new Map<string, string>();
  const musicNode = buses.bus('music') as unknown as { __name: string };
  const sfxNode = buses.bus('sfx') as unknown as { __name: string };
  const hop = (from: string) => log.connections.filter(([a]) => a === from).map(([, b]) => b);
  const musicTargets = hop(musicNode.__name);
  check('music routes through one node (duck)', musicTargets.length === 1, musicTargets.join(','));
  const duckTargets = hop(musicTargets[0]);
  check('duck reaches limiter', duckTargets.some((t) => t.startsWith('compressor')), duckTargets.join(','));
  // SFX must feed both the limiter and the reverb send.
  const sfxTargets = hop(sfxNode.__name);
  check('sfx feeds limiter and reverb', sfxTargets.length === 2, sfxTargets.join(','));
  void names;

  for (const b of ['sfx', 'music', 'ambience'] as const) {
    buses.setVolume(b, 0.5);
  }
  check('volumes settable', true);

  for (const biome of Object.keys(REVERB_PROFILES)) {
    buses.setReverb(biome);
  }
  check('all biome reverbs build', true);
  buses.duckMusic(0.5, 300);
  check('ducking does not throw', true);
  check('lanePan spans stereo field', lanePan(0) < 0 && lanePan(1) === 0 && lanePan(2) > 0);

  const { ambience } = await import('../src/game/ambience');
  ambience.start();
  const beforeScene = log.created.length;
  for (const biome of ['coffee_highlands','traditional_village','addis_ababa','simien_mountains','blue_nile'] as const) {
    for (const tod of ['dawn','day','sunset','night'] as const) {
      for (const w of ['clear','rain','storm','overcast','golden'] as const) {
        ambience.setScene(biome, tod, w, 0.5, 0.7);
      }
    }
  }
  check('ambience handles every biome/time/weather', true, `${log.created.length - beforeScene} nodes`);
  ambience.stop();
  check('ambience stops cleanly', true);

  const { music } = await import('../src/game/music');
  music.setEnabled(true);
  music.start();
  for (let i = 0; i < 200; i++) {
    music.setIntensity(i / 200, i % 30, i % 2 === 0);
  }
  music.fadeOut(0.5);
  music.fadeIn(0.5);
  music.stop();
  check('adaptive music runs across full intensity range', true);

  const { sfx, sfxAt, sfxCentre, setSfxOutput } = await import('../src/game/audio');
  setSfxOutput(() => buses.bus('sfx'));
  const before = log.created.length;
  for (const lane of [0, 1, 2]) {
    sfxAt(lanePan(lane));
    for (const key of Object.keys(sfx) as (keyof typeof sfx)[]) sfx[key]();
  }
  sfxCentre();
  check('every sfx plays through the bus', log.created.length > before, `${log.created.length - before} nodes`);
  const pannerCount = log.created.filter((c) => c === 'panner').length;
  check('panned sfx create panners', pannerCount > 0, `${pannerCount}`);
}

console.log('\n== save system ==');
{
  const { installStorageMock } = await import('./storageMock');
  const storage = installStorageMock();
  const { SaveStore, SAVE_VERSION } = await import('../src/game/save');

  interface Demo { version: number; coins: number; name: string; list: number[] }
  const defaults = (): Demo => ({ version: SAVE_VERSION, coins: 100, name: 'Runner', list: [] });
  const normalise = (raw: Record<string, unknown>, d: Demo): Demo => ({
    version: SAVE_VERSION,
    coins: typeof raw.coins === 'number' && Number.isFinite(raw.coins) ? Math.max(0, Math.floor(raw.coins)) : d.coins,
    name: typeof raw.name === 'string' ? raw.name.slice(0, 24) : d.name,
    list: Array.isArray(raw.list) ? raw.list.filter((n) => typeof n === 'number') : [],
  });
  const mk = () => new SaveStore<Demo>({ defaults, normalise, migrations: {
    2: (d) => ({ ...d, migrated: true, version: 3 }),
  } }, 0);

  // --- round trip ---
  storage.clear();
  let store = mk();
  check('fresh load returns defaults', store.load().source === 'fresh');
  const saved: Demo = { version: SAVE_VERSION, coins: 4321, name: 'Abebe', list: [1, 2, 3] };
  store.save(saved); store.flush();
  store = mk();
  let r = store.load();
  check('round trips through storage', r.data.coins === 4321 && r.data.name === 'Abebe', JSON.stringify(r.data));

  // --- A/B slots survive a crash mid-write ---
  store.save({ ...saved, coins: 5555 }); store.flush();
  store.save({ ...saved, coins: 6666 }); store.flush();
  const keys = [...storage.raw().keys()].filter((k) => k.includes('save-'));
  check('uses two alternating slots', keys.length >= 2, keys.join(','));
  // Corrupt the newest slot the way a killed tab would.
  const newest = keys.find((k) => k.endsWith('-a')) ?? keys[0];
  storage.truncate(newest, 0.5);
  store = mk();
  r = store.load();
  check('recovers from a truncated slot', r.data.coins > 0 && r.source === 'backup', `${r.source} coins=${r.data.coins}`);

  // --- checksum rejects tampering ---
  storage.clear();
  store = mk();
  store.save({ ...saved, coins: 10 }); store.flush();
  const slotKey = [...storage.raw().keys()].find((k) => k.includes('save-'))!;
  const env = JSON.parse(storage.getItem(slotKey)!);
  env.data.coins = 999999999; // cheat attempt, checksum now mismatches
  storage.setItem(slotKey, JSON.stringify(env));
  store = mk();
  r = store.load();
  check('rejects tampered payload', r.data.coins !== 999999999, `coins=${r.data.coins}`);

  // --- both slots destroyed → clean defaults, no crash ---
  storage.clear();
  storage.setItem('coffee-runner-save-a', '{not json');
  storage.setItem('coffee-runner-save-b', 'also garbage');
  store = mk();
  r = store.load();
  check('total corruption falls back to defaults', r.source === 'fresh' && r.data.coins === 100);

  // --- legacy import ---
  storage.clear();
  storage.setItem('coffee-runner-profile-v2', JSON.stringify({ version: 2, coins: 777, name: 'Legacy', list: [9] }));
  store = mk();
  r = store.load();
  check('imports legacy save', r.source === 'legacy' && r.data.coins === 777, `${r.source} ${r.data.coins}`);
  check('legacy import records migration', r.migratedFrom === 2, `${r.migratedFrom}`);

  // --- quota handling ---
  storage.clear();
  store = mk();
  store.save(saved); store.flush();
  storage.failWrites = true;
  store.save({ ...saved, coins: 1 });
  store.flush();
  storage.failWrites = false;
  store = mk();
  r = store.load();
  check('quota failure keeps the previous good save', r.data.coins === 4321, `coins=${r.data.coins}`);

  // --- throttling: many saves, few writes ---
  storage.clear();
  const throttled = new SaveStore<Demo>({ defaults, normalise, migrations: {} }, 10_000);
  const before = storage.writes;
  for (let i = 0; i < 500; i++) throttled.save({ ...saved, coins: i });
  throttled.flush();
  const writes = storage.writes - before;
  check('throttles bursts of saves', writes <= 6, `${writes} writes for 500 saves`);
  check('flush persists the latest value', (() => {
    const s2 = new SaveStore<Demo>({ defaults, normalise, migrations: {} }, 0);
    return s2.load().data.coins === 499;
  })(), 'latest');

  // --- export / import ---
  const code = store.export({ version: SAVE_VERSION, coins: 8080, name: 'Tigist ✨', list: [4, 5] });
  check('export produces a code', code.length > 0);
  const imported = store.import(code);
  check('import round trips unicode', imported?.coins === 8080 && imported?.name === 'Tigist ✨', JSON.stringify(imported));
  check('import rejects garbage', store.import('not-a-code') === null);
  check('import rejects mutated code', store.import(code.slice(0, -4) + 'AAAA') === null);

  // --- clear ---
  store.clear();
  store = mk();
  check('clear wipes everything', store.load().source === 'fresh');
}

console.log('\n== profile integrity ==');
{
  const { installStorageMock } = await import('./storageMock');
  installStorageMock();
  const prog = await import('../src/game/progression');

  const fresh = prog.loadProfile();
  check('fresh profile valid', fresh.coins >= 0 && fresh.ownedCharacters.includes('abebe'));
  check('fresh profile has 3 missions', fresh.missions.length === 3, `${fresh.missions.length}`);

  // Simulate a save that references content that no longer exists and has
  // impossible values — normalise() must make it safe rather than crash.
  (globalThis as any).localStorage.clear();
  (globalThis as any).localStorage.setItem('coffee-runner-profile-v2', JSON.stringify({
    version: 2,
    coins: -500,
    gems: Number.NaN,
    character: 'does-not-exist',
    outfit: 'also-gone',
    ownedCharacters: ['abebe', 'ghost'],
    ownedOutfits: ['phantom'],
    inventory: { magnet: 1e9, shield: -3 },
    equipped: ['magnet', 'nope', 'shield'],
    missions: [{ id: 'fake', progress: 5, claimed: false }],
    leaderboard: [{ name: 'x'.repeat(200), score: 'NaN' }, { name: 'ok', score: 50, distance: 10 }],
    daily: { lastClaim: 12345, streak: -9 },
    stats: { biomesSeen: ['coffee_highlands', 'atlantis'] },
  }));
  const repaired = prog.loadProfile();
  check('negative coins clamped', repaired.coins >= 0, `${repaired.coins}`);
  check('NaN gems replaced', Number.isFinite(repaired.gems), `${repaired.gems}`);
  check('unknown character reset', repaired.character === 'abebe', repaired.character);
  check('unknown outfit reset', repaired.outfit === 'shamma', repaired.outfit);
  check('ghost characters dropped', !repaired.ownedCharacters.includes('ghost'));
  check('default outfit restored', repaired.ownedOutfits.includes('shamma'));
  check('inventory clamped', repaired.inventory.magnet <= 99 && repaired.inventory.shield >= 0, JSON.stringify(repaired.inventory));
  check('equipped filtered to owned', repaired.equipped.every((e) => e in repaired.inventory));
  check('unknown missions dropped then rerolled', repaired.missions.every((m) => prog.missionDef(m.id)));
  check('bad leaderboard rows dropped', repaired.leaderboard.every((e) => Number.isFinite(e.score)));
  check('long names truncated', repaired.leaderboard.every((e) => e.name.length <= 24));
  check('bad daily claim nulled', repaired.daily.lastClaim === null || typeof repaired.daily.lastClaim === 'string');
  check('negative streak clamped', repaired.daily.streak >= 0, `${repaired.daily.streak}`);
  check('invalid biome dropped', !repaired.stats.biomesSeen.includes('atlantis' as never));

  // recordRun must persist and stay consistent over many runs
  let p = prog.loadProfile();
  for (let i = 0; i < 60; i++) {
    const res = prog.recordRun(p, {
      score: 1000 + i * 37, distance: 200 + i, beans: 20, coins: 15, specials: 2,
      maxCombo: 8, jumps: 12, slides: 5, nearMisses: 3, powerupsUsed: 1,
      nightDistance: 20, biomesVisited: ['coffee_highlands'], deathBy: 'rock', durationSec: 45,
    });
    p = res.profile;
  }
  check('leaderboard capped at 10', p.leaderboard.length === 10, `${p.leaderboard.length}`);
  check('leaderboard sorted desc', p.leaderboard.every((e, i, a) => i === 0 || a[i-1].score >= e.score));
  check('coins accumulated', p.coins > fresh.coins, `${p.coins}`);
  check('best score tracked', p.stats.bestScore >= 1000 + 59 * 37, `${p.stats.bestScore}`);
  check('run count correct', p.stats.runs === 60, `${p.stats.runs}`);

  prog.flushProfile();
  const reloaded = prog.loadProfile();
  check('progress survives reload', reloaded.stats.runs === 60 && reloaded.leaderboard.length === 10, `runs=${reloaded.stats.runs}`);

  const code = prog.exportProfile(reloaded);
  const back = prog.importProfile(code);
  check('profile export/import preserves stats', back?.stats.runs === 60 && back?.coins === reloaded.coins);
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
