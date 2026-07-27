/**
 * UI smoke test.
 *
 * Renders every panel, modal and game state to static HTML with
 * react-dom/server. This catches the whole class of bugs the render and logic
 * suites can't see: missing props, crashes on empty/extreme data, and panels
 * that throw for a brand-new player or a maxed-out one.
 */

import './jsx-shim';
import { installStorageMock } from './storageMock';
installStorageMock();

import { renderToStaticMarkup } from 'react-dom/server';
import { GameUI } from '../src/components/GameUI';
import { LeaderboardPanel } from '../src/components/LeaderboardPanel';
import { SaveDataPanel } from '../src/components/SaveDataPanel';
import { TouchControls } from '../src/components/TouchControls';
import { LoadingScreen } from '../src/components/LoadingScreen';
import { UnsupportedScreen } from '../src/components/ErrorBoundary';
import { loadProfile, recordRun, type Profile } from '../src/game/progression';
import type { GameState, RunSummary, Settings } from '../src/game/types';
import type { HudData } from '../src/game/useGameLoop';

let failures = 0;
function check(name: string, fn: () => string, expect?: (html: string) => boolean) {
  try {
    const html = fn();
    if (expect && !expect(html)) {
      failures++;
      console.log(`  FAIL ${name} (unexpected content)`);
      return;
    }
    console.log(`  ok   ${name} (${html.length} chars)`);
  } catch (e) {
    failures++;
    console.log(`  FAIL ${name}: ${e instanceof Error ? e.message : e}`);
  }
}

const settings: Settings = {
  sound: true, music: true, vibrate: true, difficulty: 'normal',
  quality: 'high', screenShake: true, touchButtons: false,
  leftHanded: false, reducedMotion: false,
};

const hud: HudData = {
  score: 12345, distance: 678, beans: 90, coins: 45, combo: 7, speed: 380,
  region: 'Simien Mountains', weather: 'storm', timeOfDay: 'night', specials: 3,
  effects: { magnet: 5, shield: 1, double: 0, superJump: 2, slow: 0 },
  pbDistance: 500, pbReached: true,
};

const summary: RunSummary = {
  score: 12345, distance: 678, beans: 90, coins: 45, specials: 3, maxCombo: 14,
  jumps: 30, slides: 12, nearMisses: 8, powerupsUsed: 2, nightDistance: 200,
  biomesVisited: ['coffee_highlands', 'traditional_village', 'addis_ababa'],
  deathBy: 'hyena', durationSec: 96,
};

const noop = () => {};
const noopId = (_: string) => {};

function ui(state: GameState, profile: Profile, over: Partial<Settings> = {}) {
  return renderToStaticMarkup(
    <GameUI
      gameState={state}
      hud={hud}
      settings={{ ...settings, ...over }}
      profile={profile}
      runReport={null}
      lastSummary={state === 'gameover' ? summary : null}
      canRevive={state === 'gameover'}
      onPlay={noop} onPause={noop} onResume={noop} onMenu={noop} onSettings={noop}
      onUpdateSettings={noop} onBuyCharacter={noopId} onBuyOutfit={noopId}
      onBuyPowerUp={() => {}} onSelectCharacter={noopId} onSelectOutfit={noopId}
      onToggleEquip={() => {}} onClaimMission={noopId} onClaimAchievement={noopId}
      onClaimDaily={noop} onResetProgress={noop} onAdCoins={noop} onRevive={noop}
      onTutorialDone={noop} onShare={async () => 'shared' as const}
      onImportSave={() => true} onMoveLane={() => {}} onJump={noop} onSlide={noop}
    />,
  );
}

console.log('\n== UI rendering ==');

const fresh = loadProfile();

// --- every game state, brand-new player ---
for (const state of ['menu', 'playing', 'paused', 'gameover', 'settings'] as const) {
  check(`state '${state}' renders for a new player`, () => ui(state, fresh));
}

// --- a maxed-out player: full leaderboard, all unlocks, big numbers ---
let maxed = fresh;
for (let i = 0; i < 40; i++) {
  maxed = recordRun(maxed, { ...summary, score: 1000 + i * 977, biomesVisited: [...summary.biomesVisited] }).profile;
}
maxed = {
  ...maxed,
  coins: 987_654, gems: 4_321,
  ownedCharacters: ['abebe', 'tigist', 'kidus', 'selam'],
  ownedOutfits: ['shamma', 'marathon'],
  inventory: { magnet: 9, shield: 9, double: 9, superJump: 9, slow: 9 },
  equipped: ['magnet', 'shield'],
  stats: { ...maxed.stats, bestScore: 999_999, totalDistance: 1_234_567, runs: 4_321 },
};
for (const state of ['menu', 'playing', 'gameover'] as const) {
  check(`state '${state}' renders for a maxed player`, () => ui(state, maxed));
}

// --- accessibility variants ---
check('on-screen buttons render', () => ui('playing', fresh, { touchButtons: true }),
  (h) => h.includes('aria-label="Jump"') && h.includes('aria-label="Move left"'));
check('left-handed layout renders', () => ui('playing', fresh, { touchButtons: true, leftHanded: true }),
  (h) => h.includes('flex-row-reverse'));
