import { useEffect, useState } from 'react';
import type { GameState, RunSummary, Settings } from '../game/types';
import { BIOME_LABELS } from '../game/types';
import type { HudData } from '../game/useGameLoop';
import {
  ACHIEVEMENTS,
  CHARACTERS,
  DAILY_REWARDS,
  OUTFITS,
  POWERUPS,
  canClaimDaily,
  dailyRewardForStreak,
  missionDef,
  type Profile,
  type RunReport,
} from '../game/progression';

import { LeaderboardPanel } from './LeaderboardPanel';
import { SaveDataPanel } from './SaveDataPanel';
import { Card, Pill, ProgressBar, Segmented, Sheet, Toggle as UIToggle } from './ui';
import { TouchControls } from './TouchControls';

type Panel = null | 'runner' | 'shop' | 'missions' | 'awards' | 'stats' | 'leaderboard' | 'save';

interface Props {
  gameState: GameState;
  hud: HudData;
  settings: Settings;
  profile: Profile;
  runReport: RunReport | null;
  lastSummary: RunSummary | null;
  canRevive: boolean;
  onPlay: () => void;
  onPause: () => void;
  onResume: () => void;
  onMenu: () => void;
  onSettings: () => void;
  onUpdateSettings: (p: Partial<Settings>) => void;
  onBuyCharacter: (id: string) => void;
  onBuyOutfit: (id: string) => void;
  onBuyPowerUp: (id: (typeof POWERUPS)[number]['id']) => void;
  onSelectCharacter: (id: string) => void;
  onSelectOutfit: (id: string) => void;
  onToggleEquip: (id: (typeof POWERUPS)[number]['id']) => void;
  onClaimMission: (id: string) => void;
  onClaimAchievement: (id: string) => void;
  onClaimDaily: () => void;
  onResetProgress: () => void;
  onAdCoins: () => void;
  onRevive: () => void;
  onTutorialDone: () => void;
  onShare: () => Promise<'shared' | 'copied' | 'failed'>;
  onImportSave: (code: string) => boolean;
  onMoveLane: (dir: -1 | 1) => void;
  onJump: () => void;
  onSlide: () => void;
}

