import type {
  Appearance,
  Biome,
  CharacterPerk,
  Collectible,
  CollectibleType,
  Effects,
  FloatingText,
  GameStats,
  Lane,
  Obstacle,
  ObstacleType,
  Particle,
  ParticleType,
  Player,
  PowerUpId,
  RunCounters,
  Settings,
  Wildlife,
  WildlifeType,
  WorldState,
} from './types';
import { sfx } from './audio';
import { createWorldState, updateWorld } from './world';

const LANES = 3;
const LANE_WIDTH = 90;
const ROAD_CENTER = 0;

let nextId = 1;
const uid = () => nextId++;

export const POWERUP_DURATION: Record<PowerUpId, number> = {
  magnet: 15,
  shield: 0,
  double: 20,
  superJump: 20,
  slow: 6,
};

/** How many meters of track are visible ahead (z: 1 → 0) */
export const VISIBLE_AHEAD_M = 10.5;

export interface EngineConfig {
  width: number;
  height: number;
  settings: Settings;
}

export interface EngineSnapshot {
  player: Player;
  obstacles: Obstacle[];
  collectibles: Collectible[];
  particles: Particle[];
  floatingTexts: FloatingText[];
  wildlife: Wildlife[];
  stats: GameStats;
  speed: number;
  shake: number;
  alive: boolean;
  time: number;
  bgOffset: number;
  nearMissFlash: number;
  world: WorldState;
  effects: Effects;
  counters: RunCounters;
  biomesVisited: Biome[];
  pbDistance: number;
  pbReached: boolean;
}

function difficultyMult(d: Settings['difficulty']): number {
  if (d === 'easy') return 0.85;
  if (d === 'hard') return 1.2;
  return 1;
}

const OBSTACLE_SIZES: Record<ObstacleType, { w: number; h: number }> = {
  rock: { w: 48, h: 36 },
  tree: { w: 40, h: 70 },
  river: { w: 70, h: 28 },
  goat: { w: 46, h: 40 },
  cart: { w: 56, h: 44 },
  sheep: { w: 44, h: 36 },
  barrel: { w: 36, h: 42 },
  market_stall: { w: 60, h: 55 },
  bajaj: { w: 58, h: 48 },
  boulder: { w: 64, h: 50 },
  fence: { w: 70, h: 32 },
  pot_hole: { w: 50, h: 18 },
  fallen_log: { w: 70, h: 28 },
  hyena: { w: 50, h: 38 },
};

const JUMPABLE: Set<ObstacleType> = new Set([
  'rock', 'river', 'goat', 'sheep', 'cart', 'barrel', 'fence', 'pot_hole', 'fallen_log', 'hyena', 'bajaj',
]);

const SLIDABLE: Set<ObstacleType> = new Set(['tree', 'cart', 'market_stall', 'bajaj', 'barrel']);

const DEFAULT_APPEARANCE: Appearance = {
  skin: '#8B5A2B',
  hair: '#1a0f0a',
  cloth: '#fff8f0',
  sash: '#c41e3a',
  trim1: '#228B22',
  trim2: '#FFD700',
};

export class GameEngine {
  width: number;
  height: number;
  settings: Settings;

  player: Player;
  obstacles: Obstacle[] = [];
  collectibles: Collectible[] = [];
  particles: Particle[] = [];
  floatingTexts: FloatingText[] = [];
  wildlife: Wildlife[] = [];
  stats: GameStats;
  world: WorldState;
  effects: Effects;
  counters: RunCounters;
  appearance: Appearance = { ...DEFAULT_APPEARANCE };
  perk: CharacterPerk | null = null;

  speed = 0;
  baseSpeed = 280;
  shake = 0;
  cameraPulse = 0;
  alive = true;
  time = 0;
  runTime = 0;
  bgOffset = 0;
  spawnTimer = 0;
  collectTimer = 0;
  wildlifeTimer = 0;
  weatherParticleTimer = 0;
  ambientParticleTimer = 0;
  nearMissFlash = 0;
  comboTimer = 0;
  regionAnnounce = 0;
  deathBy: ObstacleType | null = null;
  pbDistance = 0;
  pbReached = false;

  private laneXs: number[] = [];
  private horizon = 0;
  private groundY = 0;
  private lastBiome: Biome = 'coffee_highlands';
  private biomesVisited: Set<Biome> = new Set();

  constructor(cfg: EngineConfig) {
    this.width = cfg.width;
    this.height = cfg.height;
    this.settings = cfg.settings;
    this.horizon = this.height * 0.32;
    this.groundY = this.height * 0.78;
    this.laneXs = this.computeLaneXs();
    this.player = this.createPlayer();
    this.stats = this.emptyStats();
    this.effects = this.emptyEffects();
    this.counters = this.emptyCounters();
    this.world = createWorldState();
    this.resetSpeed();
  }

  private emptyStats(): GameStats {
    return { score: 0, distance: 0, beans: 0, coins: 0, combo: 0, maxCombo: 0, specials: 0 };
  }

  private emptyEffects(): Effects {
    return { magnet: 0, shield: 0, double: 0, superJump: 0, slow: 0 };
  }

