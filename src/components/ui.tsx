/**
 * Shared UI kit.
 *
 * A small design system so every panel shares the same surfaces, motion and
 * touch targets. Everything here is built for phones first: minimum 44px hit
 * areas, safe-area insets, momentum scrolling, and `data-ui` on interactive
 * surfaces so the gesture controller doesn't read a button tap as a swipe.
 */

import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/cn';

/* --------------------------------- surfaces -------------------------------- */

/** Full-screen frosted backdrop used behind every modal and panel. */
export function Backdrop({
  children,
  onClose,
  className,
}: {
  children: React.ReactNode;
  onClose?: () => void;
  className?: string;
}) {
  return (
    <div
      data-ui
      className={cn(
        'pointer-events-auto absolute inset-0 z-20 flex flex-col bg-[#0d0904]/80 backdrop-blur-md',
        className,
      )}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      {children}
    </div>
  );
}

/**
 * Standard panel chrome: sticky title bar, scrollable body, safe-area padding.
 * Panels are sheets on phones and centred cards on larger screens.
 */
export function Sheet({
  title,
  subtitle,
  icon,
  onBack,
  right,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  icon?: string;
  onBack: () => void;
  right?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Backdrop onClose={onBack}>
      <div className="anim-fade-up mx-auto flex h-full w-full max-w-md flex-col sm:h-auto sm:max-h-[92%] sm:my-auto sm:rounded-3xl sm:ring-1 sm:ring-amber-700/30 overflow-hidden bg-gradient-to-b from-[#33210f] to-[#150e06] shadow-2xl">
        {/* header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-amber-900/40 bg-black/25 px-4 pb-3 pt-[max(0.9rem,env(safe-area-inset-top))]">
          <button
            type="button"
            data-ui
            onClick={onBack}
            aria-label="Back"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-xl text-white ring-1 ring-white/10 transition active:scale-95"
          >
            ←
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="font-display flex items-center gap-2 truncate text-xl font-bold text-amber-50">
              {icon && <span aria-hidden>{icon}</span>}
              {title}
            </h2>
            {subtitle && <p className="truncate text-xs text-amber-200/60">{subtitle}</p>}
          </div>
          {right}
        </div>

        {/* body */}
        <div
          data-ui
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {children}
          <div className="h-[max(1rem,env(safe-area-inset-bottom))]" />
        </div>

        {footer && (
          <div className="shrink-0 border-t border-amber-900/40 bg-black/30 px-4 pb-[max(0.9rem,env(safe-area-inset-bottom))] pt-3">
            {footer}
          </div>
        )}
      </div>
    </Backdrop>
  );
}

/** Centred dialog for short confirmations. */
export function Dialog({
  title,
  children,
  onClose,
  tone = 'default',
}: {
  title: string;
  children: React.ReactNode;
  onClose?: () => void;
  tone?: 'default' | 'danger';
}) {
  return (
    <Backdrop onClose={onClose} className="items-center justify-center p-5">
      <div
        className={cn(
          'anim-pop w-full max-w-xs rounded-3xl bg-gradient-to-b p-5 shadow-2xl ring-1',
          tone === 'danger'
            ? 'from-[#3d1414] to-[#180808] ring-red-700/40'
            : 'from-[#33210f] to-[#150e06] ring-amber-700/40',
        )}
      >
        <h3 className="font-display text-center text-xl font-bold text-amber-50">{title}</h3>
        <div className="mt-3">{children}</div>
      </div>
    </Backdrop>
  );
}

/* --------------------------------- controls -------------------------------- */

