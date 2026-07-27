import type {
  Biome,
  CharacterPerk,
  ObstacleType,
  PowerUpId,
  RunSummary,
} from './types';

import { SaveStore } from './save';

/* ---------------------------------- defs ---------------------------------- */

export interface CharacterDef {
  id: string;
  name: string;
  title: string;
  perk: CharacterPerk;
  perkLabel: string;
  costCoins: number;
  costGems: number;
  skin: string;
  hair: string;
  swatch: string;
  emoji: string;
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'abebe',
    name: 'Abebe',
    title: 'Barefoot Legend',
    perk: 'distance_score',
    perkLabel: '+10% distance score',
    costCoins: 0,
    costGems: 0,
    skin: '#8B5A2B',
    hair: '#1a0f0a',
    swatch: '#c41e3a',
    emoji: '🏃🏾',
  },
  {
    id: 'tigist',
    name: 'Tigist',
    title: 'Highland Sprinter',
    perk: 'coin_bonus',
    perkLabel: '+15% coin value',
    costCoins: 600,
    costGems: 0,
    skin: '#7a4a20',
    hair: '#241008',
    swatch: '#228B22',
    emoji: '🏃🏽‍♀️',
  },
  {
    id: 'kidus',
    name: 'Kidus',
    title: 'Night Owl',
    perk: 'night_owl',
    perkLabel: '+20% score at night',
    costCoins: 1500,
    costGems: 0,
    skin: '#5c3a1e',
    hair: '#0f0a06',
    swatch: '#3a5ab8',
    emoji: '🦉',
  },
  {
    id: 'selam',
    name: 'Selam',
    title: 'Bean Charmer',
    perk: 'powerup_boost',
    perkLabel: '+40% power-up duration',
    costCoins: 0,
    costGems: 30,
    skin: '#9c6a35',
    hair: '#2a1208',
    swatch: '#D4AF37',
    emoji: '✨',
  },
];

export interface OutfitDef {
  id: string;
  name: string;
  desc: string;
  costCoins: number;
  costGems: number;
  cloth: string;
  sash: string;
  trim1: string;
  trim2: string;
  glow?: boolean;
  swatch: string;
}

export const OUTFITS: OutfitDef[] = [
  {
    id: 'shamma',
    name: 'Shamma',
    desc: 'Classic highland wrap',
    costCoins: 0,
    costGems: 0,
    cloth: '#fff8f0',
    sash: '#c41e3a',
    trim1: '#228B22',
    trim2: '#FFD700',
    swatch: '#fff8f0',
  },
  {
    id: 'marathon',
    name: 'Marathon Kit',
    desc: 'Ethiopian athletics colors',
    costCoins: 350,
    costGems: 0,
    cloth: '#f5c518',
    sash: '#228B22',
    trim1: '#c41e3a',
    trim2: '#ffffff',
    swatch: '#f5c518',
  },
  {
    id: 'habesha',
    name: 'Habesha Kemis',
    desc: 'Embroidered tibeb dress',
    costCoins: 900,
    costGems: 0,
    cloth: '#fffdf5',
    sash: '#e07020',
    trim1: '#228B22',
    trim2: '#c41e3a',
    swatch: '#e07020',
  },
  {
    id: 'night',
    name: 'Night Runner',
    desc: 'Glows under the stars',
    costCoins: 0,
    costGems: 20,
    cloth: '#1a2440',
    sash: '#0f1830',
    trim1: '#FFD700',
    trim2: '#87CEEB',
    glow: true,
    swatch: '#1a2440',
  },
];

export interface PowerUpDef {
  id: PowerUpId;
  name: string;
  desc: string;
  costCoins: number;
  emoji: string;
  color: string;
}

