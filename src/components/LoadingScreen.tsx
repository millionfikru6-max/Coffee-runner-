import { useEffect, useState } from 'react';

const TIPS = [
  'Swipe up to leap over goats and rocks',
  'Slide under carts and market stalls',
  'Golden beans are worth 75 points',
  'Meskel flowers bloom for bonus score',
  'Watch for hyenas in the Simien Mountains',
  'Rain rolls in fast along the Blue Nile',
  'Equip a Magnet to pull beans to you',
  'Near misses earn bonus points',
];

export function LoadingScreen({ fading, onGone }: { fading: boolean; onGone: () => void }) {
  const [hidden, setHidden] = useState(false);
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const dur = 1400;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      setProgress(Math.round(k * 100));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!fading) return;
    const t = setTimeout(() => {
      setHidden(true);
      onGone();
    }, 450);
    return () => clearTimeout(t);
  }, [fading, onGone]);

  if (hidden) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#1a1208] transition-opacity duration-500 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="anim-float flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-600 to-[#3d2410] shadow-2xl shadow-orange-900/50 ring-1 ring-amber-400/40">
        <span className="text-5xl">☕</span>
      </div>
      <h1 className="font-display mt-6 text-3xl font-black text-white">Coffee Runner</h1>
      <div className="flag-stripe mx-auto mt-2 h-1.5 w-40 rounded-full" />
      <p className="font-display mt-1 text-sm font-semibold text-amber-200/80">The Heart of Ethiopia</p>

      <div className="mt-8 w-56">
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-red-600 transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-2 text-center text-[11px] tabular-nums text-white/40">
          Brewing the highlands… {progress}%
        </div>
      </div>

      <p className="absolute bottom-10 px-8 text-center text-xs text-amber-100/50">
        <span className="mr-1 font-bold text-amber-300/70">TIP</span> {tip}
      </p>
    </div>
  );
}
