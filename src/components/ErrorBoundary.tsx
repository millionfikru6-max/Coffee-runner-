/**
 * Top-level error boundary.
 *
 * Without this, any uncaught render error leaves the player staring at a black
 * screen with no explanation and no way out. Because the game is a PWA that
 * runs offline, "just reload" isn't always obvious either — so this offers a
 * reload, and critically, a way to export the save before doing anything
 * drastic, so a rendering bug never costs someone their progress.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: string;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: '', copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the trace for the details panel; there's no telemetry to send it to.
    this.setState({ info: info.componentStack?.slice(0, 1200) ?? '' });
    console.error('Coffee Runner crashed:', error, info);
  }

  private rescueSave = async () => {
    try {
      // Read the raw slots directly — the game modules may be the thing that
      // broke, so don't depend on them here.
      const slots = ['coffee-runner-save-a', 'coffee-runner-save-b']
        .map((k) => localStorage.getItem(k))
        .filter(Boolean);
      const blob = slots.join('\n---\n');
      await navigator.clipboard.writeText(blob);
      this.setState({ copied: true });
    } catch {
      this.setState({ copied: false });
    }
  };

  render() {
    const { error, info, copied } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-auto bg-[#1a1208] p-6 text-center">
        <div className="w-full max-w-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-900/40 text-3xl ring-1 ring-red-500/30">
            ☕
          </div>
          <h1 className="font-display mt-4 text-2xl font-bold text-amber-50">
            The run stopped short
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-white/60">
            Something went wrong while rendering. Your saved progress is safe on
            this device.
          </p>

          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[48px] rounded-2xl bg-gradient-to-b from-amber-400 to-amber-600 px-4 font-display font-bold text-[#2a1a08] shadow-lg active:scale-[0.98]"
            >
              Reload the game
            </button>
            <button
              type="button"
              onClick={this.rescueSave}
              className="min-h-[44px] rounded-2xl bg-white/10 px-4 text-sm font-semibold text-white ring-1 ring-white/10 active:scale-[0.98]"
            >
              {copied ? '✓ Backup copied to clipboard' : 'Copy a backup of my save'}
            </button>
          </div>

          <details className="mt-6 text-left">
            <summary className="cursor-pointer text-xs text-white/40">
              Technical details
            </summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-black/50 p-3 text-[10px] leading-tight text-red-200/70">
              {error.message}
              {info ? `\n${info}` : ''}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}

/**
 * Shown when the device can't provide a WebGL context at all. Rather than a
 * black canvas, explain what happened and what usually fixes it.
 */
export function UnsupportedScreen({ reason }: { reason: string }) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#1a1208] p-6 text-center">
      <div className="w-full max-w-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-900/40 text-3xl ring-1 ring-amber-500/30">
          ☕
        </div>
        <h1 className="font-display mt-4 text-2xl font-bold text-amber-50">
          3D isn&rsquo;t available here
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-white/60">
          Coffee Runner needs WebGL to draw the highlands, and this browser
          couldn&rsquo;t start it.
        </p>
        <ul className="mt-4 space-y-1.5 text-left text-xs text-white/50">
          <li>• Turn on hardware acceleration in your browser settings</li>
          <li>• Update your browser to the latest version</li>
          <li>• Try Chrome, Safari, Edge or Firefox</li>
          <li>• Close other heavy tabs and reload</li>
        </ul>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 min-h-[48px] w-full rounded-2xl bg-gradient-to-b from-amber-400 to-amber-600 px-4 font-display font-bold text-[#2a1a08] shadow-lg active:scale-[0.98]"
        >
          Try again
        </button>
        <p className="mt-4 text-[10px] text-white/30">{reason}</p>
      </div>
    </div>
  );
}

/** Cheap feature probe run before we attempt to boot the renderer. */
export function detectWebGL(): { ok: true } | { ok: false; reason: string } {
  if (typeof document === 'undefined') return { ok: false, reason: 'No document available' };
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl');
    if (!gl) return { ok: false, reason: 'WebGL context could not be created' };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Unknown WebGL error' };
  }
}
