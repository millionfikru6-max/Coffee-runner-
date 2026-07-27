/**
 * Optional on-screen controls.
 *
 * Swipes are the default and feel best, but on-screen buttons matter for
 * accessibility (limited dexterity, screen protectors, gloves) and for players
 * who simply prefer them. They fire on pointerdown for minimum latency, repeat
 * safely, and are mirrored for left-handed play.
 *
 * The buttons deliberately sit outside the swipe surface via `data-ui`, so
 * pressing one never also registers as a gesture.
 */

import { useCallback, useRef } from 'react';
import { cn } from '../lib/cn';

interface Props {
  onLeft: () => void;
  onRight: () => void;
  onJump: () => void;
  onSlide: () => void;
  leftHanded: boolean;
  vibrate: (ms: number) => void;
}

export function TouchControls({ onLeft, onRight, onJump, onSlide, leftHanded, vibrate }: Props) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 select-none pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div
        className={cn(
          'mx-auto flex max-w-md items-end justify-between px-4',
          leftHanded && 'flex-row-reverse',
        )}
      >
        {/* lane cluster */}
        <div className="flex gap-2">
          <Pad label="Move left" glyph="◀" onPress={onLeft} vibrate={vibrate} />
          <Pad label="Move right" glyph="▶" onPress={onRight} vibrate={vibrate} />
        </div>

        {/* action cluster */}
        <div className="flex flex-col gap-2">
          <Pad label="Jump" glyph="▲" onPress={onJump} vibrate={vibrate} accent />
          <Pad label="Slide" glyph="▼" onPress={onSlide} vibrate={vibrate} />
        </div>
      </div>
    </div>
  );
}

function Pad({
  label,
  glyph,
  onPress,
  vibrate,
  accent,
}: {
  label: string;
  glyph: string;
  onPress: () => void;
  vibrate: (ms: number) => void;
  accent?: boolean;
}) {
  // Guard against a pointerdown + click double-fire on hybrid devices.
  const lastFire = useRef(0);

  const fire = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const now = performance.now();
      if (now - lastFire.current < 60) return;
      lastFire.current = now;
      onPress();
      vibrate(8);
    },
    [onPress, vibrate],
  );

  return (
    <button
      type="button"
      data-ui
      aria-label={label}
      onPointerDown={fire}
      onContextMenu={(e) => e.preventDefault()}
      className={cn(
        'pointer-events-auto flex h-16 w-16 touch-none items-center justify-center rounded-2xl text-xl font-bold',
        'ring-1 backdrop-blur-md transition active:scale-90',
        accent
          ? 'bg-amber-500/35 text-amber-50 ring-amber-300/40'
          : 'bg-black/35 text-white/85 ring-white/15',
      )}
      style={{ touchAction: 'none' }}
    >
      {glyph}
    </button>
  );
}