export function GameUI(props: Props) {
  const { gameState, hud, profile, settings } = props;
  const [panel, setPanel] = useState<Panel>(null);
  const [dailyOpen, setDailyOpen] = useState(false);
  const [adMode, setAdMode] = useState<null | 'coins' | 'revive'>(null);
  const [toast, setToast] = useState<{ msg: string; key: number } | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      // Not supported on iOS Safari; failing quietly is the right call.
      void document.documentElement.requestFullscreen?.().catch(() => {});
    }
  };

  const handlePlay = () => {
    if (!profile.tutorialDone) {
      setTutorialOpen(true);
      return;
    }
    props.onPlay();
  };

  useEffect(() => {
    if (gameState !== 'menu') setPanel(null);
  }, [gameState]);

  const showToast = (msg: string) => setToast({ msg, key: Date.now() });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const missionsReady = profile.missions.filter((m) => {
    const def = missionDef(m.id);
    return def && !m.claimed && m.progress >= def.target;
  }).length;
  const awardsReady = ACHIEVEMENTS.filter(
    (a) => !profile.achievements[a.id] && a.test(profile.stats, profile),
  ).length;
  const dailyReady = canClaimDaily(profile);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col">
      {/* ------------------------------- HUD ------------------------------- */}
      {(gameState === 'playing' || gameState === 'paused') && (
        <div className="pointer-events-auto flex items-start justify-between p-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4">
          <div className="rounded-2xl bg-black/40 px-3 py-2 text-white shadow-lg ring-1 ring-white/10 backdrop-blur-md">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200/80">
              Score
            </div>
            <div className="font-display text-2xl font-bold tabular-nums leading-none tracking-tight">
              {hud.score.toLocaleString()}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-white/80">
              <span>{Math.floor(hud.distance)}m</span>
              <span className="text-amber-200">☕ {hud.beans}</span>
              <span className="text-yellow-300">● {hud.coins}</span>
              {hud.specials > 0 && <span className="text-orange-300">✦ {hud.specials}</span>}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] font-medium text-amber-100/70">
              <span>{regionIcon(hud.region)}</span>
              <span className="max-w-[9rem] truncate">{hud.region}</span>
              <span className="text-white/30">·</span>
              <span>{weatherIcon(hud.weather, hud.timeOfDay)}</span>
            </div>
            {hud.pbDistance > 40 && (
              <div
                className={`mt-1 text-[10px] font-bold ${
                  hud.pbReached ? 'text-emerald-300' : 'text-lime-300/80'
                }`}
              >
                {hud.pbReached
                  ? `🚩 PB beaten by +${Math.floor(hud.distance - hud.pbDistance)}m`
                  : `🚩 Your best in ${Math.ceil(hud.pbDistance - hud.distance)}m`}
              </div>
            )}
          </div>

          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={props.onPause}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white shadow-lg ring-1 ring-white/15 backdrop-blur-md transition active:scale-95"
              aria-label="Pause"
            >
              <PauseIcon />
            </button>
            {hud.combo > 1 && (
              <div className="animate-pulse rounded-full bg-gradient-to-r from-amber-500 to-orange-600 px-3 py-1 text-sm font-bold text-white shadow-lg">
                {hud.combo}x
              </div>
            )}
            <EffectChips hud={hud} />
          </div>
        </div>
      )}

      {/* ------------------------------- Menu ------------------------------- */}
      {gameState === 'menu' && !panel && (
        <div className="pointer-events-auto flex flex-1 flex-col overflow-y-auto bg-gradient-to-b from-[#1a1208]/70 via-[#2a1810]/30 to-[#1a1208]/85 px-5 py-6">
          <div className="flex items-center justify-between">
            <WalletBar profile={profile} />
            <DailyButton ready={dailyReady} streak={profile.daily.streak} onClick={() => setDailyOpen(true)} />
          </div>

          <div className="anim-fade-up mt-3 text-center" style={{ animationDelay: '0ms' }}>
            <CoffeeLogo />
            <h1 className="font-display text-4xl font-black leading-tight text-white drop-shadow-[0_2px_12px_rgba(255,150,40,0.35)] sm:text-5xl">
              Coffee Runner
            </h1>
            <div className="flag-stripe mx-auto mt-1.5 h-1.5 w-36 rounded-full" />
            <p className="font-display mt-1.5 text-sm font-semibold tracking-wide text-amber-200/90">
              The Heart of Ethiopia
            </p>
          </div>

          <div className="anim-fade-up mx-auto mt-4 w-full max-w-xs" style={{ animationDelay: '90ms' }}>
            <button
              type="button"
              onClick={handlePlay}
              className="btn-shine w-full rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-red-600 py-4 text-lg font-black tracking-wide text-white shadow-xl shadow-orange-900/50 ring-1 ring-amber-300/40 transition hover:brightness-110 active:scale-[0.97]"
            >
              ▶ PLAY
            </button>
          </div>

          {/* booster loadout */}
          <div className="mx-auto mt-3 w-full max-w-sm">
            <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-200/60">
              <span>Boosters</span>
              <span>{profile.equipped.length}/2 equipped</span>
            </div>
            <div className="flex gap-1.5">
              {POWERUPS.map((pw) => {
                const owned = profile.inventory[pw.id] ?? 0;
                const equipped = profile.equipped.includes(pw.id);
                return (
                  <button
                    key={pw.id}
                    type="button"
                    onClick={() => props.onToggleEquip(pw.id)}
                    disabled={owned <= 0}
                    className={`relative flex-1 rounded-xl px-1 py-2 text-center text-lg transition active:scale-95 ${
                      equipped
                        ? 'bg-amber-500/30 ring-2 ring-amber-400'
                        : owned > 0
                          ? 'bg-white/10 ring-1 ring-white/15 hover:bg-white/15'
                          : 'bg-white/5 opacity-40 ring-1 ring-white/5'
                    }`}
                    title={pw.desc}
                  >
                    <span>{pw.emoji}</span>
                    <span className="absolute right-1 top-0.5 text-[9px] font-bold text-amber-200">
                      {owned}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* nav tiles */}
          <div className="mx-auto mt-4 grid w-full max-w-sm grid-cols-3 gap-2">
            <NavTile emoji="🏃🏾" label="Runner" onClick={() => setPanel('runner')} />
            <NavTile emoji="🛒" label="Shop" onClick={() => setPanel('shop')} />
            <NavTile emoji="🎯" label="Missions" badge={missionsReady} onClick={() => setPanel('missions')} />
            <NavTile emoji="🎖️" label="Awards" badge={awardsReady} onClick={() => setPanel('awards')} />
            <NavTile emoji="🏆" label="Ranks" onClick={() => setPanel('leaderboard')} />
            <NavTile emoji="📊" label="Stats" onClick={() => setPanel('stats')} />
            <NavTile emoji="⚙️" label="Settings" onClick={props.onSettings} />
          </div>

          {/*
            window.close() only works for script-opened windows, so the old
            "Exit" button did nothing in a normal tab. Offer fullscreen
            instead, which is what players actually want on a phone.
          */}
          <div className="mx-auto mt-4 flex w-full max-w-xs flex-col gap-2">
            <MenuButton onClick={toggleFullscreen}>
              {isFullscreen ? '🗗 Exit Fullscreen' : '⛶ Play Fullscreen'}
            </MenuButton>
          </div>

          <p className="mt-3 text-center text-[10px] text-white/40">
            Progress saves automatically · Swipe or Arrow Keys to run
          </p>
        </div>
      )}

      {/* ------------------------------ Panels ------------------------------ */}
      {gameState === 'menu' && panel === 'runner' && (
        <RunnerPanel onBack={() => setPanel(null)} {...props} />
      )}
      {gameState === 'menu' && panel === 'shop' && (
        <ShopPanel onBack={() => setPanel(null)} onFreeCoins={() => setAdMode('coins')} {...props} />
      )}
      {gameState === 'menu' && panel === 'missions' && (
        <MissionsPanel profile={profile} onBack={() => setPanel(null)} onClaim={props.onClaimMission} />
      )}
      {gameState === 'menu' && panel === 'awards' && (
        <AwardsPanel profile={profile} onBack={() => setPanel(null)} onClaim={props.onClaimAchievement} />
      )}
      {gameState === 'menu' && panel === 'stats' && (
        <StatsPanel profile={profile} onBack={() => setPanel(null)} />
      )}
      {gameState === 'menu' && panel === 'leaderboard' && (
        <LeaderboardPanel profile={profile} onBack={() => setPanel(null)} />
      )}
      {panel === 'save' && (
        <SaveDataPanel
          profile={profile}
          onBack={() => setPanel(null)}
          onImport={props.onImportSave}
          onReset={props.onResetProgress}
          onToast={showToast}
        />
      )}

      {/* --------------------------- Daily modal ---------------------------- */}
      {dailyOpen && gameState === 'menu' && (
        <DailyModal
          profile={profile}
          onClaim={() => {
            props.onClaimDaily();
            setDailyOpen(false);
          }}
          onClose={() => setDailyOpen(false)}
        />
      )}

      {/* ----------------------------- Settings ----------------------------- */}
      {gameState === 'settings' && (
        <div data-ui className="pointer-events-auto absolute inset-0 z-20 flex flex-col bg-[#0d0904]/85 backdrop-blur-md">
          <div className="anim-fade-up mx-auto flex h-full w-full max-w-md flex-col overflow-hidden bg-gradient-to-b from-[#33210f] to-[#150e06] shadow-2xl sm:my-auto sm:h-auto sm:max-h-[92%] sm:rounded-3xl sm:ring-1 sm:ring-amber-700/30">
            <div className="flex shrink-0 items-center gap-3 border-b border-amber-900/40 bg-black/25 px-4 pb-3 pt-[max(0.9rem,env(safe-area-inset-top))]">
              <button
                type="button"
                data-ui
                onClick={props.onMenu}
                aria-label="Back"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-xl text-white ring-1 ring-white/10 transition active:scale-95"
              >
                ←
              </button>
              <h2 className="font-display flex items-center gap-2 text-xl font-bold text-amber-50">
                ⚙️ Settings
              </h2>
            </div>

            <div
              data-ui
              className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              <section className="space-y-2">
                <SectionLabel>Audio</SectionLabel>
                <UIToggle
                  label="Sound Effects"
                  hint="Pickups, jumps and impacts"
                  value={settings.sound}
                  onChange={(v) => props.onUpdateSettings({ sound: v })}
                />
                <UIToggle
                  label="Music"
                  hint="Adaptive masinko & kebero score"
                  value={settings.music}
                  onChange={(v) => props.onUpdateSettings({ music: v })}
                />
              </section>

              <section className="space-y-2">
                <SectionLabel>Feedback</SectionLabel>
                <UIToggle
                  label="Vibration"
                  hint="Haptic pulse on swipes and hits"
                  value={settings.vibrate}
                  onChange={(v) => props.onUpdateSettings({ vibrate: v })}
                />
                <UIToggle
                  label="Screen Shake"
                  hint="Turn off if motion bothers you"
                  value={settings.screenShake}
                  onChange={(v) => props.onUpdateSettings({ screenShake: v })}
                />
              </section>

              <section className="space-y-3">
                <SectionLabel>Performance</SectionLabel>
                <Segmented
                  label="Graphics Quality"
                  hint="Auto-adjusts to hold 60fps"
                  value={settings.quality}
                  onChange={(q) => props.onUpdateSettings({ quality: q })}
                  options={[
                    { value: 'high', label: '✨ High' },
                    { value: 'low', label: '⚡ Fast' },
                  ]}
                />
                <Segmented
                  label="Difficulty"
                  value={settings.difficulty}
                  onChange={(d) => props.onUpdateSettings({ difficulty: d })}
                  options={[
                    { value: 'easy', label: 'Easy' },
                    { value: 'normal', label: 'Normal' },
                    { value: 'hard', label: 'Hard' },
                  ]}
                />
              </section>

              <section className="space-y-2">
                <SectionLabel>Controls & Accessibility</SectionLabel>
                <UIToggle
                  label="On-Screen Buttons"
                  hint="Show a D-pad as well as swipe gestures"
                  value={settings.touchButtons}
                  onChange={(v) => props.onUpdateSettings({ touchButtons: v })}
                />
                {settings.touchButtons && (
                  <UIToggle
                    label="Left-Handed Layout"
                    hint="Mirror the on-screen buttons"
                    value={settings.leftHanded}
                    onChange={(v) => props.onUpdateSettings({ leftHanded: v })}
                  />
                )}
                <UIToggle
                  label="Reduced Motion"
                  hint="Calmer camera, no speed lines or shake"
                  value={settings.reducedMotion}
                  onChange={(v) => props.onUpdateSettings({ reducedMotion: v })}
                />
              </section>

              <section className="space-y-2">
                <SectionLabel>Data</SectionLabel>
                <button
                  type="button"
                  data-ui
                  onClick={() => setPanel('save')}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl bg-white/[0.06] px-4 py-3 text-left ring-1 ring-white/10 transition active:scale-[0.99]"
                >
                  <span>
                    <span className="block text-sm font-semibold text-amber-50">💾 Save Data</span>
                    <span className="block text-[11px] text-white/45">
                      Back up, transfer or reset your progress
                    </span>
                  </span>
                  <span className="text-white/40">›</span>
                </button>
              </section>

              <p className="pb-2 text-center text-[10px] leading-relaxed text-white/35">
                Progress saves automatically · Ads are always optional, never forced
              </p>
              <div className="h-[max(0.5rem,env(safe-area-inset-bottom))]" />
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------ Pause ------------------------------- */}
      {gameState === 'paused' && (
        <div className="pointer-events-auto flex flex-1 items-center justify-center bg-black/55 p-6 backdrop-blur-[2px]">
          <div className="w-full max-w-xs rounded-3xl bg-gradient-to-b from-[#3d2914]/95 to-[#1a1208]/95 p-6 text-center shadow-2xl ring-1 ring-amber-600/30">
            <h2 className="font-display text-3xl font-bold text-white">Paused</h2>
            <p className="mt-1 text-sm text-white/60">The highlands can wait…</p>
            <div className="mt-6 flex flex-col gap-3">
              <MenuButton primary onClick={props.onResume}>Resume</MenuButton>
              <MenuButton onClick={props.onPlay}>Restart</MenuButton>
              <MenuButton onClick={props.onMenu}>Main Menu</MenuButton>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------- Game over ----------------------------- */}
      {gameState === 'gameover' && props.lastSummary && (
        <GameOverScreen
          summary={props.lastSummary}
          report={props.runReport}
          canRevive={props.canRevive}
          onReviveAd={() => setAdMode('revive')}
          onShare={async () => {
            const res = await props.onShare();
            if (res === 'shared') showToast('Run shared! 🎉');
            else if (res === 'copied') showToast('Score copied to clipboard 📋');
            else showToast('Sharing unavailable here');
          }}
          onPlay={props.onPlay}
          onMenu={props.onMenu}
        />
      )}

      {/* optional on-screen controls */}
      {gameState === 'playing' && settings.touchButtons && (
        <TouchControls
          leftHanded={settings.leftHanded}
          onLeft={() => props.onMoveLane(-1)}
          onRight={() => props.onMoveLane(1)}
          onJump={props.onJump}
          onSlide={props.onSlide}
          vibrate={(ms) => {
            if (settings.vibrate && navigator.vibrate) navigator.vibrate(ms);
          }}
        />
      )}

      {/* touch hints */}
      {gameState === 'playing' && hud.distance < 25 && !settings.touchButtons && (
        <div className="pointer-events-none absolute bottom-6 left-0 right-0 flex justify-center px-4">
          <div className="rounded-full bg-black/45 px-4 py-2 text-center text-xs text-white/85 backdrop-blur">
            Swipe ← → lanes · ↑ jump · ↓ slide
          </div>
        </div>
      )}

      {/* toast */}
      {toast && (
        <div
          key={toast.key}
          className="anim-pop pointer-events-none absolute left-1/2 top-[max(4.5rem,calc(env(safe-area-inset-top)+4rem))] z-30 -translate-x-1/2"
        >
          <div className="rounded-full bg-gradient-to-r from-emerald-500 to-green-600 px-4 py-2 text-sm font-bold text-white shadow-xl ring-1 ring-emerald-300/40">
            {toast.msg}
          </div>
        </div>
      )}

      {/* optional rewarded ad (never forced) */}
      {adMode && (
        <RewardedAdModal
          mode={adMode}
          onClose={() => setAdMode(null)}
          onComplete={() => {
            if (adMode === 'coins') {
              props.onAdCoins();
              showToast('+75 🪙 received!');
            } else {
              props.onRevive();
            }
            setAdMode(null);
          }}
        />
      )}

      {/* first-run tutorial */}
      {tutorialOpen && (
        <TutorialOverlay
          onDone={() => {
            setTutorialOpen(false);
            props.onTutorialDone();
            props.onPlay();
          }}
        />
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200/50">
      {children}
    </div>
  );
}

/* ================================ sub-screens ================================ */

function GameOverScreen({
  summary,
  report,
  canRevive,
  onReviveAd,
  onShare,
  onPlay,
  onMenu,
}: {
  summary: RunSummary;
  report: RunReport | null;
  canRevive: boolean;
  onReviveAd: () => void;
  onShare: () => void;
  onPlay: () => void;
  onMenu: () => void;
}) {
  const region = summary.biomesVisited.length
    ? BIOME_LABELS[summary.biomesVisited[summary.biomesVisited.length - 1]]
    : 'Coffee Highlands';
  return (
    <div className="pointer-events-auto flex flex-1 items-center justify-center overflow-y-auto bg-gradient-to-b from-black/50 via-[#2a1008]/70 to-black/80 p-5 backdrop-blur-[2px]">
      <div className="w-full max-w-sm rounded-3xl bg-gradient-to-b from-[#4a2810] to-[#1a1008] p-6 shadow-2xl ring-1 ring-orange-700/40">
        <div className="text-center">
          <div className="text-4xl">💥</div>
          <h2 className="font-display mt-1 text-3xl font-black text-white">Game Over</h2>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            {report?.newBest && (
              <span className="animate-bounce rounded-full bg-gradient-to-r from-yellow-400 to-amber-500 px-3 py-1 text-xs font-bold text-[#1a1208]">
                NEW BEST SCORE!
              </span>
            )}
            <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-200 ring-1 ring-amber-500/30">
              +{report?.coinsEarned ?? summary.coins} 🪙 to wallet
            </span>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-black/30 px-3 py-2 ring-1 ring-white/10">
            <div className="text-[10px] uppercase tracking-wider text-white/50">Score</div>
            <div className="font-display text-xl font-black text-amber-200">
              <ScoreCountUp target={summary.score} />
            </div>
          </div>
          <StatCard label="Distance" value={`${Math.floor(summary.distance)}m`} />
          <StatCard label="Beans" value={String(summary.beans)} />
          <StatCard label="Max Combo" value={`${summary.maxCombo}x`} />
          <StatCard label="Reached" value={region} />
          <StatCard label="Coins" value={`🪙 ${summary.coins}`} />
        </div>

        {report && report.newlyCompleted.length > 0 && (
          <div className="mt-3 rounded-2xl bg-emerald-500/15 p-3 ring-1 ring-emerald-400/30">
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-300">
              🏆 Achievements unlocked
            </div>
            <ul className="mt-1 space-y-0.5 text-sm text-emerald-100">
              {report.newlyCompleted.map((a) => (
                <li key={a.id}>
                  {a.name} <span className="text-emerald-300">+{a.gems} 💎</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {report && report.missionsReady > 0 && (
          <p className="mt-2 text-center text-xs text-amber-200/80">
            🎯 {report.missionsReady} mission{report.missionsReady > 1 ? 's' : ''} ready to claim!
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2">
          {canRevive && (
            <button
              type="button"
              onClick={onReviveAd}
              className="anim-pop w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 py-3.5 text-base font-black text-white shadow-lg shadow-emerald-900/40 ring-1 ring-emerald-300/40 transition hover:brightness-110 active:scale-[0.98]"
            >
              ▶ Continue — watch a short ad
            </button>
          )}
          <MenuButton primary onClick={onPlay}>Run Again</MenuButton>
          <div className="grid grid-cols-2 gap-2">
            <MenuButton onClick={onShare}>📤 Share Run</MenuButton>
            <MenuButton onClick={onMenu}>Main Menu</MenuButton>
          </div>
        </div>
        {canRevive && (
          <p className="mt-2 text-center text-[10px] text-white/35">
            Optional rewarded ad · one revive per run · you keep your score
          </p>
        )}
      </div>
    </div>
  );
}

function RunnerPanel({
  profile,
  onBack,
  onBuyCharacter,
  onSelectCharacter,
  onBuyOutfit,
  onSelectOutfit,
}: Pick<
  Props,
  'profile' | 'onBuyCharacter' | 'onSelectCharacter' | 'onBuyOutfit' | 'onSelectOutfit'
> & { onBack: () => void }) {
  return (
    <PanelShell title="Choose Your Runner" onBack={onBack}>
      <div className="grid grid-cols-2 gap-2">
        {CHARACTERS.map((c) => {
          const owned = profile.ownedCharacters.includes(c.id);
          const selected = profile.character === c.id;
          const canAfford = profile.coins >= c.costCoins && profile.gems >= c.costGems;
          return (
            <div
              key={c.id}
              className={`rounded-2xl p-3 ring-1 ${
                selected ? 'bg-amber-500/20 ring-amber-400/60' : 'bg-black/30 ring-white/10'
              }`}
            >
              <div className="text-2xl">{c.emoji}</div>
              <div className="font-display mt-1 font-bold text-white">{c.name}</div>
              <div className="text-[10px] uppercase tracking-wider text-white/40">{c.title}</div>
              <div className="mt-1 text-[11px] text-amber-200/90">{c.perkLabel}</div>
              <div className="mt-2">
                {selected ? (
                  <Badge tone="amber">Selected</Badge>
                ) : owned ? (
                  <button
                    type="button"
                    onClick={() => onSelectCharacter(c.id)}
                    className="w-full rounded-xl bg-white/10 py-1.5 text-xs font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/20 active:scale-95"
                  >
                    Select
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onBuyCharacter(c.id)}
                    disabled={!canAfford}
                    className={`w-full rounded-xl py-1.5 text-xs font-bold transition active:scale-95 ${
                      canAfford
                        ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white'
                        : 'bg-white/5 text-white/30'
                    }`}
                  >
                    {c.costGems > 0 ? `${c.costGems} 💎` : `${c.costCoins} 🪙`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200/60">
        Outfits
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {OUTFITS.map((o) => {
          const owned = profile.ownedOutfits.includes(o.id);
          const selected = profile.outfit === o.id;
          const canAfford = profile.coins >= o.costCoins && profile.gems >= o.costGems;
          return (
            <div
              key={o.id}
              className={`flex items-center gap-2 rounded-2xl p-2.5 ring-1 ${
                selected ? 'bg-amber-500/20 ring-amber-400/60' : 'bg-black/30 ring-white/10'
              }`}
            >
              <span
                className="h-8 w-8 shrink-0 rounded-full ring-2 ring-white/20"
                style={{ background: o.swatch }}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-white">{o.name}</div>
                <div className="truncate text-[10px] text-white/40">{o.desc}</div>
              </div>
              {selected ? (
                <Badge tone="amber">On</Badge>
              ) : owned ? (
                <button
                  type="button"
                  onClick={() => onSelectOutfit(o.id)}
                  className="rounded-lg bg-white/10 px-2 py-1 text-[10px] font-semibold text-white ring-1 ring-white/15 active:scale-95"
                >
                  Wear
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onBuyOutfit(o.id)}
                  disabled={!canAfford}
                  className={`rounded-lg px-2 py-1 text-[10px] font-bold active:scale-95 ${
                    canAfford ? 'bg-amber-500 text-[#1a1208]' : 'bg-white/5 text-white/30'
                  }`}
                >
                  {o.costGems > 0 ? `${o.costGems}💎` : `${o.costCoins}🪙`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </PanelShell>
  );
}

function ShopPanel({
  profile,
  onBack,
  onBuyPowerUp,
  onBuyCharacter,
  onBuyOutfit,
  onFreeCoins,
}: Pick<Props, 'profile' | 'onBuyPowerUp' | 'onBuyCharacter' | 'onBuyOutfit'> & {
  onBack: () => void;
  onFreeCoins: () => void;
}) {
  return (
    <PanelShell title="Market" onBack={onBack}>
      {/* optional rewarded-ad offer — never forced */}
      <div className="mb-4 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-600/30 to-teal-600/30 p-3 ring-1 ring-emerald-400/40">
        <span className="text-2xl">🎬</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-white">Free Coins</div>
          <div className="text-[11px] text-white/60">Watch a short optional ad · +75 🪙</div>
        </div>
        <button
          type="button"
          onClick={onFreeCoins}
          className="rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 px-3 py-2 text-xs font-bold text-white shadow transition active:scale-95"
        >
          Watch
        </button>
      </div>

      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200/60">
        Power-ups
      </div>
      <div className="mt-2 space-y-2">
        {POWERUPS.map((pw) => (
          <div key={pw.id} className="flex items-center gap-3 rounded-2xl bg-black/30 p-3 ring-1 ring-white/10">
            <span className="text-2xl">{pw.emoji}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-white">
                {pw.name}
                <span className="ml-2 text-[10px] font-semibold text-amber-300/80">
                  owned ×{profile.inventory[pw.id] ?? 0}
                </span>
              </div>
              <div className="text-[11px] text-white/50">{pw.desc}</div>
            </div>
            <button
              type="button"
              onClick={() => onBuyPowerUp(pw.id)}
              disabled={profile.coins < pw.costCoins}
              className={`rounded-xl px-3 py-2 text-xs font-bold transition active:scale-95 ${
                profile.coins >= pw.costCoins
                  ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white'
                  : 'bg-white/5 text-white/30'
              }`}
            >
              {pw.costCoins} 🪙
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200/60">
        Also available
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {CHARACTERS.filter((c) => !profile.ownedCharacters.includes(c.id)).map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onBuyCharacter(c.id)}
            disabled={profile.coins < c.costCoins || profile.gems < c.costGems}
            className={`rounded-2xl p-3 text-left ring-1 ring-white/10 transition active:scale-95 ${
              profile.coins >= c.costCoins && profile.gems >= c.costGems
                ? 'bg-black/30 hover:bg-black/40'
                : 'bg-black/20 opacity-50'
            }`}
          >
            <span className="text-xl">{c.emoji}</span>
            <div className="text-sm font-bold text-white">{c.name}</div>
            <div className="text-[10px] text-amber-200/80">
              {c.costGems > 0 ? `${c.costGems} 💎` : `${c.costCoins} 🪙`}
            </div>
          </button>
        ))}
        {OUTFITS.filter((o) => !profile.ownedOutfits.includes(o.id)).map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onBuyOutfit(o.id)}
            disabled={profile.coins < o.costCoins || profile.gems < o.costGems}
            className={`rounded-2xl p-3 text-left ring-1 ring-white/10 transition active:scale-95 ${
              profile.coins >= o.costCoins && profile.gems >= o.costGems
                ? 'bg-black/30 hover:bg-black/40'
                : 'bg-black/20 opacity-50'
            }`}
          >
            <span className="inline-block h-6 w-6 rounded-full ring-2 ring-white/20" style={{ background: o.swatch }} />
            <div className="text-sm font-bold text-white">{o.name}</div>
            <div className="text-[10px] text-amber-200/80">
              {o.costGems > 0 ? `${o.costGems} 💎` : `${o.costCoins} 🪙`}
            </div>
          </button>
        ))}
        {CHARACTERS.every((c) => profile.ownedCharacters.includes(c.id)) &&
          OUTFITS.every((o) => profile.ownedOutfits.includes(o.id)) && (
            <p className="col-span-2 text-center text-xs text-white/40">
              You own everything — legend of the highlands! ☕
            </p>
          )}
      </div>
    </PanelShell>
  );
}

function MissionsPanel({
  profile,
  onBack,
  onClaim,
}: {
  profile: Profile;
  onBack: () => void;
  onClaim: (id: string) => void;
}) {
  const claimable = profile.missions.filter((m) => {
    const d = missionDef(m.id);
    return d && !m.claimed && m.progress >= d.target;
  }).length;
  const doneCount = profile.missions.filter((m) => m.claimed).length;

  // Missions reset at local midnight; show how long is left.
  const msLeft = (() => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight.getTime() - now.getTime();
  })();
  const hrsLeft = Math.floor(msLeft / 3_600_000);
  const minsLeft = Math.floor((msLeft % 3_600_000) / 60_000);

  const tierMeta: Record<string, { label: string; tone: 'green' | 'gold' | 'red' }> = {
    easy: { label: 'Easy', tone: 'green' },
    medium: { label: 'Medium', tone: 'gold' },
    hard: { label: 'Hard', tone: 'red' },
  };

  return (
    <Sheet
      title="Daily Missions"
      subtitle={`Resets in ${hrsLeft}h ${minsLeft}m`}
      icon="🎯"
      onBack={onBack}
      right={<Pill tone={claimable > 0 ? 'green' : 'neutral'}>{doneCount}/3</Pill>}
    >
      <div className="space-y-2.5">
        {profile.missions.map((m) => {
          const def = missionDef(m.id);
          if (!def) return null;
          const ready = m.progress >= def.target && !m.claimed;
          const tier = tierMeta[def.tier] ?? tierMeta.medium;
          return (
            <Card key={m.id} glow={ready}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-1.5">
                    <Pill tone={tier.tone}>{tier.label}</Pill>
                    {def.rewardGems > 0 && <Pill tone="blue">💎 {def.rewardGems}</Pill>}
                    {def.rewardCoins > 0 && <Pill tone="gold">🪙 {def.rewardCoins}</Pill>}
                  </div>
                  <div className="text-sm font-semibold leading-snug text-amber-50">
                    {def.label}
                  </div>
                </div>
                {m.claimed ? (
                  <Pill tone="green">✓ Claimed</Pill>
                ) : ready ? (
                  <button
                    type="button"
                    data-ui
                    onClick={() => onClaim(m.id)}
                    className="shrink-0 animate-pulse rounded-xl bg-gradient-to-b from-emerald-400 to-green-600 px-3 py-2 text-xs font-bold text-white shadow-lg ring-1 ring-emerald-300/40 active:scale-95"
                  >
                    Claim
                  </button>
                ) : null}
              </div>
              <div className="mt-2.5">
                <ProgressBar
                  value={Math.min(m.progress, def.target)}
                  max={def.target}
                  tone={m.claimed || ready ? 'emerald' : 'amber'}
                />
              </div>
            </Card>
          );
        })}
      </div>

      <p className="mt-4 text-center text-[10px] leading-relaxed text-white/35">
        One easy, one medium and one hard mission every day. Progress carries
        across runs and saves automatically.
      </p>
    </Sheet>
  );
}

function AwardsPanel({
  profile,
  onBack,
  onClaim,
}: {
  profile: Profile;
  onBack: () => void;
  onClaim: (id: string) => void;
}) {
  return (
    <PanelShell title="Achievements" onBack={onBack}>
      <div className="space-y-2">
        {ACHIEVEMENTS.map((a) => {
          const claimed = !!profile.achievements[a.id];
          const done = !claimed && a.test(profile.stats, profile);
          return (
            <div
              key={a.id}
              className={`flex items-center gap-3 rounded-2xl p-3 ring-1 ${
                claimed
                  ? 'bg-emerald-500/10 ring-emerald-500/25'
                  : done
                    ? 'bg-amber-500/15 ring-amber-400/50'
                    : 'bg-black/30 ring-white/10'
              }`}
            >
              <span className="text-xl">{claimed ? '✅' : done ? '🎉' : '🔒'}</span>
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-bold ${claimed ? 'text-emerald-200' : 'text-white'}`}>
                  {a.name}
                </div>
                <div className="text-[11px] text-white/50">{a.desc}</div>
              </div>
              {claimed ? (
                <span className="text-[10px] font-semibold text-emerald-300/70">Claimed</span>
              ) : done ? (
                <button
                  type="button"
                  onClick={() => onClaim(a.id)}
                  className="animate-pulse rounded-xl bg-gradient-to-r from-yellow-400 to-amber-500 px-3 py-1.5 text-xs font-bold text-[#1a1208] active:scale-95"
                >
                  +{a.gems} 💎
                </button>
              ) : (
                <span className="text-[10px] font-semibold text-white/30">+{a.gems} 💎</span>
              )}
            </div>
          );
        })}
      </div>
    </PanelShell>
  );
}

function StatsPanel({ profile, onBack }: { profile: Profile; onBack: () => void }) {
  const s = profile.stats;
  const mins = Math.floor(s.timePlayedSec / 60);
  const topDeaths = Object.entries(s.deaths)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, 3);
  return (
    <PanelShell title="Statistics & Ranks" onBack={onBack}>
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Runs" value={String(s.runs)} />
        <StatCard label="Best Score" value={s.bestScore.toLocaleString()} />
        <StatCard label="Best Distance" value={`${Math.floor(s.bestDistance)}m`} />
        <StatCard label="Total Distance" value={`${Math.floor(s.totalDistance)}m`} />
        <StatCard label="Beans Collected" value={s.totalBeans.toLocaleString()} />
        <StatCard label="Coins Earned" value={`🪙 ${s.totalCoinsEarned.toLocaleString()}`} />
        <StatCard label="Gems Earned" value={`💎 ${s.totalGemsEarned}`} />
        <StatCard label="Best Combo" value={`${s.bestCombo}x`} />
        <StatCard label="Jumps" value={s.totalJumps.toLocaleString()} />
        <StatCard label="Near Misses" value={s.totalNearMisses.toLocaleString()} />
        <StatCard label="Power-ups Used" value={String(s.powerupsUsed)} />
        <StatCard label="Time Played" value={`${mins}m ${Math.floor(s.timePlayedSec % 60)}s`} />
        <StatCard label="Night Running" value={`${Math.floor(s.nightDistance)}m`} />
        <StatCard label="Regions Seen" value={`${s.biomesSeen.length}/5`} />
      </div>

      {topDeaths.length > 0 && (
        <div className="mt-3 rounded-2xl bg-black/30 p-3 ring-1 ring-white/10">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
            Most dangerous foes
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-white/70">
            {topDeaths.map(([type, n]) => (
              <span key={type} className="rounded-lg bg-white/5 px-2 py-1">
                {type.replace(/_/g, ' ')} ×{n}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200/60">
        Local Leaderboard · Top 10
      </div>
      <div className="mt-2 space-y-1">
        {profile.leaderboard.length === 0 && (
          <p className="py-2 text-center text-xs text-white/40">No runs yet — go make history!</p>
        )}
        {profile.leaderboard.map((e, i) => (
          <div
            key={`${e.date}-${i}`}
            className={`flex items-center justify-between rounded-xl px-3 py-1.5 text-sm ${
              i === 0 ? 'bg-amber-500/20 ring-1 ring-amber-400/40' : 'bg-black/25'
            }`}
          >
            <span className="flex items-center gap-2 text-white/80">
              <span className={`w-5 font-bold ${i < 3 ? 'text-amber-400' : 'text-white/40'}`}>
                {i + 1}.
              </span>
              <span>{e.emoji}</span>
              {e.name}
            </span>
            <span className="font-semibold tabular-nums text-amber-100">
              {e.score.toLocaleString()}
              <span className="ml-2 text-xs font-normal text-white/40">{e.distance}m</span>
            </span>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

function DailyModal({
  profile,
  onClaim,
  onClose,
}: {
  profile: Profile;
  onClaim: () => void;
  onClose: () => void;
}) {
  const ready = canClaimDaily(profile);
  const nextStreak =
    profile.daily.lastClaim === new Date(Date.now() - 86400000).toISOString().slice(0, 10)
      ? profile.daily.streak + 1
      : 1;
  const reward = dailyRewardForStreak(ready ? nextStreak : profile.daily.streak);
  return (
    <div className="pointer-events-auto fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
      <div className="w-full max-w-xs rounded-3xl bg-gradient-to-b from-[#4a2810] to-[#1a1008] p-6 text-center shadow-2xl ring-1 ring-amber-500/40">
        <div className="text-4xl">🎁</div>
        <h3 className="font-display mt-1 text-2xl font-black text-white">Daily Gift</h3>
        <p className="mt-1 text-xs text-white/60">
          Streak: <span className="font-bold text-amber-300">{ready ? nextStreak : profile.daily.streak} day{(ready ? nextStreak : profile.daily.streak) === 1 ? '' : 's'}</span>
        </p>
        <div className="mt-4 flex justify-center gap-1.5">
          {DAILY_REWARDS.map((r, i) => {
            const idx = ((ready ? nextStreak : profile.daily.streak) - 1 + 7) % 7;
            const isToday = i === idx;
            const past = i < idx;
            return (
              <div
                key={i}
                className={`flex h-10 w-9 flex-col items-center justify-center rounded-lg text-[9px] font-bold ring-1 ${
                  isToday
                    ? 'bg-amber-500/30 text-amber-200 ring-amber-400'
                    : past
                      ? 'bg-emerald-500/15 text-emerald-300/70 ring-emerald-500/30'
                      : 'bg-white/5 text-white/40 ring-white/10'
                }`}
              >
                <span className="text-sm">{r.gems > 0 ? '💎' : r.powerup ? '🧲' : '🪙'}</span>
                D{i + 1}
              </div>
            );
          })}
        </div>
        <div className="mt-4 rounded-2xl bg-black/30 py-3 ring-1 ring-white/10">
          <div className="text-[10px] uppercase tracking-wider text-white/40">Today's reward</div>
          <div className="font-display text-xl font-bold text-amber-200">{reward.label}</div>
        </div>
        {ready ? (
          <button
            type="button"
            onClick={onClaim}
            className="mt-4 w-full rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-red-600 py-3 font-bold text-white shadow-lg transition active:scale-[0.98]"
          >
            Claim Gift
          </button>
        ) : (
          <p className="mt-4 text-xs text-white/50">Come back tomorrow for the next gift!</p>
        )}
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-2xl bg-white/10 py-2 text-sm font-semibold text-white/80 ring-1 ring-white/10 transition hover:bg-white/15"
        >
          Close
        </button>
      </div>
    </div>
  );
}

/* ============================== premium bits ================================ */

const TUTORIAL_STEPS = [
  {
    icon: '👈👉',
    gesture: 'swipe-lr',
    title: 'Change Lanes',
    body: 'Swipe left / right — or press A / D and the arrow keys',
  },
  {
    icon: '🦘',
    gesture: 'swipe-up',
    title: 'Jump',
    body: 'Swipe up or tap — leap over rocks, goats, rivers & fences',
  },
  {
    icon: '🛷',
    gesture: 'swipe-down',
    title: 'Slide',
    body: 'Swipe down or press S — duck under carts, stalls & branches',
  },
];

function TutorialOverlay({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (step >= TUTORIAL_STEPS.length) {
      const t = setTimeout(onDone, 250);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStep((s) => s + 1), 1500);
    return () => clearTimeout(t);
  }, [step, onDone]);

  const s = TUTORIAL_STEPS[Math.min(step, TUTORIAL_STEPS.length - 1)];

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/85 p-6 backdrop-blur-sm">
      <div className="w-full max-w-xs text-center">
        <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-300/70">
          How to run
        </div>
        <div key={step} className="anim-pop mt-4 rounded-3xl bg-gradient-to-b from-[#3d2914] to-[#1a1208] p-7 ring-1 ring-amber-600/40">
          <div className="flex items-center justify-center gap-4">
            <span className="text-5xl">{s.icon}</span>
            <GestureArrow dir={s.gesture} />
          </div>
          <h3 className="font-display mt-4 text-2xl font-black text-white">{s.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-white/65">{s.body}</p>
        </div>

        <div className="mt-5 flex items-center justify-center gap-2">
          {TUTORIAL_STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-2 rounded-full transition-all ${
                i === step ? 'w-6 bg-amber-400' : i < step ? 'w-2 bg-amber-500/50' : 'w-2 bg-white/20'
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => setStep(TUTORIAL_STEPS.length)}
          className="mt-5 rounded-full bg-white/10 px-5 py-2 text-sm font-semibold text-white/80 ring-1 ring-white/15 transition hover:bg-white/15 active:scale-95"
        >
          Skip → Let's run!
        </button>
      </div>
    </div>
  );
}

function GestureArrow({ dir }: { dir: string }) {
  if (dir === 'swipe-up') {
    return (
      <span className="anim-gesture-up inline-block text-3xl text-amber-300">⬆️</span>
    );
  }
  if (dir === 'swipe-down') {
    return (
      <span className="anim-gesture-down inline-block text-3xl text-amber-300">⬇️</span>
    );
  }
  return <span className="anim-gesture-lr inline-block text-3xl text-amber-300">↔️</span>;
}

function CoffeeLogo() {
  return (
    <div className="anim-float mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-600 to-[#3d2410] shadow-lg shadow-orange-900/40 ring-1 ring-amber-400/40">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4 9h13v5a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6V9Z" fill="#6F4E37" />
        <path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17" stroke="#E8C39E" strokeWidth="1.6" />
        <path d="M8 3c0 1.2-1 1.6-1 2.8M12 3c0 1.2-1 1.6-1 2.8" stroke="#E8C39E" strokeWidth="1.6" strokeLinecap="round" />
        <ellipse cx="10.5" cy="13" rx="3.4" ry="4.4" fill="#4a2c0a" transform="rotate(-18 10.5 13)" />
        <path d="M9.6 9.8c1.2 1.6 1.2 4.8 0 6.4" stroke="#8a5a2a" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function ScoreCountUp({ target }: { target: number }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const dur = 800;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setVal(Math.round(target * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return <span className="tabular-nums">{val.toLocaleString()}</span>;
}

function RewardedAdModal({
  mode,
  onClose,
  onComplete,
}: {
  mode: 'coins' | 'revive';
  onClose: () => void;
  onComplete: () => void;
}) {
  const [left, setLeft] = useState(5);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  const done = left <= 0;
  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm">
      <div className="w-full max-w-xs overflow-hidden rounded-3xl bg-gradient-to-b from-[#2a3040] to-[#12151c] shadow-2xl ring-1 ring-white/15">
        <div className="flex items-center justify-between px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/50">
          <span>Advertisement</span>
          <span>{done ? 'Reward ready' : `Reward in ${left}s`}</span>
        </div>

        {/* fake ad creative */}
        <div className="relative mx-4 flex h-40 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-amber-700 via-[#8a4a1a] to-[#3d2410]">
          <div className="anim-float text-6xl">☕</div>
          <div className="absolute bottom-3 left-0 right-0 text-center">
            <div className="font-display text-lg font-black text-white drop-shadow">Habesha Roast</div>
            <div className="text-[11px] text-amber-100/80">Fuel for the highlands · since 1958</div>
          </div>
          {!done && (
            <div className="absolute left-0 top-0 h-1 bg-amber-400 transition-all duration-1000 ease-linear" style={{ width: `${((5 - left) / 5) * 100}%` }} />
          )}
        </div>

        <div className="p-4">
          {done ? (
            <button
              type="button"
              onClick={onComplete}
              className="anim-pop w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 py-3 font-black text-white shadow-lg ring-1 ring-emerald-300/40 transition active:scale-[0.98]"
            >
              {mode === 'coins' ? 'Claim +75 🪙' : 'Revive & Keep Running'}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-2xl bg-white/10 py-3 text-sm font-semibold text-white/70 ring-1 ring-white/10 transition hover:bg-white/15"
            >
              Cancel (no reward)
            </button>
          )}
          <p className="mt-2 text-center text-[10px] text-white/35">
            Simulated ad placeholder · optional · never interrupts gameplay
          </p>
        </div>
      </div>
    </div>
  );
}

/* ================================ primitives ================================ */

function PanelShell({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="pointer-events-auto flex flex-1 flex-col overflow-hidden bg-gradient-to-b from-[#1a1208]/80 via-[#241509]/70 to-[#1a1208]/90 backdrop-blur-[2px]">
      <div className="flex items-center gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/15 transition hover:bg-white/20 active:scale-95"
          aria-label="Back"
        >
          ←
        </button>
        <h2 className="font-display text-xl font-bold text-amber-100">{title}</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-6 pt-3">{children}</div>
    </div>
  );
}

function WalletBar({ profile }: { profile: Profile }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 text-sm font-bold text-white ring-1 ring-white/10 backdrop-blur-md">
      <span className="tabular-nums text-amber-200">🪙 {profile.coins.toLocaleString()}</span>
      <span className="text-white/20">|</span>
      <span className="tabular-nums text-sky-200">💎 {profile.gems}</span>
    </div>
  );
}

function DailyButton({ ready, streak, onClick }: { ready: boolean; streak: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative rounded-full px-3 py-1.5 text-sm font-bold ring-1 backdrop-blur-md transition active:scale-95 ${
        ready
          ? 'animate-pulse bg-gradient-to-r from-amber-500 to-orange-600 text-white ring-amber-300/40'
          : 'bg-black/40 text-white/70 ring-white/10'
      }`}
    >
      🎁 Day {Math.max(1, streak)}
      {ready && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-red-500 ring-2 ring-black/40" />}
    </button>
  );
}

function NavTile({
  emoji,
  label,
  badge,
  onClick,
}: {
  emoji: string;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex flex-col items-center gap-1 rounded-2xl bg-white/10 py-3 ring-1 ring-white/15 transition hover:bg-white/15 active:scale-95"
    >
      <span className="text-2xl">{emoji}</span>
      <span className="text-xs font-semibold text-white/85">{label}</span>
      {!!badge && badge > 0 && (
        <span className="absolute right-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
          {badge}
        </span>
      )}
    </button>
  );
}

function EffectChips({ hud }: { hud: HudData }) {
  const e = hud.effects;
  const chips: { key: string; icon: string; label: string }[] = [];
  if (e.shield > 0) chips.push({ key: 'shield', icon: '🛡️', label: `×${e.shield}` });
  if (e.magnet > 0) chips.push({ key: 'magnet', icon: '🧲', label: `${Math.ceil(e.magnet)}s` });
  if (e.double > 0) chips.push({ key: 'double', icon: '✖️', label: `${Math.ceil(e.double)}s` });
  if (e.superJump > 0) chips.push({ key: 'jump', icon: '🦘', label: `${Math.ceil(e.superJump)}s` });
  if (e.slow > 0) chips.push({ key: 'slow', icon: '⏳', label: `${e.slow.toFixed(1)}s` });
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {chips.map((c) => (
        <span
          key={c.key}
          className="rounded-full bg-black/50 px-2 py-1 text-[11px] font-bold text-white ring-1 ring-white/15 backdrop-blur"
        >
          {c.icon} {c.label}
        </span>
      ))}
    </div>
  );
}

function MenuButton({
  children,
  onClick,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl py-3 text-base font-bold tracking-wide transition active:scale-[0.98] ${
        primary
          ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-red-600 text-white shadow-lg shadow-orange-900/40 ring-1 ring-amber-300/30 hover:brightness-110'
          : 'bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/15'
      }`}
    >
      {children}
    </button>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-black/30 px-3 py-2 ring-1 ring-white/10">
      <div className="text-[10px] uppercase tracking-wider text-white/50">{label}</div>
      <div className="font-display truncate text-lg font-bold text-amber-100">{value}</div>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: 'amber' | 'green' }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
        tone === 'amber' ? 'bg-amber-500/25 text-amber-200' : 'bg-emerald-500/25 text-emerald-200'
      }`}
    >
      {children}
    </span>
  );
}

function PauseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

function regionIcon(region: string): string {
  if (region.includes('Addis')) return '🏙';
  if (region.includes('Simien')) return '🏔';
  if (region.includes('Nile')) return '🌊';
  if (region.includes('Village')) return '🛖';
  return '☕';
}

function weatherIcon(weather: string, tod: string): string {
  if (weather === 'storm') return '⛈';
  if (weather === 'rain') return '🌧';
  if (weather === 'overcast') return '☁';
  if (tod === 'night') return '🌙';
  if (tod === 'sunset' || weather === 'golden') return '🌅';
  if (tod === 'dawn') return '🌄';
  return '☀';
}