export const POWERUPS: PowerUpDef[] = [
  { id: 'magnet', name: 'Magnet', desc: 'Pulls beans & coins to you · 15s', costCoins: 120, emoji: '🧲', color: '#ff5a4a' },
  { id: 'shield', name: 'Shield', desc: 'Survive one crash', costCoins: 150, emoji: '🛡️', color: '#5aa8ff' },
  { id: 'double', name: 'Double Beans', desc: '2× everything you collect · 20s', costCoins: 180, emoji: '✖️', color: '#ffd700' },
  { id: 'superJump', name: 'Super Jump', desc: 'Leap higher, clear anything · 20s', costCoins: 140, emoji: '🦘', color: '#5ad46a' },
  { id: 'slow', name: 'Time Slow', desc: 'Bullet-time for 6s', costCoins: 200, emoji: '⏳', color: '#b07aff' },
];

/* -------------------------------- missions -------------------------------- */

export type MissionMetric =
  | 'distance'
  | 'beans'
  | 'score'
  | 'jumps'
  | 'near_miss'
  | 'coins'
  | 'powerups'
  | 'distance_single';

export interface MissionDef {
  id: string;
  label: string;
  metric: MissionMetric;
  target: number;
  rewardCoins: number;
  rewardGems: number;
}

const MISSION_POOL: MissionDef[] = [
  { id: 'dist_500', label: 'Run 500m in total', metric: 'distance', target: 500, rewardCoins: 100, rewardGems: 0 },
  { id: 'beans_60', label: 'Collect 60 coffee beans', metric: 'beans', target: 60, rewardCoins: 80, rewardGems: 0 },
  { id: 'score_4k', label: 'Reach 4,000 score', metric: 'score', target: 4000, rewardCoins: 120, rewardGems: 0 },
  { id: 'jumps_40', label: 'Jump 40 times', metric: 'jumps', target: 40, rewardCoins: 60, rewardGems: 0 },
  { id: 'miss_8', label: '8 near misses', metric: 'near_miss', target: 8, rewardCoins: 90, rewardGems: 1 },
  { id: 'coins_20', label: 'Grab 20 coins', metric: 'coins', target: 20, rewardCoins: 70, rewardGems: 0 },
  { id: 'pows_2', label: 'Use 2 power-ups', metric: 'powerups', target: 2, rewardCoins: 0, rewardGems: 1 },
  { id: 'single_250', label: '250m in a single run', metric: 'distance_single', target: 250, rewardCoins: 0, rewardGems: 1 },
];

export interface MissionState {
  id: string;
  progress: number;
  claimed: boolean;
}

/* ------------------------------- achievements ------------------------------ */

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  gems: number;
  test: (s: LifetimeStats, p: Profile) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_run', name: 'First Steps', desc: 'Finish your first run', gems: 2, test: (s) => s.runs >= 1 },
  { id: 'dist_1k', name: 'Highland Hiker', desc: 'Run 1,000m lifetime', gems: 3, test: (s) => s.totalDistance >= 1000 },
  { id: 'dist_10k', name: 'Marathoner', desc: 'Run 10,000m lifetime', gems: 8, test: (s) => s.totalDistance >= 10000 },
  { id: 'score_10k', name: 'Coffee Baron', desc: 'Score 10,000 in one run', gems: 5, test: (s) => s.bestScore >= 10000 },
  { id: 'beans_500', name: 'Bean Hoarder', desc: 'Collect 500 beans lifetime', gems: 4, test: (s) => s.totalBeans >= 500 },
  { id: 'combo_15', name: 'Rhythm Runner', desc: 'Hit a 15× combo', gems: 3, test: (s) => s.bestCombo >= 15 },
  { id: 'explorer', name: 'Heart of Ethiopia', desc: 'Visit all 5 regions', gems: 5, test: (s) => s.biomesSeen.length >= 5 },
  { id: 'night_500', name: 'Moonlight Dash', desc: 'Run 500m at night', gems: 3, test: (s) => s.nightDistance >= 500 },
  { id: 'shopper', name: 'Collector', desc: 'Own 3 characters or outfits', gems: 2, test: (_s, p) => p.ownedCharacters.length + p.ownedOutfits.length >= 5 },
  { id: 'pow_10', name: 'Power Broker', desc: 'Use 10 power-ups', gems: 3, test: (s) => s.powerupsUsed >= 10 },
  { id: 'miss_50', name: 'Thread the Needle', desc: '50 near misses lifetime', gems: 3, test: (s) => s.totalNearMisses >= 50 },
  { id: 'rich', name: 'Buna Tycoon', desc: 'Hold 2,000 coins at once', gems: 2, test: (_s, p) => p.coins >= 2000 },
];

