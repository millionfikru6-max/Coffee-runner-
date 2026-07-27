import { useCallback, useEffect, useRef, useState } from 'react';
import { GameEngine } from './engine';
import { Scene3D } from '../game3d/scene3d';
import type { Appearance, Effects, GameState, RunSummary, Settings } from './types';
import { loadSettings, saveSettings } from './storage';
import { setAudioEnabled, sfx } from './audio';
import { music } from './music';
import {
  CHARACTERS,
  OUTFITS,
  type Profile,
  type RunReport,
  claimAchievement,
  claimDaily,
  claimMission,
  consumeEquipped,
  loadProfile,
  markTutorialDone,
  purchaseCharacter,
  purchaseOutfit,
  purchasePowerUp,
  recordRun,
  resetProgress,
  selectCharacter,
  selectOutfit,
  toggleEquip,
} from './progression';
import { shareRun } from './share';
import { GestureController } from './controls';
import { PerfGovernor, detectInitialTier } from './perf';

export interface HudData {
  score: number;
  distance: number;
  beans: number;
  coins: number;
  combo: number;
  speed: number;
  region: string;
  weather: string;
  timeOfDay: string;
  specials: number;
  effects: Effects;
  pbDistance: number;
  pbReached: boolean;
}

const initialHud: HudData = {
  score: 0,
  distance: 0,
  beans: 0,
  coins: 0,
  combo: 0,
  speed: 0,
  region: 'Coffee Highlands',
  weather: 'clear',
  timeOfDay: 'day',
  specials: 0,
  effects: { magnet: 0, shield: 0, double: 0, superJump: 0, slow: 0 },
  pbDistance: 0,
  pbReached: false,
};

function buildAppearance(p: Profile): Appearance {
  const c = CHARACTERS.find((x) => x.id === p.character) ?? CHARACTERS[0];
  const o = OUTFITS.find((x) => x.id === p.outfit) ?? OUTFITS[0];
  return {
    skin: c.skin,
    hair: c.hair,
    cloth: o.cloth,
    sash: o.sash,
    trim1: o.trim1,
    trim2: o.trim2,
    glow: o.glow,
  };
}

