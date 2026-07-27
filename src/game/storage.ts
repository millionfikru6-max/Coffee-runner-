import type { HighScore, Settings } from './types';

const HIGH_SCORES_KEY = 'coffee-runner-highscores';
const SETTINGS_KEY = 'coffee-runner-settings';

const DEFAULT_SETTINGS: Settings = {
  sound: true,
  music: true,
  vibrate: true,
  difficulty: 'normal',
  quality: 'high',
  screenShake: true,
  touchButtons: false,
  leftHanded: false,
  reducedMotion: false,
};

export function loadHighScores(): HighScore[] {
  try {
    const raw = localStorage.getItem(HIGH_SCORES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HighScore[];
    return Array.isArray(parsed) ? parsed.slice(0, 10) : [];
  } catch {
    return [];
  }
}

export function saveHighScore(entry: HighScore): HighScore[] {
  const scores = loadHighScores();
  scores.push(entry);
  scores.sort((a, b) => b.score - a.score);
  const top = scores.slice(0, 10);
  localStorage.setItem(HIGH_SCORES_KEY, JSON.stringify(top));
  return top;
}

export function isHighScore(score: number): boolean {
  if (score <= 0) return false;
  const scores = loadHighScores();
  if (scores.length < 10) return true;
  return score > scores[scores.length - 1].score;
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