/* ------------------------------ daily rewards ------------------------------ */

export interface DailyReward {
  coins: number;
  gems: number;
  powerup?: PowerUpId;
  label: string;
}

export const DAILY_REWARDS: DailyReward[] = [
  { coins: 60, gems: 0, label: '60 coins' },
  { coins: 100, gems: 0, label: '100 coins' },
  { coins: 0, gems: 1, label: '1 gem' },
  { coins: 150, gems: 0, label: '150 coins' },
  { coins: 0, gems: 0, powerup: 'magnet', label: '1× Magnet' },
  { coins: 200, gems: 0, label: '200 coins' },
  { coins: 0, gems: 3, label: '3 gems' },
];

/* --------------------------------- profile --------------------------------- */

export interface LifetimeStats {
  runs: number;
  bestScore: number;
  bestDistance: number;
  totalDistance: number;
  totalBeans: number;
  totalCoinsEarned: number;
  totalGemsEarned: number;
  totalJumps: number;
  totalSlides: number;
  totalNearMisses: number;
  bestCombo: number;
  powerupsUsed: number;
  deaths: Partial<Record<ObstacleType, number>>;
  timePlayedSec: number;
  biomesSeen: Biome[];
  nightDistance: number;
}

export interface LeaderEntry {
  name: string;
  emoji: string;
  score: number;
  distance: number;
  biome: string;
  date: string;
}

export interface Profile {
  version: number;
  coins: number;
  gems: number;
  character: string;
  outfit: string;
  ownedCharacters: string[];
  ownedOutfits: string[];
  inventory: Record<PowerUpId, number>;
  equipped: PowerUpId[];
  missions: MissionState[];
  missionDay: string;
  achievements: Record<string, boolean>; // claimed
  daily: { lastClaim: string | null; streak: number };
  leaderboard: LeaderEntry[];
  stats: LifetimeStats;
  tutorialDone: boolean;
}