export function useGameLoop(containerRef: React.RefObject<HTMLDivElement | null>) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const rendererRef = useRef<Scene3D | null>(null);
  const rafRef = useRef<number>(0);
  const lastRef = useRef<number>(0);
  const stateRef = useRef<GameState>('menu');
  const gestureRef = useRef<GestureController | null>(null);
  const perfRef = useRef<PerfGovernor | null>(null);

  const [gameState, setGameState] = useState<GameState>('menu');
  const [hud, setHud] = useState<HudData>(initialHud);
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const settingsRef = useRef<Settings>(settings);
  const [profile, setProfile] = useState<Profile>(() => loadProfile());
  const profileRef = useRef<Profile>(profile);
  const [runReport, setRunReport] = useState<RunReport | null>(null);
  const [lastSummary, setLastSummary] = useState<RunSummary | null>(null);
  const lastSummaryRef = useRef<RunSummary | null>(null);
  const [canRevive, setCanRevive] = useState(false);
  const reviveUsedRef = useRef(false);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  const setState = useCallback((s: GameState) => {
    stateRef.current = s;
    setGameState(s);
  }, []);

  const applyProfile = useCallback((p: Profile) => {
    profileRef.current = p;
    setProfile(p);
  }, []);

  const requestWakeLock = useCallback(async () => {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> };
      };
      if (nav.wakeLock) {
        wakeLockRef.current = await nav.wakeLock.request('screen');
      }
    } catch {
      /* unsupported — fine */
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    try {
      await wakeLockRef.current?.release();
    } catch {
      /* already released */
    }
    wakeLockRef.current = null;
  }, []);

  const syncSize = useCallback(() => {
    const el = containerRef.current;
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    const renderer = rendererRef.current;
    if (!el || !canvas || !engine || !renderer) return;
    const rect = el.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width));
    const h = Math.max(480, Math.floor(rect.height));
    const cap = settingsRef.current.quality === 'low' ? 1.5 : 2;
    const dpr = Math.min(window.devicePixelRatio || 1, cap);
    renderer.resize(w, h, dpr);
    engine.resize(w, h);
  }, [containerRef]);

  useEffect(() => {
    settingsRef.current = settings;
    setAudioEnabled(settings.sound);
    saveSettings(settings);
    music.setEnabled(settings.music);
    if (settings.music && stateRef.current === 'playing') music.start();
    const engine = engineRef.current;
    if (engine) engine.settings = settings;
    rendererRef.current?.setQuality(settings.quality);
    perfRef.current?.setTier(settings.quality, true);
    if (settings.quality === 'low') syncSize();
  }, [settings, syncSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const el = containerRef.current;
    if (!canvas || !el) return;

    const rect = el.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width));
    const h = Math.max(480, Math.floor(rect.height));
    const engine = new GameEngine({ width: w, height: h, settings });
    const renderer = new Scene3D(canvas, buildAppearance(profileRef.current), settings.quality);
    engine.setAppearance(buildAppearance(profileRef.current));
    engineRef.current = engine;
    rendererRef.current = renderer;
    perfRef.current = new PerfGovernor(
      settings.quality === 'low' ? 'low' : detectInitialTier(),
      settings.quality !== 'low',
    );
    syncSize();
    renderer.render(engine);

    const onResize = () => syncSize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep appearance in sync with selections
  useEffect(() => {
    const a = buildAppearance(profile);
    engineRef.current?.setAppearance(a);
    rendererRef.current?.setAppearance(a);
  }, [profile.character, profile.outfit, profile]);

  const endGame = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const snap = engine.snapshot();
    const summary: RunSummary = {
      score: snap.stats.score,
      distance: snap.stats.distance,
      beans: snap.stats.beans,
      coins: snap.stats.coins,
      specials: snap.stats.specials,
      maxCombo: snap.stats.maxCombo,
      jumps: snap.counters.jumps,
      slides: snap.counters.slides,
      nearMisses: snap.counters.nearMisses,
      powerupsUsed: snap.counters.powerupsUsed,
      nightDistance: snap.counters.nightDistance,
      biomesVisited: snap.biomesVisited,
      deathBy: engine.deathBy,
      durationSec: engine.runTime,
    };
    setLastSummary(summary);
    lastSummaryRef.current = summary;
    const { profile: next, report } = recordRun(profileRef.current, summary);
    applyProfile(next);
    setRunReport(report);
    setCanRevive(!reviveUsedRef.current);
    void releaseWakeLock();
    setState('gameover');
  }, [applyProfile, setState]);

  const loop = useCallback(
    (ts: number) => {
      const engine = engineRef.current;
      const renderer = rendererRef.current;
      if (!engine || !renderer) return;

      if (!lastRef.current) lastRef.current = ts;
      let dt = (ts - lastRef.current) / 1000;
      lastRef.current = ts;
      if (dt > 0.1) dt = 0.1;

      const state = stateRef.current;

      if (state === 'playing') {
        gestureRef.current?.tick();
        engine.update(dt);
        if (!engine.alive) {
          endGame();
        }
        if (Math.floor(ts / 100) !== Math.floor((ts - dt * 1000) / 100)) {
          const snap = engine.snapshot();
          setHud({
            score: snap.stats.score,
            distance: snap.stats.distance,
            beans: snap.stats.beans,
            coins: snap.stats.coins,
            combo: snap.stats.combo,
            speed: snap.speed,
            region: snap.world.regionLabel,
            weather: snap.world.weather,
            timeOfDay: snap.world.timeOfDay,
            specials: snap.stats.specials,
            effects: snap.effects,
            pbDistance: snap.pbDistance,
            pbReached: snap.pbReached,
          });
        }
      } else if (state === 'menu' || state === 'paused' || state === 'settings') {
        engine.updateMenu(dt);
      } else if (state === 'gameover') {
        engine.updateMenu(dt * 0.5);
      }

      // Drain gameplay FX cues into the 3D renderer.
      if (engine.fxEvents.length) {
        for (const ev of engine.fxEvents) {
          if (ev.kind === 'collect') renderer.onCollect(ev.type, ev.lane, ev.points, ev.combo);
          else if (ev.kind === 'announce') renderer.announce(ev.text, ev.color);
        }
        engine.fxEvents.length = 0;
      }

      if (state === 'menu' || state === 'settings') renderer.renderMenu(engine);
      else renderer.render(engine);

      // Adaptive quality: measure real frame cost and scale to hold 60fps.
      const gov = perfRef.current;
      if (gov && state === 'playing') {
        const next = gov.sample(dt * 1000);
        if (next) {
          renderer.setRenderScale(next.scale);
          renderer.setQuality(next.tier);
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    },
    [endGame],
  );

  useEffect(() => {
    lastRef.current = 0;
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [loop]);

  const startGame = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const charDef = CHARACTERS.find((c) => c.id === profileRef.current.character);
    const { profile: next, boosters } = consumeEquipped(profileRef.current);
    applyProfile(next);
    engine.reset(settings, boosters, charDef?.perk ?? null, next.stats.bestDistance);
    rendererRef.current?.resetForRun();
    setHud(initialHud);
    setRunReport(null);
    setLastSummary(null);
    setCanRevive(false);
    reviveUsedRef.current = false;
    sfx.start();
    music.start();
    void requestWakeLock();
    setState('playing');
    lastRef.current = 0;
  }, [settings, setState, applyProfile]);

  const pauseGame = useCallback(() => {
    if (stateRef.current !== 'playing') return;
    sfx.ui();
    music.suspend();
    void releaseWakeLock();
    setState('paused');
  }, [setState]);

  const resumeGame = useCallback(() => {
    if (stateRef.current !== 'paused') return;
    sfx.ui();
    music.resume();
    void requestWakeLock();
    lastRef.current = 0;
    setState('playing');
  }, [setState]);

  const toMenu = useCallback(() => {
    sfx.ui();
    const engine = engineRef.current;
    if (engine) {
      engine.reset(settings);
      engine.alive = true;
    }
    music.resume();
    void releaseWakeLock();
    setState('menu');
  }, [settings, setState]);

  const openSettings = useCallback(() => {
    sfx.ui();
    setState('settings');
  }, [setState]);

  /* ------------------------------ progression ------------------------------ */

  const onBuyCharacter = useCallback(
    (id: string) => {
      const next = purchaseCharacter(profileRef.current, id);
      if (next) {
        sfx.coin();
        applyProfile(next);
      } else {
        sfx.ui();
      }
    },
    [applyProfile],
  );

  const onBuyOutfit = useCallback(
    (id: string) => {
      const next = purchaseOutfit(profileRef.current, id);
      if (next) {
        sfx.coin();
        applyProfile(next);
      } else {
        sfx.ui();
      }
    },
    [applyProfile],
  );

  const onBuyPowerUp = useCallback(
    (id: Parameters<typeof purchasePowerUp>[1]) => {
      const next = purchasePowerUp(profileRef.current, id);
      if (next) {
        sfx.coin();
        applyProfile(next);
      } else {
        sfx.ui();
      }
    },
    [applyProfile],
  );

  const onSelectCharacter = useCallback(
    (id: string) => {
      const next = selectCharacter(profileRef.current, id);
      if (next) {
        sfx.ui();
        applyProfile(next);
      }
    },
    [applyProfile],
  );

  const onSelectOutfit = useCallback(
    (id: string) => {
      const next = selectOutfit(profileRef.current, id);
      if (next) {
        sfx.ui();
        applyProfile(next);
      }
    },
    [applyProfile],
  );

  const onToggleEquip = useCallback(
    (id: Parameters<typeof toggleEquip>[1]) => {
      const next = toggleEquip(profileRef.current, id);
      if (next) {
        sfx.lane();
        applyProfile(next);
      }
    },
    [applyProfile],
  );

  const onClaimMission = useCallback(
    (id: string) => {
      const next = claimMission(profileRef.current, id);
      if (next) {
        sfx.coin();
        applyProfile(next);
      }
    },
    [applyProfile],
  );

  const onClaimAchievement = useCallback(
    (id: string) => {
      const next = claimAchievement(profileRef.current, id);
      if (next) {
        sfx.combo();
        applyProfile(next);
      }
    },
    [applyProfile],
  );

  const onClaimDaily = useCallback(() => {
    const { profile: next } = claimDaily(profileRef.current);
    sfx.combo();
    applyProfile(next);
  }, [applyProfile]);

  /* -------------------------------- keyboard ------------------------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const state = stateRef.current;
      const engine = engineRef.current;
      if (!engine) return;

      if (e.key === 'Escape') {
        if (state === 'playing') pauseGame();
        else if (state === 'paused') resumeGame();
        else if (state === 'settings') toMenu();
        return;
      }

      if (state === 'menu' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        startGame();
        return;
      }

      if (state === 'gameover' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        startGame();
        return;
      }

      if (state === 'paused' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        resumeGame();
        return;
      }

      if (state !== 'playing') return;

      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        engine.moveLane(-1);
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        engine.moveLane(1);
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') {
        e.preventDefault();
        engine.jump();
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        engine.slide();
      } else if (e.key === 'p' || e.key === 'P') {
        pauseGame();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pauseGame, resumeGame, startGame, toMenu]);

  /* --------------------------------- touch --------------------------------- */

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ctrl = new GestureController(el, {
      moveLane: (d) => engineRef.current?.moveLane(d),
      jump: () => engineRef.current?.jump(),
      slide: () => engineRef.current?.slide(),
      isPlaying: () => stateRef.current === 'playing',
      isAirborne: () => !!engineRef.current?.player.jumping,
      vibrate: (ms) => {
        if (settingsRef.current.vibrate && navigator.vibrate) navigator.vibrate(ms);
      },
    });
    gestureRef.current = ctrl;
    return () => {
      ctrl.dispose();
      gestureRef.current = null;
    };
  }, [containerRef]);

  const updateSettings = useCallback((partial: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...partial }));
  }, []);

  const onResetProgress = useCallback(() => {
    applyProfile(resetProgress());
    sfx.ui();
  }, [applyProfile]);

  const onTutorialDone = useCallback(() => {
    applyProfile(markTutorialDone(profileRef.current));
  }, [applyProfile]);

  /** Share the last run via Web Share API (image card → text → clipboard) */
  const onShare = useCallback(async (): Promise<'shared' | 'copied' | 'failed'> => {
    const summary = lastSummaryRef.current;
    if (!summary) return 'failed';
    const charDef = CHARACTERS.find((c) => c.id === profileRef.current.character);
    return shareRun(summary, charDef?.name ?? 'Runner', charDef?.emoji ?? '🏃');
  }, []);

  /** Optional rewarded-ad grant: +75 coins, never forced */
  const onAdCoins = useCallback(() => {
    const next: Profile = {
      ...profileRef.current,
      coins: profileRef.current.coins + 75,
      stats: {
        ...profileRef.current.stats,
        totalCoinsEarned: profileRef.current.stats.totalCoinsEarned + 75,
      },
    };
    sfx.adReward();
    applyProfile(next);
  }, [applyProfile]);

  /** Optional rewarded-ad revive: one per run */
  const onRevive = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || reviveUsedRef.current) return;
    reviveUsedRef.current = true;
    setCanRevive(false);
    engine.revive();
    void requestWakeLock();
    lastRef.current = 0;
    setState('playing');
  }, [setState, requestWakeLock]);

  // Android/browser: auto-pause when tab hidden
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && stateRef.current === 'playing') {
        pauseGame();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [pauseGame]);

  return {
    canvasRef,
    gameState,
    hud,
    settings,
    profile,
    runReport,
    lastSummary,
    canRevive,
    startGame,
    pauseGame,
    resumeGame,
    toMenu,
    openSettings,
    updateSettings,
    onBuyCharacter,
    onBuyOutfit,
    onBuyPowerUp,
    onSelectCharacter,
    onSelectOutfit,
    onToggleEquip,
    onClaimMission,
    onClaimAchievement,
    onClaimDaily,
    onResetProgress,
    onAdCoins,
    onRevive,
    onTutorialDone,
    onShare,
  };
}
