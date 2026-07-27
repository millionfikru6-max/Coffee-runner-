import type { Biome, TimeOfDay, Weather, WorldState } from './types';
import { BIOME_DISTANCE, BIOME_LABELS, BIOME_ORDER } from './types';

export function createWorldState(): WorldState {
  return {
    biome: 'coffee_highlands',
    nextBiome: 'traditional_village',
    biomeBlend: 0,
    biomeProgress: 0,
    weather: 'clear',
    weatherTimer: 12,
    timeOfDay: 'day',
    dayPhase: 0.28, // morning start
    light: 1,
    ambientTint: 'rgba(255,220,160,0)',
    rainIntensity: 0,
    wind: 0.2,
    regionLabel: BIOME_LABELS.coffee_highlands,
  };
}

export function biomeAtDistance(distance: number): {
  biome: Biome;
  next: Biome;
  progress: number;
  blend: number;
} {
  const idx = Math.floor(distance / BIOME_DISTANCE) % BIOME_ORDER.length;
  const nextIdx = (idx + 1) % BIOME_ORDER.length;
  const progress = (distance % BIOME_DISTANCE) / BIOME_DISTANCE;
  // blend near end of biome
  const blend = progress > 0.82 ? (progress - 0.82) / 0.18 : 0;
  return {
    biome: BIOME_ORDER[idx],
    next: BIOME_ORDER[nextIdx],
    progress,
    blend,
  };
}

export function updateWorld(world: WorldState, dt: number, distance: number, playing: boolean): void {
  // day/night — full cycle ~90s while playing, slower on menu
  const cycleSpeed = playing ? 1 / 90 : 1 / 140;
  world.dayPhase = (world.dayPhase + dt * cycleSpeed) % 1;

  world.timeOfDay = phaseToTime(world.dayPhase);
  world.light = computeLight(world.dayPhase);
  world.ambientTint = computeAmbientTint(world.dayPhase, world.weather);

  const b = biomeAtDistance(distance);
  world.biome = b.biome;
  world.nextBiome = b.next;
  world.biomeProgress = b.progress;
  world.biomeBlend = b.blend;
  world.regionLabel = BIOME_LABELS[b.biome];

  // weather machine
  world.weatherTimer -= dt;
  if (world.weatherTimer <= 0) {
    world.weather = pickWeather(world.biome, world.timeOfDay);
    world.weatherTimer = 10 + Math.random() * 18;
  }

  const targetRain =
    world.weather === 'rain' ? 0.65 : world.weather === 'storm' ? 1 : world.weather === 'overcast' ? 0.08 : 0;
  world.rainIntensity += (targetRain - world.rainIntensity) * Math.min(1, dt * 1.5);

  world.wind =
    0.15 +
    Math.sin(distance * 0.01) * 0.1 +
    (world.weather === 'storm' ? 0.55 : world.weather === 'rain' ? 0.3 : 0) +
    (world.biome === 'simien_mountains' ? 0.2 : 0);
}

function phaseToTime(p: number): TimeOfDay {
  if (p < 0.2) return 'dawn';
  if (p < 0.5) return 'day';
  if (p < 0.68) return 'sunset';
  return 'night';
}

function computeLight(p: number): number {
  // smooth brightness curve
  if (p < 0.15) return 0.35 + (p / 0.15) * 0.5;
  if (p < 0.5) return 0.85 + Math.sin(((p - 0.15) / 0.35) * Math.PI) * 0.15;
  if (p < 0.7) return 0.9 - ((p - 0.5) / 0.2) * 0.45;
  if (p < 0.85) return 0.45 - ((p - 0.7) / 0.15) * 0.2;
  return 0.25 + ((p - 0.85) / 0.15) * 0.15;
}

function computeAmbientTint(p: number, weather: Weather): string {
  if (weather === 'storm') return 'rgba(30,40,70,0.22)';
  if (weather === 'rain') return 'rgba(40,55,80,0.14)';
  if (weather === 'overcast') return 'rgba(70,75,90,0.12)';

  if (p < 0.2) return 'rgba(255,160,100,0.12)'; // dawn peach
  if (p < 0.5) return weather === 'golden' ? 'rgba(255,200,80,0.1)' : 'rgba(255,240,200,0.04)';
  if (p < 0.7) return 'rgba(255,100,40,0.16)'; // sunset
  return 'rgba(20,30,80,0.28)'; // night blue
}