export function todayKey(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function emptyInventory(): Record<PowerUpId, number> {
  return { magnet: 1, shield: 1, double: 0, superJump: 0, slow: 0 };
}

function defaultProfile(): Profile {
  const p: Profile = {
    version: 2,
    coins: 120,
    gems: 5,
    character: 'abebe',
    outfit: 'shamma',
    ownedCharacters: ['abebe'],
    ownedOutfits: ['shamma'],
    inventory: emptyInventory(),
    equipped: [],
    missions: [],
    missionDay: '',
    achievements: {},
    daily: { lastClaim: null, streak: 0 },
    leaderboard: [],
    tutorialDone: false,
    stats: {
      runs: 0,
      bestScore: 0,
      bestDistance: 0,
      totalDistance: 0,
      totalBeans: 0,
      totalCoinsEarned: 0,
      totalGemsEarned: 0,
      totalJumps: 0,
      totalSlides: 0,
      totalNearMisses: 0,
      bestCombo: 0,
      powerupsUsed: 0,
      deaths: {},
      timePlayedSec: 0,
      biomesSeen: [],
      nightDistance: 0,
    },
  };
  return rollMissions(p);
}

function rollMissions(p: Profile): Profile {
  const today = todayKey();
  if (p.missionDay === today && p.missions.length === 3) return p;
  const pool = [...MISSION_POOL].sort(() => Math.random() - 0.5).slice(0, 3);
  return {
    ...p,
    missionDay: today,
    missions: pool.map((m) => ({ id: m.id, progress: 0, claimed: false })),
  };
}

/* -------------------------------- persistence ------------------------------ */

export function resetProgress(): Profile {
  store.clear();
  const p = defaultProfile();
  cached = p;
  store.save(p);
  store.flush();
  return p;
}

export function markTutorialDone(p: Profile): Profile {
  const next = { ...p, tutorialDone: true };
  saveProfile(next);
  return next;
}

/**
 * Repair a loaded profile: fill anything missing, drop references to content
 * that no longer exists, and clamp values that a corrupt save (or a tampered
 * one) could otherwise use to break the economy.
 */
function normaliseProfile(raw: Record<string, unknown>, defaults: Profile): Profile {
  const r = raw as Partial<Profile>;
  const clampNum = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.floor(v))) : fallback;

  const ownedCharacters = Array.isArray(r.ownedCharacters)
    ? r.ownedCharacters.filter((id) => CHARACTERS.some((c) => c.id === id))
    : [...defaults.ownedCharacters];
  if (!ownedCharacters.includes('abebe')) ownedCharacters.push('abebe');

  const ownedOutfits = Array.isArray(r.ownedOutfits)
    ? r.ownedOutfits.filter((id) => OUTFITS.some((o) => o.id === id))
    : [...defaults.ownedOutfits];
  if (!ownedOutfits.includes('shamma')) ownedOutfits.push('shamma');

  // Never leave the player equipped to something they don't own.
  const character = ownedCharacters.includes(r.character as string)
    ? (r.character as string)
    : 'abebe';
  const outfit = ownedOutfits.includes(r.outfit as string) ? (r.outfit as string) : 'shamma';

  const inventory = { ...emptyInventory() };
  if (r.inventory && typeof r.inventory === 'object') {
    for (const k of Object.keys(inventory) as PowerUpId[]) {
      inventory[k] = clampNum((r.inventory as Record<string, unknown>)[k], 0, 99, 0);
    }
  }

  const equipped = Array.isArray(r.equipped)
    ? (r.equipped.filter((id) => id in inventory && inventory[id as PowerUpId] > 0) as PowerUpId[]).slice(0, 3)
    : [];

  const missions = Array.isArray(r.missions)
    ? r.missions
        .filter((m) => m && typeof m.id === 'string' && missionDef(m.id))
        .map((m) => ({
          id: m.id,
          progress: clampNum(m.progress, 0, 1e9, 0),
          claimed: !!m.claimed,
        }))
    : [];

  const leaderboard = Array.isArray(r.leaderboard)
    ? r.leaderboard
        .filter((e) => e && typeof e.score === 'number' && Number.isFinite(e.score))
        .map((e) => ({
          name: String(e.name ?? 'Runner').slice(0, 24),
          emoji: String(e.emoji ?? '🏃').slice(0, 8),
          score: clampNum(e.score, 0, 1e12, 0),
          distance: clampNum(e.distance, 0, 1e9, 0),
          biome: String(e.biome ?? 'highlands').slice(0, 40),
          date: typeof e.date === 'string' ? e.date : new Date().toISOString(),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
    : [];

  const stats: LifetimeStats = {
    ...defaults.stats,
    ...(r.stats && typeof r.stats === 'object' ? r.stats : {}),
    deaths: { ...((r.stats as LifetimeStats | undefined)?.deaths ?? {}) },
    biomesSeen: Array.isArray((r.stats as LifetimeStats | undefined)?.biomesSeen)
      ? ((r.stats as LifetimeStats).biomesSeen as Biome[]).filter((b) =>
          ['coffee_highlands', 'traditional_village', 'addis_ababa', 'simien_mountains', 'blue_nile'].includes(b),
        )
      : [],
  };

  return {
    ...defaults,
    version: SAVE_PROFILE_VERSION,
    coins: clampNum(r.coins, 0, 1e9, defaults.coins),
    gems: clampNum(r.gems, 0, 1e6, defaults.gems),
    character,
    outfit,
    ownedCharacters,
    ownedOutfits,
    inventory,
    equipped,
    missions,
    missionDay: typeof r.missionDay === 'string' ? r.missionDay : '',
    achievements:
      r.achievements && typeof r.achievements === 'object'
        ? (r.achievements as Record<string, boolean>)
        : {},
    daily: {
      lastClaim: typeof r.daily?.lastClaim === 'string' ? r.daily.lastClaim : null,
      streak: clampNum(r.daily?.streak, 0, 3650, 0),
    },
    leaderboard,
    stats,
    tutorialDone: !!r.tutorialDone,
  };
}

const SAVE_PROFILE_VERSION = 3;

const store = new SaveStore<Profile>({
  defaults: defaultProfile,
  normalise: normaliseProfile,
  migrations: {
    // v2 (original build) → v3: leaderboard entries gained a biome label and
    // the inventory gained the 'slow' power-up.
    2: (d) => {
      const p = d as Partial<Profile>;
      return {
        ...p,
        inventory: { magnet: 0, shield: 0, double: 0, superJump: 0, slow: 0, ...(p.inventory ?? {}) },
        leaderboard: (p.leaderboard ?? []).map((e) => ({
          ...e,
          biome: e.biome ?? 'highlands',
          emoji: e.emoji ?? '🏃',
        })),
        version: 3,
      };
    },
  },
});

let cached: Profile | null = null;

export function loadProfile(): Profile {
  const result = store.load();
  let p = result.data;
  p = rollMissions(p);
  cached = p;
  store.save(p);
  return p;
}

export function saveProfile(p: Profile): void {
  cached = p;
  store.save(p);
}

/** Force any queued write to disk right now. */
export function flushProfile(): void {
  store.flush();
}

/** Portable save code for moving between devices. */
export function exportProfile(p: Profile): string {
  return store.export(p);
}

/** Returns null when the code is malformed or fails its checksum. */
export function importProfile(code: string): Profile | null {
  const p = store.import(code);
  if (!p) return null;
  const rolled = rollMissions(p);
  cached = rolled;
  store.save(rolled);
  store.flush();
  return rolled;
}

/** Last profile handed out by load/save, for callers that need it cheaply. */
export function currentProfile(): Profile | null {
  return cached;
}

/* --------------------------------- actions --------------------------------- */

export function missionDef(id: string): MissionDef | undefined {
  return MISSION_POOL.find((m) => m.id === id);
}

export function purchaseCharacter(p: Profile, id: string): Profile | null {
  const def = CHARACTERS.find((c) => c.id === id);
  if (!def || p.ownedCharacters.includes(id)) return null;
  if (p.coins < def.costCoins || p.gems < def.costGems) return null;
  const next: Profile = {
    ...p,
    coins: p.coins - def.costCoins,
    gems: p.gems - def.costGems,
    ownedCharacters: [...p.ownedCharacters, id],
    character: id,
  };
  saveProfile(next);
  return next;
}

export function purchaseOutfit(p: Profile, id: string): Profile | null {
  const def = OUTFITS.find((o) => o.id === id);
  if (!def || p.ownedOutfits.includes(id)) return null;
  if (p.coins < def.costCoins || p.gems < def.costGems) return null;
  const next: Profile = {
    ...p,
    coins: p.coins - def.costCoins,
    gems: p.gems - def.costGems,
    ownedOutfits: [...p.ownedOutfits, id],
    outfit: id,
  };
  saveProfile(next);
  return next;
}

export function purchasePowerUp(p: Profile, id: PowerUpId): Profile | null {
  const def = POWERUPS.find((x) => x.id === id);
  if (!def || p.coins < def.costCoins) return null;
  const next: Profile = {
    ...p,
    coins: p.coins - def.costCoins,
    inventory: { ...p.inventory, [id]: (p.inventory[id] ?? 0) + 1 },
  };
  saveProfile(next);
  return next;
}

export function selectCharacter(p: Profile, id: string): Profile | null {
  if (!p.ownedCharacters.includes(id)) return null;
  const next = { ...p, character: id };
  saveProfile(next);
  return next;
}

export function selectOutfit(p: Profile, id: string): Profile | null {
  if (!p.ownedOutfits.includes(id)) return null;
  const next = { ...p, outfit: id };
  saveProfile(next);
  return next;
}

export function toggleEquip(p: Profile, id: PowerUpId): Profile | null {
  if ((p.inventory[id] ?? 0) <= 0) return null;
  const equipped = p.equipped.includes(id)
    ? p.equipped.filter((e) => e !== id)
    : p.equipped.length >= 2
      ? [...p.equipped.slice(1), id]
      : [...p.equipped, id];
  const next = { ...p, equipped };
  saveProfile(next);
  return next;
}

export function consumeEquipped(p: Profile): { profile: Profile; boosters: PowerUpId[] } {
  const boosters = p.equipped.filter((id) => (p.inventory[id] ?? 0) > 0);
  const inventory = { ...p.inventory };
  for (const b of boosters) inventory[b] = Math.max(0, inventory[b] - 1);
  const next = { ...p, inventory };
  saveProfile(next);
  return { profile: next, boosters };
}

export function claimMission(p: Profile, id: string): Profile | null {
  const def = missionDef(id);
  const state = p.missions.find((m) => m.id === id);
  if (!def || !state || state.claimed || state.progress < def.target) return null;
  const next: Profile = {
    ...p,
    coins: p.coins + def.rewardCoins,
    gems: p.gems + def.rewardGems,
    stats: { ...p.stats, totalCoinsEarned: p.stats.totalCoinsEarned + def.rewardCoins, totalGemsEarned: p.stats.totalGemsEarned + def.rewardGems },
    missions: p.missions.map((m) => (m.id === id ? { ...m, claimed: true } : m)),
  };
  saveProfile(next);
  return next;
}

export function completedAchievements(p: Profile): AchievementDef[] {
  return ACHIEVEMENTS.filter((a) => !p.achievements[a.id] && a.test(p.stats, p));
}

export function claimAchievement(p: Profile, id: string): Profile | null {
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  if (!def || p.achievements[id] || !def.test(p.stats, p)) return null;
  const next: Profile = {
    ...p,
    gems: p.gems + def.gems,
    stats: { ...p.stats, totalGemsEarned: p.stats.totalGemsEarned + def.gems },
    achievements: { ...p.achievements, [id]: true },
  };
  saveProfile(next);
  return next;
}

export function dailyRewardForStreak(streak: number): DailyReward {
  return DAILY_REWARDS[Math.max(0, streak - 1) % DAILY_REWARDS.length];
}

export function canClaimDaily(p: Profile): boolean {
  return p.daily.lastClaim !== todayKey();
}

export function claimDaily(p: Profile): { profile: Profile; reward: DailyReward; streak: number } {
  const yesterday = todayKey(-1);
  const streak = p.daily.lastClaim === yesterday ? p.daily.streak + 1 : 1;
  const reward = dailyRewardForStreak(streak);
  const next: Profile = {
    ...p,
    coins: p.coins + reward.coins,
    gems: p.gems + reward.gems,
    inventory: reward.powerup
      ? { ...p.inventory, [reward.powerup]: (p.inventory[reward.powerup] ?? 0) + 1 }
      : p.inventory,
    stats: {
      ...p.stats,
      totalCoinsEarned: p.stats.totalCoinsEarned + reward.coins,
      totalGemsEarned: p.stats.totalGemsEarned + reward.gems,
    },
    daily: { lastClaim: todayKey(), streak },
  };
  saveProfile(next);
  return { profile: next, reward, streak };
}

/* -------------------------------- record run ------------------------------- */

export interface RunReport {
  coinsEarned: number;
  newlyCompleted: AchievementDef[];
  missionsProgressed: number;
  missionsReady: number;
  newBest: boolean;
}

function metricDelta(metric: MissionMetric, r: RunSummary, state: MissionState): number {
  switch (metric) {
    case 'distance':
      return r.distance;
    case 'beans':
      return r.beans;
    case 'score':
      return Math.max(0, r.score - state.progress);
    case 'jumps':
      return r.jumps;
    case 'near_miss':
      return r.nearMisses;
    case 'coins':
      return r.coins;
    case 'powerups':
      return r.powerupsUsed;
    case 'distance_single':
      return Math.max(0, r.distance - state.progress);
  }
}

export function recordRun(prev: Profile, r: RunSummary): { profile: Profile; report: RunReport } {
  let p: Profile = { ...prev, stats: { ...prev.stats, deaths: { ...prev.stats.deaths }, biomesSeen: [...prev.stats.biomesSeen] }, missions: prev.missions.map((m) => ({ ...m })), leaderboard: [...prev.leaderboard] };

  const s = p.stats;
  const newBest = r.score > s.bestScore;

  // wallet: coins from the run become currency
  p.coins += r.coins;

  // lifetime stats
  s.runs += 1;
  s.bestScore = Math.max(s.bestScore, r.score);
  s.bestDistance = Math.max(s.bestDistance, r.distance);
  s.totalDistance += r.distance;
  s.totalBeans += r.beans;
  s.totalCoinsEarned += r.coins;
  s.totalJumps += r.jumps;
  s.totalSlides += r.slides;
  s.totalNearMisses += r.nearMisses;
  s.bestCombo = Math.max(s.bestCombo, r.maxCombo);
  s.powerupsUsed += r.powerupsUsed;
  s.timePlayedSec += r.durationSec;
  s.nightDistance += r.nightDistance;
  if (r.deathBy) s.deaths[r.deathBy] = (s.deaths[r.deathBy] ?? 0) + 1;
  for (const b of r.biomesVisited) {
    if (!s.biomesSeen.includes(b)) s.biomesSeen.push(b);
  }

  // missions
  p = rollMissions(p);
  let missionsProgressed = 0;
  p.missions = p.missions.map((m) => {
    const def = missionDef(m.id);
    if (!def || m.claimed) return m;
    const delta = metricDelta(def.metric, r, m);
    if (delta > 0) {
      missionsProgressed += 1;
      return { ...m, progress: Math.min(def.target, m.progress + delta) };
    }
    return m;
  });

  // leaderboard
  const charDef = CHARACTERS.find((c) => c.id === p.character);
  const biomeLabel = r.biomesVisited.length
    ? r.biomesVisited[r.biomesVisited.length - 1].replace(/_/g, ' ')
    : 'highlands';
  if (r.score > 0) {
    p.leaderboard.push({
      name: charDef?.name ?? 'Runner',
      emoji: charDef?.emoji ?? '🏃',
      score: r.score,
      distance: Math.floor(r.distance),
      biome: biomeLabel,
      date: new Date().toISOString(),
    });
    p.leaderboard.sort((a, b) => b.score - a.score);
    p.leaderboard = p.leaderboard.slice(0, 10);
  }

  const newlyCompleted = completedAchievements(p);

  saveProfile(p);

  return {
    profile: p,
    report: {
      coinsEarned: r.coins,
      newlyCompleted,
      missionsProgressed,
      missionsReady: p.missions.filter((m) => {
        const def = missionDef(m.id);
        return def && !m.claimed && m.progress >= def.target;
      }).length,
      newBest,
    },
  };
}