  private emptyCounters(): RunCounters {
    return { jumps: 0, slides: 0, nearMisses: 0, powerupsUsed: 0, nightDistance: 0 };
  }

  private computeLaneXs(): number[] {
    const cx = this.width / 2 + ROAD_CENTER;
    const w = Math.min(LANE_WIDTH, this.width * 0.22);
    return [-w, 0, w].map((o) => cx + o);
  }

  private createPlayer(): Player {
    return {
      lane: 1,
      targetLane: 1,
      x: this.laneXs[1],
      y: this.groundY,
      vy: 0,
      jumping: false,
      sliding: false,
      slideTimer: 0,
      invincible: 0,
      animTime: 0,
      runFrame: 0,
    };
  }

  private resetSpeed() {
    const m = difficultyMult(this.settings.difficulty);
    this.baseSpeed = 260 * m;
    this.speed = this.baseSpeed;
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.horizon = height * 0.32;
    this.groundY = height * 0.78;
    this.laneXs = this.computeLaneXs();
    this.player.x = this.laneXs[this.player.targetLane];
    if (!this.player.jumping) this.player.y = this.groundY;
  }

  setAppearance(a: Appearance) {
    this.appearance = a;
  }

  reset(
    settings?: Settings,
    boosters: PowerUpId[] = [],
    perk: CharacterPerk | null = null,
    pbDistance = 0,
  ) {
    if (settings) this.settings = settings;
    this.perk = perk;
    this.pbDistance = pbDistance;
    this.pbReached = false;
    this.obstacles = [];
    this.collectibles = [];
    this.particles = [];
    this.floatingTexts = [];
    this.wildlife = [];
    this.stats = this.emptyStats();
    this.effects = this.emptyEffects();
    this.counters = this.emptyCounters();
    this.player = this.createPlayer();
    this.world = createWorldState();
    this.biomesVisited = new Set([this.world.biome]);
    this.alive = true;
    this.time = 0;
    this.runTime = 0;
    this.bgOffset = 0;
    this.spawnTimer = 0.9;
    this.collectTimer = 0.55;
    this.wildlifeTimer = 0.3;
    this.weatherParticleTimer = 0;
    this.ambientParticleTimer = 0;
    this.shake = 0;
    this.cameraPulse = 0;
    this.nearMissFlash = 0;
    this.comboTimer = 0;
    this.regionAnnounce = 2.5;
    this.lastBiome = this.world.biome;
    this.deathBy = null;
    this.resetSpeed();
    nextId = 1;
    this.seedIntro();
    this.seedWildlife();

    // start boosters
    for (const b of boosters) {
      this.activateEffect(b, true);
    }
  }

  private seedIntro() {
    const pattern: Lane[] = [1, 1, 0, 0, 1, 2, 2, 1];
    pattern.forEach((lane, i) => {
      this.collectibles.push({
        id: uid(),
        type: i === 5 ? 'coin' : i === 7 ? 'meskel_flower' : 'bean',
        lane,
        z: 0.55 + i * 0.08,
        collected: false,
        bobPhase: i * 0.7,
        value: i === 5 ? 25 : i === 7 ? 30 : 10,
        spin: 0,
      });
    });
    this.obstacles.push({
      id: uid(),
      type: 'rock',
      lane: 1,
      z: 0.92,
      width: 48,
      height: 36,
      hit: false,
      anim: 0,
    });
  }

  private seedWildlife() {
    for (let i = 0; i < 6; i++) this.spawnWildlife(true);
  }

  getLaneX(lane: Lane): number {
    return this.laneXs[lane];
  }

  moveLane(dir: -1 | 1) {
    if (!this.alive) return;
    const next = (this.player.targetLane + dir) as number;
    if (next < 0 || next >= LANES) return;
    this.player.targetLane = next as Lane;
    sfx.lane();
    this.burst(this.player.x, this.player.y, '#d4b896', 3, 'dust');
  }

  jump() {
    if (!this.alive || this.player.jumping || this.player.sliding) return;
    this.player.jumping = true;
    const superJump = this.effects.superJump > 0;
    this.player.vy = superJump ? -940 : -720;
    this.counters.jumps += 1;
    sfx.jump();
    this.burst(this.player.x, this.player.y - 10, '#f5e6c8', 6, 'circle');
    this.burst(this.player.x, this.player.y, superJump ? '#5ad46a' : '#c4a574', 4, 'dust');
  }

  slide() {
    if (!this.alive || this.player.jumping || this.player.sliding) return;
    this.player.sliding = true;
    this.player.slideTimer = 0.55;
    this.counters.slides += 1;
    sfx.slide();
    this.burst(this.player.x, this.player.y, '#c4a574', 6, 'dust');
    this.burst(this.player.x, this.player.y, '#8a6a40', 3, 'leaf');
  }