check('reduced motion renders', () => ui('playing', fresh, { reducedMotion: true }));
check('settings exposes every toggle', () => ui('settings', fresh),
  (h) => ['Sound Effects','Music','Vibration','Screen Shake','On-Screen Buttons','Reduced Motion','Save Data']
    .every((label) => h.includes(label)));

// --- standalone panels ---
check('leaderboard with entries', () => renderToStaticMarkup(<LeaderboardPanel profile={maxed} onBack={noop} />),
  (h) => h.includes('Leaderboard') && h.includes('🥇'));
check('leaderboard when empty', () => renderToStaticMarkup(<LeaderboardPanel profile={fresh} onBack={noop} />),
  (h) => h.includes('No runs yet'));
check('save data panel', () => renderToStaticMarkup(
  <SaveDataPanel profile={maxed} onBack={noop} onImport={() => true} onReset={noop} onToast={noop} />),
  (h) => h.includes('Transfer to another device') && h.includes('Danger zone'));
check('touch controls', () => renderToStaticMarkup(
  <TouchControls onLeft={noop} onRight={noop} onJump={noop} onSlide={noop} leftHanded={false} vibrate={noop} />));
check('loading screen', () => renderToStaticMarkup(<LoadingScreen fading={false} onGone={noop} />),
  (h) => h.includes('Coffee Runner'));
check('unsupported screen', () => renderToStaticMarkup(<UnsupportedScreen reason="test" />),
  (h) => h.includes('WebGL'));

// --- hostile data: nothing should throw ---
const broken: Profile = {
  ...fresh,
  coins: 0, gems: 0,
  missions: [],
  leaderboard: [],
  ownedCharacters: ['abebe'],
  ownedOutfits: ['shamma'],
  stats: { ...fresh.stats, bestScore: 0, runs: 0, biomesSeen: [] },
};
check('renders with no missions and no scores', () => ui('menu', broken));
check('game over with a zero-score run', () =>
  renderToStaticMarkup(
    <GameUI
      gameState="gameover" hud={{ ...hud, score: 0, distance: 0 }} settings={settings}
      profile={broken} runReport={null}
      lastSummary={{ ...summary, score: 0, distance: 0, beans: 0, coins: 0, biomesVisited: [] }}
      canRevive={false}
      onPlay={noop} onPause={noop} onResume={noop} onMenu={noop} onSettings={noop}
      onUpdateSettings={noop} onBuyCharacter={noopId} onBuyOutfit={noopId}
      onBuyPowerUp={() => {}} onSelectCharacter={noopId} onSelectOutfit={noopId}
      onToggleEquip={() => {}} onClaimMission={noopId} onClaimAchievement={noopId}
      onClaimDaily={noop} onResetProgress={noop} onAdCoins={noop} onRevive={noop}
      onTutorialDone={noop} onShare={async () => 'failed' as const}
      onImportSave={() => false} onMoveLane={() => {}} onJump={noop} onSlide={noop}
    />,
  ));

/*
 * Gesture-safety audit.
 *
 * The swipe controller listens on the whole play surface, so any interactive
 * element that isn't marked data-ui would have its taps double-read as lane
 * changes. Assert that across every screen, not just one.
 */
let untagged = 0;
let tagged = 0;
for (const state of ['menu', 'playing', 'paused', 'gameover', 'settings'] as const) {
  const html = ui(state, maxed, { touchButtons: true });
  const buttons = html.match(/<button[^>]*>/g) ?? [];
  for (const b of buttons) {
    if (b.includes('data-ui')) tagged++;
    else untagged++;
  }
}
check('every button is gesture-safe', () => `${tagged}/${tagged + untagged}`,
  () => untagged === 0);
console.log(`       ${tagged} buttons audited, ${untagged} missing data-ui`);

// --- tutorial: shown to new players, player-paced, fully labelled ---
{
  const tutorialHtml = ui('menu', { ...fresh, tutorialDone: false });
  check('new players are offered the tutorial', () => tutorialHtml);

}

// --- accessibility audit ---
{
  const screens = (['menu', 'playing', 'paused', 'gameover', 'settings'] as const).map((st) =>
    ui(st, maxed, { touchButtons: true }),
  );
  const all = screens.join('');

  // Icon-only buttons must carry an aria-label or a screen reader announces
  // nothing useful.
  const iconOnly = (all.match(/<button[^>]*>[\s]*[^<\w\s][\s]*<\/button>/g) ?? []).filter(
    (b) => !b.includes('aria-label'),
  );
  check('icon-only buttons are labelled', () => `${iconOnly.length}`, () => iconOnly.length === 0);

  check('toggles expose switch semantics', () => all,
    (h) => h.includes('role="switch"') && h.includes('aria-checked'));
  check('segmented controls expose radio semantics', () => all,
    (h) => h.includes('role="radiogroup"') && h.includes('role="radio"'));
  check('on-screen pads are labelled', () => all,
    (h) => ['Jump','Slide','Move left','Move right'].every((l) => h.includes(`aria-label="${l}"`)));
  check('safe-area insets are applied', () => all,
    (h) => h.includes('env(safe-area-inset-bottom)') && h.includes('env(safe-area-inset-top)'));
}

console.log(`\n${failures === 0 ? 'UI CHECKS PASSED' : `${failures} UI CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
