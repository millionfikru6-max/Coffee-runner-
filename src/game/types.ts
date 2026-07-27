export type GameState = 'menu' | 'playing' | 'paused' | 'gameover' | 'settings';

export type Lane = 0 | 1 | 2;

export type Biome =
  | 'coffee_highlands'
  | 'addis_ababa'
  | 'simien_mountains'
  | 'blue_nile'
  | 'traditional_village';

export type Weather = 'clear' | 'rain' | 'overcast' | 'golden' | 'storm';

export type TimeOfDay = 'dawn' | 'day' | 'sunset' | 'night';

export type ObstacleType =
  | 'rock'
  | 'tree'
  | 'river'
  | 'goat'
  | 'cart'
  | 'sheep'
  | 'barrel'
  | 'market_stall'
  | 'bajaj'
  | 'boulder'
  | 'fence'
  | 'pot_hole'
  | 'fallen_log'
  | 'hyena';

export type CollectibleType =
  | 'bean'
  | 'coin'
  | 'injera'
  | 'golden_bean'
  | 'meskel_flower'
  | 'coffee_pot'
  | 'star'
  | 'powerup';

export type PowerUpId = 'magnet' | 'shield' | 'double' | 'superJump' | 'slow';

export type CharacterPerk = 'distance_score' | 'coin_bonus' | 'night_owl' | 'powerup_boost';

export type WildlifeType = 'bird' | 'goat_side' | 'sheep_side' | 'butterfly' | 'ibex' | 'fish';

export type ParticleType =
  | 'circle'
  | 'star'
  | 'leaf'
  | 'spark'
  | 'rain'
  | 'splash'
  | 'ember'
  | 'dust'
  | 'petal'
  | 'glow'
  | 'smoke';

export interface Vec2 {
  x: number;
  y: number;
}

export interface Appearance {
  skin: string;
  hair: string;
  cloth: string;
  sash: string;
  trim1: string;
  trim2: string;
  glow?: boolean;
}

/** Active power-up effect timers (seconds remaining; shield = charges) */
export interface Effects {
  magnet: number;
  shield: number;
  double: number;
  superJump: number;
  slow: number;
}

export interface RunCounters {
  jumps: number;
  slides: number;
  nearMisses: number;
  powerupsUsed: number;
  nightDistance: number;
}

export interface Player {
  lane: Lane;
  targetLane: Lane;
  x: number;
  y: number;
  vy: number;
  jumping: boolean;
  sliding: boolean;
  slideTimer: number;
  invincible: number;
  animTime: number;
  runFrame: number;
}

export interface Obstacle {
  id: number;
  type: ObstacleType;
  lane: Lane;
  z: number;
  width: number;
  height: number;
  hit: boolean;
  multiLane?: boolean;
  goatDir?: number;
  goatPhase?: number;
  anim?: number;
  nearMissed?: boolean;
}

export interface Collectible {
  id: number;
  type: CollectibleType;
  lane: Lane;
  z: number;
  collected: boolean;
  bobPhase: number;
  value: number;
  spin?: number;
  powerup?: PowerUpId;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  type: ParticleType;
  rotation: number;
  rotSpeed: number;
  alpha?: number;
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
  color: string;
  vy: number;
}

export interface Wildlife {
  id: number;
  type: WildlifeType;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  side: number;
  phase: number;
  scale: number;
  color: string;
}

export interface WorldState {
  biome: Biome;
  nextBiome: Biome;
  biomeBlend: number;
  biomeProgress: number;
  weather: Weather;
  weatherTimer: number;
  timeOfDay: TimeOfDay;
  dayPhase: number;
  light: number;
  ambientTint: string;
  rainIntensity: number;
  wind: number;
  regionLabel: string;
}

export interface HighScore {
  name: string;
  score: number;
  distance: number;
  date: string;
}

export interface GameStats {
  score: number;
  distance: number;
  beans: number;
  coins: number;
  combo: number;
  maxCombo: number;
  specials: number;
}

export interface Settings {
  sound: boolean;
  music: boolean;
  vibrate: boolean;
  difficulty: 'easy' | 'normal' | 'hard';
  quality: 'high' | 'low';
  screenShake: boolean;
  /** Show on-screen D-pad buttons in addition to swipe gestures. */
  touchButtons: boolean;
  /** Mirror the on-screen buttons for left-handed play. */
  leftHanded: boolean;
  /** Reduce non-essential motion (parallax, shake, speed lines). */
  reducedMotion: boolean;
}

/** Summary of a finished run, fed into progression systems */
export interface RunSummary {
  score: number;
  distance: number;
  beans: number;
  coins: number;
  specials: number;
  maxCombo: number;
  jumps: number;
  slides: number;
  nearMisses: number;
  powerupsUsed: number;
  nightDistance: number;
  biomesVisited: Biome[];
  deathBy: ObstacleType | null;
  durationSec: number;
}

export const BIOME_ORDER: Biome[] = [
  'coffee_highlands',
  'traditional_village',
  'addis_ababa',
  'simien_mountains',
  'blue_nile',
];

export const BIOME_LABELS: Record<Biome, string> = {
  coffee_highlands: 'Coffee Highlands',
  addis_ababa: 'Addis Ababa',
  simien_mountains: 'Simien Mountains',
  blue_nile: 'Blue Nile',
  traditional_village: 'Highland Village',
};

export const BIOME_DISTANCE = 180;