export function Button({
  children,
  onClick,
  variant = 'ghost',
  size = 'md',
  disabled,
  className,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger' | 'gold';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const variants = {
    primary:
      'bg-gradient-to-b from-amber-400 to-amber-600 text-[#2a1a08] shadow-lg shadow-amber-900/40 ring-1 ring-amber-300/50',
    gold: 'bg-gradient-to-b from-yellow-300 to-amber-500 text-[#2a1a08] shadow-lg shadow-amber-900/40 ring-1 ring-yellow-200/60',
    ghost: 'bg-white/10 text-white ring-1 ring-white/12 hover:bg-white/15',
    danger: 'bg-gradient-to-b from-red-500 to-red-700 text-white ring-1 ring-red-400/40',
  };
  const sizes = {
    sm: 'px-3 py-2 text-xs min-h-[38px]',
    md: 'px-4 py-3 text-sm min-h-[46px]',
    lg: 'px-5 py-4 text-base min-h-[54px]',
  };
  return (
    <button
      type="button"
      data-ui
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'relative select-none overflow-hidden rounded-2xl font-display font-bold tracking-wide transition active:scale-[0.97]',
        variants[variant],
        sizes[size],
        disabled && 'pointer-events-none opacity-40',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Big play button with an animated sheen — the primary call to action. */
export function PlayButton({ onClick, label = 'PLAY' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      data-ui
      onClick={onClick}
      className="anim-float group relative w-full overflow-hidden rounded-3xl bg-gradient-to-b from-amber-300 via-amber-500 to-orange-600 py-5 shadow-2xl shadow-orange-900/50 ring-2 ring-amber-200/50 transition active:scale-[0.97]"
    >
      <span className="font-display relative z-10 text-2xl font-extrabold tracking-[0.15em] text-[#2a1508] drop-shadow">
        {label}
      </span>
      {/* sheen sweep */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-white/35 blur-md"
        style={{ animation: 'shine-sweep 2.8s ease-in-out infinite' }}
      />
    </button>
  );
}

export function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      data-ui
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between gap-3 rounded-2xl bg-white/[0.06] px-4 py-3 text-left ring-1 ring-white/10 transition active:scale-[0.99]"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-amber-50">{label}</span>
        {hint && <span className="block text-[11px] leading-tight text-white/45">{hint}</span>}
      </span>
      <span
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-full transition-colors',
          value ? 'bg-emerald-500' : 'bg-white/20',
        )}
      >
        <span
          className={cn(
            'absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all',
            value ? 'left-6' : 'left-1',
          )}
        />
      </span>
    </button>
  );
}

/** Segmented control — replaces the loose button grids in Settings. */
export function Segmented<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label?: string;
  hint?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      {label && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-amber-50">{label}</span>
          {hint && <span className="text-[11px] text-white/40">{hint}</span>}
        </div>
      )}
      <div
        role="radiogroup"
        className="flex gap-1 rounded-2xl bg-black/30 p-1 ring-1 ring-white/10"
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            data-ui
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              'min-h-[40px] flex-1 rounded-xl px-2 py-2 text-xs font-bold transition',
              value === o.value
                ? 'bg-gradient-to-b from-amber-400 to-amber-600 text-[#2a1a08] shadow'
                : 'text-white/70 active:bg-white/10',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------- data ---------------------------------- */

export function ProgressBar({
  value,
  max,
  tone = 'amber',
  showLabel = true,
}: {
  value: number;
  max: number;
  tone?: 'amber' | 'emerald' | 'sky';
  showLabel?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  const tones = {
    amber: 'from-amber-400 to-orange-500',
    emerald: 'from-emerald-400 to-green-600',
    sky: 'from-sky-400 to-blue-600',
  };
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/5">
        <div
          className={cn('h-full rounded-full bg-gradient-to-r transition-[width] duration-500', tones[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="shrink-0 text-[10px] font-bold tabular-nums text-white/50">
          {Math.floor(value)}/{max}
        </span>
      )}
    </div>
  );
}

export function Card({
  children,
  className,
  glow,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl bg-white/[0.055] p-3 ring-1 ring-white/10',
        glow && 'ring-amber-400/50 shadow-lg shadow-amber-900/30',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Pill({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'gold' | 'green' | 'red' | 'blue';
}) {
  const tones = {
    neutral: 'bg-white/10 text-white/70',
    gold: 'bg-amber-400/20 text-amber-200 ring-1 ring-amber-400/30',
    green: 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/30',
    red: 'bg-red-500/20 text-red-200 ring-1 ring-red-400/30',
    blue: 'bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/30',
  };
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', tones[tone])}>
      {children}
    </span>
  );
}

export function EmptyState({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <div className="text-4xl opacity-50">{icon}</div>
      <p className="font-display text-sm font-bold text-white/70">{title}</p>
      {hint && <p className="max-w-[16rem] text-xs text-white/40">{hint}</p>}
    </div>
  );
}

/** Number that rolls up to its target — used for scores and rewards. */
export function CountUp({
  target,
  duration = 900,
  className,
}: {
  target: number;
  duration?: number;
  className?: string;
}) {
  const [value, setValue] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutExpo — fast start, gentle settle
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);

  return <span className={cn('tabular-nums', className)}>{value.toLocaleString()}</span>;
}

/** Ethiopian flag stripe used as a decorative divider. */
export function FlagStripe({ className }: { className?: string }) {
  return <div className={cn('flag-stripe h-1 w-full rounded-full', className)} />;
}