function pickWeather(biome: Biome, tod: TimeOfDay): Weather {
  const roll = Math.random();
  if (tod === 'night') {
    if (biome === 'blue_nile' && roll < 0.35) return 'rain';
    if (roll < 0.15) return 'overcast';
    return 'clear';
  }
  if (tod === 'sunset') {
    if (roll < 0.45) return 'golden';
    if (roll < 0.6) return 'clear';
    if (roll < 0.8) return 'overcast';
    return 'rain';
  }
  if (biome === 'simien_mountains') {
    if (roll < 0.3) return 'storm';
    if (roll < 0.55) return 'overcast';
    if (roll < 0.7) return 'rain';
    return 'clear';
  }
  if (biome === 'blue_nile') {
    if (roll < 0.35) return 'rain';
    if (roll < 0.5) return 'storm';
    if (roll < 0.7) return 'clear';
    return 'golden';
  }
  if (biome === 'addis_ababa') {
    if (roll < 0.2) return 'rain';
    if (roll < 0.4) return 'overcast';
    return 'clear';
  }
  // highlands / village
  if (roll < 0.15) return 'rain';
  if (roll < 0.3) return 'golden';
  if (roll < 0.4) return 'overcast';
  return 'clear';
}

export interface SkyPalette {
  top: string;
  mid: string;
  low: string;
  sun: string;
  sunGlow: string;
  stars: number;
  showMoon: boolean;
  showSun: boolean;
}

export function skyPalette(world: WorldState): SkyPalette {
  const { timeOfDay, weather } = world;
  if (weather === 'storm') {
    return {
      top: '#1a2233',
      mid: '#3a4558',
      low: '#5a6570',
      sun: '#c0c8d0',
      sunGlow: 'rgba(180,190,210,0.2)',
      stars: timeOfDay === 'night' ? 0.4 : 0,
      showMoon: timeOfDay === 'night',
      showSun: timeOfDay !== 'night',
    };
  }
  if (weather === 'rain' || weather === 'overcast') {
    if (timeOfDay === 'night') {
      return {
        top: '#0a1020',
        mid: '#152030',
        low: '#243040',
        sun: '#b0c0d0',
        sunGlow: 'rgba(150,170,200,0.15)',
        stars: 0.3,
        showMoon: true,
        showSun: false,
      };
    }
    return {
      top: '#4a5a6a',
      mid: '#7a8a9a',
      low: '#a8b0b8',
      sun: '#e0e4e8',
      sunGlow: 'rgba(220,220,230,0.25)',
      stars: 0,
      showMoon: false,
      showSun: true,
    };
  }

  switch (timeOfDay) {
    case 'dawn':
      return {
        top: '#2a3a6a',
        mid: '#e07050',
        low: '#f5c090',
        sun: '#ffb070',
        sunGlow: 'rgba(255,150,80,0.45)',
        stars: 0.15,
        showMoon: false,
        showSun: true,
      };
    case 'day':
      return {
        top: weather === 'golden' ? '#3a7ab8' : '#1a6ab0',
        mid: weather === 'golden' ? '#70b8e0' : '#5aafe0',
        low: weather === 'golden' ? '#ffe0a0' : '#c8e8ff',
        sun: '#fff2a0',
        sunGlow: 'rgba(255,230,120,0.5)',
        stars: 0,
        showMoon: false,
        showSun: true,
      };
    case 'sunset':
      return {
        top: '#1a2050',
        mid: '#e04a20',
        low: '#ffb050',
        sun: '#ff9040',
        sunGlow: 'rgba(255,80,30,0.55)',
        stars: 0.2,
        showMoon: false,
        showSun: true,
      };
    case 'night':
    default:
      return {
        top: '#050818',
        mid: '#0e1a3a',
        low: '#1a2848',
        sun: '#e8eef8',
        sunGlow: 'rgba(180,200,255,0.25)',
        stars: 1,
        showMoon: true,
        showSun: false,
      };
  }
}

export interface TerrainPalette {
  mountainFar: string;
  mountainMid: string;
  mountainNear: string;
  fieldLight: string;
  field: string;
  fieldDark: string;
  road: string;
  roadDark: string;
  roadLine: string;
  water: string;
  accent: string;
  snow: boolean;
  urban: boolean;
  riverside: boolean;
}

