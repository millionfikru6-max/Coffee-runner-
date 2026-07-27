import type { Settings } from './types';

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
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Private browsing and full-quota devices throw here. Settings are a
    // convenience, not progress — losing them must never break the game.
  }
}