  private burst(
    x: number,
    y: number,
    color: string,
    count: number,
    type: ParticleType = 'circle',
    extras?: Partial<Particle>,
  ) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 160;
      const gravity =
        type === 'rain' ? 600 : type === 'glow' || type === 'ember' ? 40 : type === 'petal' ? 60 : 280;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * sp * (type === 'dust' ? 0.5 : 1),
        vy: Math.sin(angle) * sp - (type === 'ember' ? 80 : 40),
        life: 0.35 + Math.random() * 0.5,
        maxLife: 0.85,
        size: 2 + Math.random() * (type === 'glow' ? 8 : 5),
        color,
        gravity,
        type,
        rotation: Math.random() * Math.PI,
        rotSpeed: (Math.random() - 0.5) * 10,
        ...extras,
      });
    }
  }

  private floatText(x: number, y: number, text: string, color: string) {
    this.floatingTexts.push({ x, y, text, life: 0.95, maxLife: 0.95, color, vy: -60 });
  }

  private obstaclesForBiome(biome: Biome): ObstacleType[] {
    switch (biome) {
      case 'addis_ababa':
        return ['bajaj', 'pot_hole', 'barrel', 'cart', 'market_stall', 'rock', 'fence'];
      case 'simien_mountains':
        return ['boulder', 'rock', 'fallen_log', 'goat', 'sheep', 'fence', 'tree', 'hyena'];
      case 'blue_nile':
        return ['river', 'fallen_log', 'rock', 'tree', 'goat', 'barrel', 'fence'];
      case 'traditional_village':
        return ['goat', 'sheep', 'cart', 'market_stall', 'barrel', 'fence', 'tree', 'rock'];
      case 'coffee_highlands':
      default:
        return ['rock', 'tree', 'goat', 'cart', 'river', 'barrel', 'sheep', 'fallen_log'];
    }
  }

  private spawnObstacle() {
    const biome = this.world.biomeBlend > 0.5 ? this.world.nextBiome : this.world.biome;
    const pool = this.obstaclesForBiome(biome);
    const type = pool[Math.floor(Math.random() * pool.length)];

    const lane = Math.floor(Math.random() * LANES) as Lane;
    const multi =
      (type === 'river' && Math.random() < 0.4) ||
      (type === 'fence' && Math.random() < 0.25) ||
      (type === 'fallen_log' && Math.random() < 0.2);

    const size = OBSTACLE_SIZES[type];
    this.obstacles.push({
      id: uid(),
      type,
      lane: multi ? 1 : lane,
      z: 1.05,
      width: multi ? size.w * 2.8 : size.w,
      height: size.h,
      hit: false,
      multiLane: multi,
      goatDir: Math.random() < 0.5 ? -1 : 1,
      goatPhase: Math.random() * Math.PI * 2,
      anim: Math.random() * Math.PI * 2,
    });
  }

  private collectiblesForBiome(biome: Biome): CollectibleType[] {
    switch (biome) {
      case 'addis_ababa':
        return ['coin', 'coin', 'bean', 'injera', 'star'];
      case 'simien_mountains':
        return ['bean', 'meskel_flower', 'coin', 'golden_bean', 'star'];
      case 'blue_nile':
        return ['bean', 'coin', 'coffee_pot', 'meskel_flower', 'injera'];
      case 'traditional_village':
        return ['bean', 'injera', 'coffee_pot', 'coin', 'meskel_flower'];
      case 'coffee_highlands':
      default:
        return ['bean', 'bean', 'bean', 'coin', 'golden_bean', 'coffee_pot'];
    }
  }

  private collectibleValue(type: CollectibleType): number {
    switch (type) {
      case 'bean': return 10;
      case 'coin': return 25;
      case 'injera': return 35;
      case 'meskel_flower': return 40;
      case 'coffee_pot': return 50;
      case 'golden_bean': return 75;
      case 'star': return 100;
      default: return 0;
    }
  }

  private spawnCollectible() {
    const biome = this.world.biome;
    const lane = Math.floor(Math.random() * LANES) as Lane;
    const blocked = this.obstacles.some(
      (o) => o.z > 0.85 && (o.lane === lane || o.multiLane) && o.z < 1.05,
    );
    if (blocked) return;

    const early = this.stats.distance < 40;

    // power-up orb spawn
    if (!early && Math.random() < 0.05) {
      const ids: PowerUpId[] = ['magnet', 'shield', 'double', 'superJump', 'slow'];
      this.collectibles.push({
        id: uid(),
        type: 'powerup',
        lane,
        z: 1.02,
        collected: false,
        bobPhase: Math.random() * Math.PI * 2,
        value: 0,
        spin: 0,
        powerup: ids[Math.floor(Math.random() * ids.length)],
      });
      return;
    }

    let type: CollectibleType;
    if (early) {
      type = Math.random() < 0.1 ? 'coin' : 'bean';
    } else {
      const pool = this.collectiblesForBiome(biome);
      if (Math.random() < 0.04) type = 'golden_bean';
      else if (Math.random() < 0.025) type = 'star';
      else type = pool[Math.floor(Math.random() * pool.length)];
    }

    this.collectibles.push({
      id: uid(),
      type,
      lane: early ? ((Math.floor(this.stats.distance / 8) % 3) as Lane) : lane,
      z: 1.02,
      collected: false,
      bobPhase: Math.random() * Math.PI * 2,
      value: this.collectibleValue(type),
      spin: 0,
    });
  }

  activateEffect(id: PowerUpId, fromStart = false) {
    const mult = this.perk === 'powerup_boost' ? 1.4 : 1;
    if (id === 'shield') {
      this.effects.shield = Math.min(2, this.effects.shield + 1);
    } else {
      this.effects[id] = POWERUP_DURATION[id] * mult;
    }
    this.counters.powerupsUsed += 1;

    if (!fromStart) {
      sfx.powerup();
      this.shake = Math.max(this.shake, 0.2);
      this.cameraPulse = 1;
    }
    const labels: Record<PowerUpId, string> = {
      magnet: 'MAGNET!',
      shield: 'SHIELD UP!',
      double: 'DOUBLE BEANS!',
      superJump: 'SUPER JUMP!',
      slow: 'TIME SLOW!',
    };
    const colors: Record<PowerUpId, string> = {
      magnet: '#ff5a4a',
      shield: '#5aa8ff',
      double: '#ffd700',
      superJump: '#5ad46a',
      slow: '#b07aff',
    };
    this.floatText(this.player.x, this.player.y - 90, labels[id], colors[id]);
    this.burst(this.player.x, this.player.y - 40, colors[id], 14, 'star');
    this.burst(this.player.x, this.player.y - 40, colors[id], 8, 'glow');
  }

  private spawnWildlife(force = false) {
    if (!force && this.wildlife.length > 18) return;
    const biome = this.world.biome;
    const tod = this.world.timeOfDay;

    const pool: WildlifeType[] = ['bird', 'butterfly'];
    if (biome === 'simien_mountains') pool.push('ibex', 'goat_side', 'bird');
    if (biome === 'blue_nile') pool.push('fish', 'bird', 'butterfly');
    if (biome === 'traditional_village' || biome === 'coffee_highlands') {
      pool.push('goat_side', 'sheep_side', 'butterfly');
    }
    if (biome === 'addis_ababa') pool.push('bird', 'bird');
    if (tod === 'night') {
      pool.length = 0;
      pool.push('bird', 'goat_side');
      if (biome === 'simien_mountains') pool.push('ibex');
    }

    const type = pool[Math.floor(Math.random() * pool.length)];
    const side = Math.random() < 0.5 ? -1 : 1;
    const z = force ? Math.random() * 0.9 + 0.05 : 0.95 + Math.random() * 0.1;

    const colors: Record<WildlifeType, string[]> = {
      bird: ['#2a2a2a', '#4a3728', '#c45c26', '#e8e0d0'],
      goat_side: ['#e8e0d5', '#c4b8a8', '#8a7a6a'],
      sheep_side: ['#f5f0e8', '#e0d8d0', '#d0c8b8'],
      butterfly: ['#e07020', '#c41e3a', '#f0d040', '#40a060', '#8060c0'],
      ibex: ['#8a7060', '#6a5040', '#a08870'],
      fish: ['#3a8ab0', '#e07040', '#d0a040'],
    };
    const palette = colors[type];

    this.wildlife.push({
      id: uid(),
      type,
      x: 0,
      y: 0,
      z,
      vx: type === 'bird' ? (0.8 + Math.random()) * side * -0.15 : type === 'butterfly' ? side * 0.08 : 0,
      vy: 0,
      side,
      phase: Math.random() * Math.PI * 2,
      scale: 0.6 + Math.random() * 0.5,
      color: palette[Math.floor(Math.random() * palette.length)],
    });
  }

  private project(z: number, laneX: number): { x: number; y: number; scale: number } {
    const t = Math.max(0, Math.min(1, z));
    const y = this.horizon + (this.groundY - this.horizon) * (1 - t) ** 1.15;
    const scale = 0.25 + (1 - t) * 0.85;
    const cx = this.width / 2;
    const x = cx + (laneX - cx) * scale;
    return { x, y, scale };
  }

  updateMenu(dt: number) {
    const capped = Math.min(dt, 0.05);
    this.time += capped;
    this.bgOffset += capped * 8;
    updateWorld(this.world, capped, this.stats.distance || 20, false);
    this.updateWildlife(capped, 0.002);
    this.spawnWeatherParticles(capped);
    this.spawnAmbientParticles(capped);
    this.updateParticles(capped);
    this.wildlifeTimer -= capped;
    if (this.wildlifeTimer <= 0) {
      this.spawnWildlife();
      this.wildlifeTimer = 1.2 + Math.random();
    }
  }

  update(dt: number) {
    if (!this.alive) {
      this.updateParticles(dt);
      this.updateFloating(dt);
      this.shake = Math.max(0, this.shake - dt * 8);
      updateWorld(this.world, dt, this.stats.distance, false);
      return;
    }

    const capped = Math.min(dt, 0.05);
    this.time += capped;
    this.runTime += capped;

    // effect timers
    this.effects.magnet = Math.max(0, this.effects.magnet - capped);
    this.effects.double = Math.max(0, this.effects.double - capped);
    this.effects.superJump = Math.max(0, this.effects.superJump - capped);
    this.effects.slow = Math.max(0, this.effects.slow - capped);
    const slowFactor = this.effects.slow > 0 ? 0.55 : 1;

    this.speed = this.baseSpeed + Math.min(220, this.stats.distance * 0.35);
    const effSpeed = this.speed * slowFactor;

    let distDelta = (effSpeed * capped) / 40;
    // perks on distance score
    let distPts = distDelta * 2;
    if (this.perk === 'distance_score') distPts *= 1.1;
    if (this.perk === 'night_owl' && this.world.timeOfDay === 'night') distPts *= 1.2;

    this.stats.distance += distDelta;
    this.stats.score += Math.floor(distPts);

    if (this.world.timeOfDay === 'night') this.counters.nightDistance += distDelta;

    this.bgOffset += effSpeed * capped * 0.02;

    updateWorld(this.world, capped, this.stats.distance, true);

    // personal-best pacer
    if (!this.pbReached && this.pbDistance > 40 && this.stats.distance >= this.pbDistance) {
      this.pbReached = true;
      sfx.fanfare();
      this.cameraPulse = 1;
      this.floatText(this.width / 2, this.height * 0.3, 'NEW PERSONAL BEST!', '#7CFC00');
      for (let i = 0; i < 16; i++) {
        this.burst(
          this.player.x + (Math.random() - 0.5) * 120,
          this.player.y - 60 - Math.random() * 60,
          i % 2 ? '#7CFC00' : '#FFD700',
          1,
          'star',
        );
      }
    }

    if (this.world.biome !== this.lastBiome) {
      this.lastBiome = this.world.biome;
      this.biomesVisited.add(this.world.biome);
      this.regionAnnounce = 2.8;
      this.floatText(this.width / 2, this.height * 0.28, this.world.regionLabel, '#FFE4A0');
      sfx.combo();
      for (let i = 0; i < 12; i++) {
        this.burst(
          this.width * (0.3 + Math.random() * 0.4),
          this.height * 0.3,
          '#FFD700',
          1,
          'star',
        );
      }
    }
    if (this.regionAnnounce > 0) this.regionAnnounce -= capped;

    if (this.comboTimer > 0) {
      this.comboTimer -= capped;
      if (this.comboTimer <= 0) this.stats.combo = 0;
    }

    this.player.animTime += capped;
    this.player.runFrame = Math.floor(this.player.animTime * (10 + this.speed / 80)) % 4;

    const targetX = this.laneXs[this.player.targetLane];
    this.player.x += (targetX - this.player.x) * Math.min(1, capped * 14);
    this.player.lane = this.player.targetLane;

    if (this.player.jumping) {
      this.player.vy += 1800 * capped;
      this.player.y += this.player.vy * capped;
      if (this.player.y >= this.groundY) {
        this.player.y = this.groundY;
        this.player.vy = 0;
        this.player.jumping = false;
        sfx.land();
        this.burst(this.player.x, this.player.y, '#d4b896', 6, 'dust');
      }
    }

    if (this.player.sliding) {
      this.player.slideTimer -= capped;
      if (this.player.slideTimer <= 0) this.player.sliding = false;
    }

    if (this.player.invincible > 0) this.player.invincible -= capped;
    this.shake = Math.max(0, this.shake - capped * 10);
    this.cameraPulse = Math.max(0, this.cameraPulse - capped * 2.5);
    this.nearMissFlash = Math.max(0, this.nearMissFlash - capped * 3);

    const zSpeed = ((effSpeed * capped) / 420);

    for (const o of this.obstacles) {
      o.z -= zSpeed;
      o.anim = (o.anim ?? 0) + capped * 4;
      if (o.type === 'goat' || o.type === 'sheep' || o.type === 'hyena') {
        o.goatPhase = (o.goatPhase ?? 0) + capped * 3;
      }
    }
    for (const c of this.collectibles) {
      c.z -= zSpeed;
      c.bobPhase += capped * 5;
      c.spin = (c.spin ?? 0) + capped * 3;
      // magnet attraction
      if (this.effects.magnet > 0 && c.z < 0.45 && !c.collected) {
        c.lane = this.player.targetLane;
        c.z -= zSpeed * 0.6;
      }
    }

    this.updateWildlife(capped, zSpeed);

    this.spawnTimer -= capped;
    const spawnInterval = Math.max(0.55, 1.35 - this.stats.distance / 800);
    if (this.spawnTimer <= 0) {
      this.spawnObstacle();
      if (Math.random() < 0.25 + Math.min(0.25, this.stats.distance / 2000)) {
        this.spawnObstacle();
      }
      this.spawnTimer = spawnInterval * (0.75 + Math.random() * 0.5);
    }

    this.collectTimer -= capped;
    if (this.collectTimer <= 0) {
      this.spawnCollectible();
      if (Math.random() < 0.45) this.spawnCollectible();
      this.collectTimer = 0.32 + Math.random() * 0.42;
    }

    this.wildlifeTimer -= capped;
    if (this.wildlifeTimer <= 0) {
      this.spawnWildlife();
      if (Math.random() < 0.4) this.spawnWildlife();
      this.wildlifeTimer = 0.7 + Math.random() * 1.1;
    }

    this.spawnWeatherParticles(capped);
    this.spawnAmbientParticles(capped);

    this.handleCollisions();
    this.obstacles = this.obstacles.filter((o) => o.z > -0.08 && !o.hit);
    this.collectibles = this.collectibles.filter((c) => c.z > -0.05 && !c.collected);
    this.wildlife = this.wildlife.filter((w) => w.z > -0.1 && w.z < 1.2).slice(-22);

    this.updateParticles(capped);
    this.updateFloating(capped);
  }

  private updateWildlife(dt: number, zSpeed: number) {
    for (const w of this.wildlife) {
      w.z -= zSpeed * (w.type === 'bird' || w.type === 'butterfly' ? 0.35 : 1);
      w.phase += dt * (w.type === 'butterfly' ? 10 : w.type === 'bird' ? 8 : 3);
      if (w.type === 'bird') w.vy = Math.sin(w.phase) * 20;
      else if (w.type === 'butterfly') w.vx = w.side * 0.05 + Math.sin(w.phase * 1.3) * 0.04;
      else if (w.type === 'fish') w.phase += dt * 2;
    }
  }

  private spawnWeatherParticles(dt: number) {
    this.weatherParticleTimer -= dt;
    if (this.weatherParticleTimer > 0) return;
    this.weatherParticleTimer = 0.016;

    const rain = this.world.rainIntensity;
    if (rain > 0.05) {
      const qm = this.settings.quality === 'low' ? 0.5 : 1;
      const count = Math.floor(rain * (this.world.weather === 'storm' ? 14 : 8) * qm);
      for (let i = 0; i < count; i++) {
        const x = Math.random() * this.width;
        this.particles.push({
          x,
          y: -10 - Math.random() * 40,
          vx: -40 * this.world.wind - 30,
          vy: 500 + Math.random() * 400,
          life: 0.6 + Math.random() * 0.4,
          maxLife: 1,
          size: 1.5 + Math.random() * 2 * rain,
          color: this.world.timeOfDay === 'night' ? 'rgba(160,180,220,0.55)' : 'rgba(200,220,255,0.55)',
          gravity: 200,
          type: 'rain',
          rotation: -0.4,
          rotSpeed: 0,
        });
      }
      if (Math.random() < rain * 0.5) {
        this.particles.push({
          x: Math.random() * this.width,
          y: this.groundY + Math.random() * 40,
          vx: (Math.random() - 0.5) * 40,
          vy: -30 - Math.random() * 40,
          life: 0.25,
          maxLife: 0.25,
          size: 2,
          color: 'rgba(180,200,220,0.4)',
          gravity: 200,
          type: 'splash',
          rotation: 0,
          rotSpeed: 0,
        });
      }
    }

    if (this.world.timeOfDay === 'night' && this.world.weather === 'clear' && Math.random() < 0.3) {
      this.particles.push({
        x: Math.random() * this.width,
        y: this.horizon + Math.random() * (this.groundY - this.horizon),
        vx: (Math.random() - 0.5) * 20,
        vy: -15 - Math.random() * 20,
        life: 1.2 + Math.random(),
        maxLife: 2,
        size: 2 + Math.random() * 2,
        color: 'rgba(255,230,120,0.9)',
        gravity: -10,
        type: 'glow',
        rotation: 0,
        rotSpeed: 0,
      });
    }
  }

  private spawnAmbientParticles(dt: number) {
    this.ambientParticleTimer -= dt;
    if (this.ambientParticleTimer > 0) return;
    this.ambientParticleTimer = 0.08;

    const biome = this.world.biome;
    if ((biome === 'coffee_highlands' || biome === 'traditional_village') && Math.random() < 0.35) {
      const side = Math.random() < 0.5 ? 0.1 : 0.9;
      this.particles.push({
        x: this.width * side + (Math.random() - 0.5) * 40,
        y: this.horizon + Math.random() * 80,
        vx: -20 * this.world.wind + (Math.random() - 0.5) * 30,
        vy: 20 + Math.random() * 30,
        life: 1.5 + Math.random(),
        maxLife: 2.5,
        size: 3 + Math.random() * 4,
        color: Math.random() < 0.4 ? '#8B2500' : '#2d5a27',
        gravity: 30,
        type: Math.random() < 0.5 ? 'petal' : 'leaf',
        rotation: Math.random() * Math.PI,
        rotSpeed: (Math.random() - 0.5) * 4,
      });
    }

    if (biome === 'simien_mountains' && Math.random() < 0.4) {
      this.particles.push({
        x: Math.random() * this.width,
        y: this.horizon + Math.random() * 60,
        vx: -50 * this.world.wind,
        vy: 10 + Math.random() * 20,
        life: 1 + Math.random(),
        maxLife: 2,
        size: 1.5 + Math.random() * 2,
        color: 'rgba(255,255,255,0.7)',
        gravity: 15,
        type: 'circle',
        rotation: 0,
        rotSpeed: 0,
      });
    }

    if (biome === 'blue_nile' && Math.random() < 0.25) {
      this.particles.push({
        x: Math.random() * this.width,
        y: this.groundY - 20 + Math.random() * 30,
        vx: 10 + Math.random() * 20,
        vy: -5,
        life: 1.5,
        maxLife: 1.5,
        size: 10 + Math.random() * 18,
        color: 'rgba(180,220,230,0.15)',
        gravity: -5,
        type: 'smoke',
        rotation: 0,
        rotSpeed: 0.2,
      });
    }

    if (biome === 'addis_ababa' && Math.random() < 0.2) {
      this.particles.push({
        x: this.width * (0.3 + Math.random() * 0.4),
        y: this.groundY - Math.random() * 40,
        vx: (Math.random() - 0.5) * 20,
        vy: -15,
        life: 0.8,
        maxLife: 0.8,
        size: 6 + Math.random() * 10,
        color: 'rgba(80,80,80,0.12)',
        gravity: -10,
        type: 'smoke',
        rotation: 0,
        rotSpeed: 0,
      });
    }

    if (this.world.timeOfDay === 'sunset' && Math.random() < 0.2) {
      this.burst(
        Math.random() * this.width,
        this.horizon + Math.random() * 40,
        'rgba(255,140,40,0.8)',
        1,
        'ember',
      );
    }
  }

  private handleCollisions() {
    const p = this.player;
    const playerZ = 0.08;

    for (const c of this.collectibles) {
      if (c.collected) continue;
      if (c.lane !== p.targetLane && c.lane !== p.lane) continue;
      if (Math.abs(c.z - playerZ) > 0.07) continue;
      if (p.jumping && p.y < this.groundY - 90) continue;

      c.collected = true;

      if (c.type === 'powerup' && c.powerup) {
        this.activateEffect(c.powerup);
        continue;
      }

      // value + perks + double
      let value = c.value;
      if (c.type === 'coin' && this.perk === 'coin_bonus') value = Math.round(value * 1.15);
      if (c.type === 'bean' && this.perk === 'powerup_boost') value = Math.round(value * 1.25);
      if (this.effects.double > 0) value *= 2;

      const comboBonus = Math.min(5, this.stats.combo) * 2;
      const points = value + comboBonus;
      this.stats.score += points;
      this.stats.combo += 1;
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.stats.combo);
      this.comboTimer = 2.2;

      this.collectFx(c, p.x, p.y - 40, points);
    }

    for (const o of this.obstacles) {
      if (o.hit) continue;
      const laneMatch = o.multiLane || o.lane === p.targetLane || o.lane === p.lane;
      if (!laneMatch) {
        if (
          !o.nearMissed &&
          Math.abs(o.z - playerZ) < 0.05 &&
          Math.abs(o.lane - p.targetLane) === 1 &&
          o.z > playerZ - 0.02 &&
          o.z < playerZ + 0.04
        ) {
          o.nearMissed = true;
          this.nearMissFlash = 0.35;
          this.stats.score += 5;
          this.stats.combo += 0; // near miss keeps rhythm but doesn't extend combo
          this.counters.nearMisses += 1;
          sfx.nearMiss();
          this.floatText(p.x + (o.lane < p.targetLane ? -40 : 40), p.y - 60, 'CLOSE!', '#7fd4ff');
        }
        continue;
      }

      if (Math.abs(o.z - playerZ) > 0.065) continue;
      if (p.invincible > 0) continue;

      const superClear = this.effects.superJump > 0;
      if (p.jumping && (JUMPABLE.has(o.type) || superClear) && p.y < this.groundY - 48) continue;
      if (p.sliding && SLIDABLE.has(o.type)) continue;

      o.hit = true;
      this.onHit(o);
      break;
    }
  }

  private collectFx(c: Collectible, x: number, y: number, points: number) {
    const special =
      c.type === 'golden_bean' ||
      c.type === 'star' ||
      c.type === 'coffee_pot' ||
      c.type === 'meskel_flower' ||
      c.type === 'injera';

    if (c.type === 'bean') {
      this.stats.beans += this.effects.double > 0 ? 2 : 1;
      sfx.bean();
      this.burst(x, y, '#6F4E37', 10, 'circle');
      this.burst(x, y, '#C4A484', 4, 'star');
    } else if (c.type === 'coin') {
      this.stats.coins += 1;
      sfx.coin();
      this.burst(x, y, '#FFD700', 12, 'star');
      this.burst(x, y, '#FFF8DC', 4, 'glow');
    } else if (c.type === 'golden_bean') {
      this.stats.beans += 5;
      this.stats.specials += 1;
      sfx.coin();
      sfx.combo();
      this.burst(x, y, '#FFD700', 16, 'star');
      this.burst(x, y, '#FFA500', 8, 'glow');
      this.shake = Math.max(this.shake, 0.25);
      this.cameraPulse = Math.max(this.cameraPulse, 0.6);
    } else if (c.type === 'star') {
      this.stats.specials += 1;
      sfx.combo();
      this.burst(x, y, '#FFFACD', 20, 'star');
      this.burst(x, y, '#87CEEB', 10, 'glow');
      this.shake = Math.max(this.shake, 0.3);
      this.cameraPulse = Math.max(this.cameraPulse, 0.8);
    } else if (c.type === 'meskel_flower') {
      this.stats.specials += 1;
      sfx.bean();
      this.burst(x, y, '#FFD700', 8, 'petal');
      this.burst(x, y, '#FFA500', 6, 'petal');
    } else if (c.type === 'injera') {
      this.stats.specials += 1;
      sfx.coin();
      this.burst(x, y, '#E8D5A3', 10, 'circle');
    } else if (c.type === 'coffee_pot') {
      this.stats.specials += 1;
      sfx.combo();
      this.burst(x, y, '#6F4E37', 12, 'circle');
      this.burst(x, y, '#D4AF37', 6, 'star');
    }

    if (this.stats.combo > 1 && this.stats.combo % 5 === 0) {
      sfx.combo();
      this.floatText(x, y - 40, `${this.stats.combo}x COMBO!`, '#FFD700');
    } else {
      const color =
        c.type === 'coin' || c.type === 'golden_bean' || c.type === 'star'
          ? '#FFD700'
          : c.type === 'meskel_flower'
            ? '#FFA500'
            : '#E8C39E';
      this.floatText(x, y - 30, special ? `+${points}!` : `+${points}`, color);
    }
  }

  /** Rewarded-ad revive: come back with a shield and brief grace */
  revive() {
    if (this.alive) return;
    this.alive = true;
    this.effects.shield = Math.max(this.effects.shield, 1);
    this.player.invincible = 2.2;
    this.obstacles = this.obstacles.filter((o) => o.z > 0.45);
    this.shake = 0.4;
    this.cameraPulse = 1;
    sfx.revive();
    this.floatText(this.player.x, this.player.y - 100, 'REVIVED!', '#FFD700');
    this.burst(this.player.x, this.player.y - 40, '#FFD700', 20, 'star');
    this.burst(this.player.x, this.player.y - 40, '#fff8dc', 12, 'glow');
  }

  private onHit(o: Obstacle) {
    // shield absorbs one hit
    if (this.effects.shield > 0) {
      this.effects.shield -= 1;
      this.player.invincible = 1.6;
      this.shake = 0.5;
      this.cameraPulse = 1;
      sfx.shieldBreak();
      this.floatText(this.player.x, this.player.y - 90, 'SHIELD SAVED YOU!', '#5aa8ff');
      this.burst(this.player.x, this.player.y - 30, '#5aa8ff', 18, 'star');
      this.burst(this.player.x, this.player.y - 30, '#bfe0ff', 10, 'glow');
      if (this.settings.vibrate && typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(30);
      }
      return;
    }

    this.deathBy = o.type;
    sfx.hit();
    this.shake = 1;
    this.cameraPulse = 1;
    this.burst(this.player.x, this.player.y - 30, '#ff6b4a', 18, 'spark');
    this.burst(this.player.x, this.player.y - 20, '#8B4513', 12, 'circle');
    this.burst(this.player.x, this.player.y - 10, '#333', 8, 'smoke');
    this.alive = false;
    sfx.gameOver();

    if (this.settings.vibrate && typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(80);
    }
  }

  private updateParticles(dt: number) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.rotation += p.rotSpeed * dt;
      if (p.type === 'rain') p.vx += -this.world.wind * 20 * dt;
    }
    const cap = this.settings.quality === 'low' ? 110 : 200;
    this.particles = this.particles.filter((p) => p.life > 0).slice(-cap);
  }

  private updateFloating(dt: number) {
    for (const f of this.floatingTexts) {
      f.life -= dt;
      f.y += f.vy * dt;
    }
    this.floatingTexts = this.floatingTexts.filter((f) => f.life > 0);
  }

  snapshot(): EngineSnapshot {
    return {
      player: this.player,
      obstacles: this.obstacles,
      collectibles: this.collectibles,
      particles: this.particles,
      floatingTexts: this.floatingTexts,
      wildlife: this.wildlife,
      stats: { ...this.stats },
      speed: this.speed,
      shake: this.shake,
      alive: this.alive,
      time: this.time,
      bgOffset: this.bgOffset,
      nearMissFlash: this.nearMissFlash,
      world: { ...this.world },
      effects: { ...this.effects },
      counters: { ...this.counters },
      biomesVisited: Array.from(this.biomesVisited),
      pbDistance: this.pbDistance,
      pbReached: this.pbReached,
    };
  }

  projectPublic(z: number, lane: Lane | number, laneOffset = 0) {
    const base =
      typeof lane === 'number' && lane >= 0 && lane <= 2
        ? this.laneXs[lane as Lane]
        : this.width / 2;
    return this.project(z, base + laneOffset);
  }

  projectSide(z: number, side: number, edge = 120) {
    const t = Math.max(0, Math.min(1, z));
    const y = this.horizon + (this.groundY - this.horizon) * (1 - t) ** 1.15;
    const scale = 0.25 + (1 - t) * 0.85;
    const cx = this.width / 2;
    const x = cx + side * (edge + (1 - t) * 90) * (this.width / 400) * scale * 1.1;
    return { x, y, scale };
  }

  get ground() {
    return this.groundY;
  }

  get horizonY() {
    return this.horizon;
  }

  get lanes() {
    return this.laneXs;
  }
}
