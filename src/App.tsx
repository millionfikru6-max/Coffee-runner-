import { useEffect, useMemo, useRef, useState } from 'react';
import { GameUI } from './components/GameUI';
import { LoadingScreen } from './components/LoadingScreen';
import { UnsupportedScreen, detectWebGL } from './components/ErrorBoundary';
import { useGameLoop } from './game/useGameLoop';

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  // Probe before booting so an unsupported device gets an explanation rather
  // than a black canvas.
  const webgl = useMemo(() => detectWebGL(), []);
  const game = useGameLoop(containerRef);
  const [booted, setBooted] = useState(false);
  const [loadingGone, setLoadingGone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setBooted(true), 1500);
    return () => clearTimeout(t);
  }, []);

  if (!webgl.ok) return <UnsupportedScreen reason={webgl.reason} />;
  if (game.bootError) return <UnsupportedScreen reason={game.bootError} />;

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#1a1208] select-none">
      <div
        ref={containerRef}
        className="relative mx-auto h-full w-full max-w-lg touch-none sm:max-w-xl md:max-w-2xl"
        style={{ touchAction: 'none' }}
      >
        <canvas
          ref={game.canvasRef}
          className="absolute inset-0 h-full w-full"
          onContextMenu={(e) => e.preventDefault()}
        />
        <GameUI
          gameState={game.gameState}
          hud={game.hud}
          settings={game.settings}
          profile={game.profile}
          runReport={game.runReport}
          lastSummary={game.lastSummary}
          canRevive={game.canRevive}
          onPlay={game.startGame}
          onPause={game.pauseGame}
          onResume={game.resumeGame}
          onMenu={game.toMenu}
          onSettings={game.openSettings}
          onUpdateSettings={game.updateSettings}
          onBuyCharacter={game.onBuyCharacter}
          onBuyOutfit={game.onBuyOutfit}
          onBuyPowerUp={game.onBuyPowerUp}
          onSelectCharacter={game.onSelectCharacter}
          onSelectOutfit={game.onSelectOutfit}
          onToggleEquip={game.onToggleEquip}
          onClaimMission={game.onClaimMission}
          onClaimAchievement={game.onClaimAchievement}
          onClaimDaily={game.onClaimDaily}
          onResetProgress={game.onResetProgress}
          onAdCoins={game.onAdCoins}
          onRevive={game.onRevive}
          onTutorialDone={game.onTutorialDone}
          onShare={game.onShare}
          onImportSave={game.onImportSave}
          onMoveLane={game.onMoveLane}
          onJump={game.onJump}
          onSlide={game.onSlide}
        />
      </div>

      {!loadingGone && (
        <LoadingScreen fading={booted} onGone={() => setLoadingGone(true)} />
      )}
    </div>
  );
}