export function terrainPalette(biome: Biome, blendBiome: Biome, blend: number, light: number): TerrainPalette {
  const a = terrainFor(biome, light);
  if (blend <= 0.01) return a;
  const b = terrainFor(blendBiome, light);
  return lerpTerrain(a, b, blend);
}

function shade(hex: string, light: number): string {
  // simple darken at night
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  const m = 0.35 + light * 0.65;
  const rr = Math.round(r * m);
  const gg = Math.round(g * m);
  const bb = Math.round(b * m);
  return `rgb(${rr},${gg},${bb})`;
}

function terrainFor(biome: Biome, light: number): TerrainPalette {
  const s = (c: string) => shade(c, light);
  switch (biome) {
    case 'addis_ababa':
      return {
        mountainFar: s('#3a3a48'),
        mountainMid: s('#4a4a55'),
        mountainNear: s('#2a2a35'),
        fieldLight: s('#5a6a4a'),
        field: s('#3d4a35'),
        fieldDark: s('#2a3228'),
        road: s('#4a4a4a'),
        roadDark: s('#2e2e2e'),
        roadLine: s('#d4c44a'),
        water: s('#3a7aaa'),
        accent: s('#c45c26'),
        snow: false,
        urban: true,
        riverside: false,
      };
    case 'simien_mountains':
      return {
        mountainFar: s('#4a3a50'),
        mountainMid: s('#5c4a3a'),
        mountainNear: s('#3a2a28'),
        fieldLight: s('#6a7a55'),
        field: s('#4a5a38'),
        fieldDark: s('#2a3a22'),
        road: s('#6b5a48'),
        roadDark: s('#3d3028'),
        roadLine: s('#c4b090'),
        water: s('#4a90b0'),
        accent: s('#e8eef5'),
        snow: true,
        urban: false,
        riverside: false,
      };
    case 'blue_nile':
      return {
        mountainFar: s('#2a4a3a'),
        mountainMid: s('#3a5a40'),
        mountainNear: s('#1a3a28'),
        fieldLight: s('#4a8a40'),
        field: s('#2d6a30'),
        fieldDark: s('#1a4020'),
        road: s('#5a4a38'),
        roadDark: s('#3a2e22'),
        roadLine: s('#b0a070'),
        water: s('#1a8ab0'),
        accent: s('#40c8e0'),
        snow: false,
        urban: false,
        riverside: true,
      };
    case 'traditional_village':
      return {
        mountainFar: s('#5a4030'),
        mountainMid: s('#6a4a35'),
        mountainNear: s('#3d2818'),
        fieldLight: s('#6a8a3a'),
        field: s('#4a6a28'),
        fieldDark: s('#2a4018'),
        road: s('#8a6a45'),
        roadDark: s('#5a4030'),
        roadLine: s('#d4b890'),
        water: s('#3a8aaa'),
        accent: s('#c41e3a'),
        snow: false,
        urban: false,
        riverside: false,
      };
    case 'coffee_highlands':
    default:
      return {
        mountainFar: s('#4a3728'),
        mountainMid: s('#5c4033'),
        mountainNear: s('#3d2914'),
        fieldLight: s('#3d7a35'),
        field: s('#2d5a27'),
        fieldDark: s('#1e3d1a'),
        road: s('#6b4f3a'),
        roadDark: s('#4a3528'),
        roadLine: s('#c4a574'),
        water: s('#2a7a9a'),
        accent: s('#6F4E37'),
        snow: false,
        urban: false,
        riverside: false,
      };
  }
}

function lerpTerrain(a: TerrainPalette, b: TerrainPalette, t: number): TerrainPalette {
  // For non-color fields, switch at midpoint; colors stay from dominant until hard switch
  // Simple approach: pick based on blend threshold for discrete flags, mix isn't perfect for hex
  if (t < 0.5) {
    return {
      ...a,
      snow: t > 0.35 ? b.snow || a.snow : a.snow,
      urban: t > 0.4 ? b.urban : a.urban,
      riverside: t > 0.4 ? b.riverside : a.riverside,
    };
  }
  return {
    ...b,
    snow: b.snow || a.snow,
    urban: b.urban,
    riverside: b.riverside,
  };
}
