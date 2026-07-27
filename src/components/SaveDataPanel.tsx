/**
 * Save data management.
 *
 * Gives the player real control over their progress: see what's stored,
 * copy a transfer code to move devices, paste one to restore, and reset with
 * a genuine confirmation instead of a single tap that nukes everything.
 */

import { useState } from 'react';
import type { Profile } from '../game/progression';
import { exportProfile } from '../game/progression';
import { Button, Card, Dialog, Sheet } from './ui';

export function SaveDataPanel({
  profile,
  onBack,
  onImport,
  onReset,
  onToast,
}: {
  profile: Profile;
  onBack: () => void;
  onImport: (code: string) => boolean;
  onReset: () => void;
  onToast: (msg: string) => void;
}) {
  const [code, setCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetPhrase, setResetPhrase] = useState('');

  const exported = showCode ? exportProfile(profile) : '';

  const copy = async () => {
    const text = exportProfile(profile);
    try {
      await navigator.clipboard.writeText(text);
      onToast('Save code copied 📋');
    } catch {
      // Clipboard is blocked in some webviews — reveal it so the player can
      // select it by hand rather than hitting a dead end.
      setShowCode(true);
      onToast('Copy blocked — select the code below');
    }
  };

  const doImport = () => {
    if (!code.trim()) return;
    const ok = onImport(code.trim());
    if (ok) {
      onToast('Progress restored! 🎉');
      setCode('');
    } else {
      onToast('That code is not valid ❌');
    }
  };

  const stats = profile.stats;

  return (
    <Sheet title="Save Data" subtitle="Back up or move your progress" icon="💾" onBack={onBack}>
      {/* summary */}
      <Card className="mb-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200/60">
          Stored on this device
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          <Row label="Runs" value={stats.runs.toLocaleString()} />
          <Row label="Best score" value={stats.bestScore.toLocaleString()} />
          <Row label="Coins" value={profile.coins.toLocaleString()} />
          <Row label="Gems" value={profile.gems.toLocaleString()} />
          <Row label="Characters" value={`${profile.ownedCharacters.length}`} />
          <Row label="Outfits" value={`${profile.ownedOutfits.length}`} />
        </dl>
        <p className="mt-3 text-[10px] leading-relaxed text-white/40">
          Progress is written automatically to two independent slots, so a crash
          or a closed tab can never lose more than your most recent run.
        </p>
      </Card>

      {/* export */}
      <Card className="mb-3">
        <h3 className="font-display text-sm font-bold text-amber-50">Transfer to another device</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-white/50">
          Copy this code, then paste it into Save Data on your other phone.
        </p>
        <div className="mt-3 flex gap-2">
          <Button variant="primary" size="sm" className="flex-1" onClick={copy}>
            📋 Copy Save Code
          </Button>
          <Button size="sm" onClick={() => setShowCode((s) => !s)}>
            {showCode ? 'Hide' : 'Show'}
          </Button>
        </div>
        {showCode && (
          <textarea
            data-ui
            readOnly
            value={exported}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-3 h-24 w-full resize-none rounded-xl bg-black/40 p-2 font-mono text-[10px] leading-tight text-emerald-200/80 ring-1 ring-white/10"
          />
        )}
      </Card>

      {/* import */}
      <Card className="mb-3">
        <h3 className="font-display text-sm font-bold text-amber-50">Restore from a code</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-white/50">
          This replaces everything currently on this device.
        </p>
        <textarea
          data-ui
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Paste your save code here…"
          className="mt-3 h-20 w-full resize-none rounded-xl bg-black/40 p-2 font-mono text-[10px] text-white/80 ring-1 ring-white/10 placeholder:text-white/25"
        />
        <Button
          variant="primary"
          size="sm"
          className="mt-2 w-full"
          disabled={!code.trim()}
          onClick={doImport}
        >
          Restore Progress
        </Button>
      </Card>

      {/* danger zone */}
      <Card className="border border-red-900/40 bg-red-950/20">
        <h3 className="font-display text-sm font-bold text-red-200">Danger zone</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-white/50">
          Deletes every coin, character, mission and score. This cannot be undone.
        </p>
        <Button
          variant="danger"
          size="sm"
          className="mt-3 w-full"
          onClick={() => {
            setResetPhrase('');
            setConfirmReset(true);
          }}
        >
          Reset All Progress
        </Button>
      </Card>

      {confirmReset && (
        <Dialog title="Erase everything?" tone="danger" onClose={() => setConfirmReset(false)}>
          <p className="text-center text-xs leading-relaxed text-white/70">
            You will lose {stats.runs} runs, {profile.coins.toLocaleString()} coins and every
            unlock. Type <span className="font-bold text-red-300">RESET</span> to confirm.
          </p>
          <input
            data-ui
            value={resetPhrase}
            onChange={(e) => setResetPhrase(e.target.value.toUpperCase())}
            placeholder="RESET"
            className="mt-3 w-full rounded-xl bg-black/50 px-3 py-2 text-center font-bold tracking-[0.3em] text-red-200 ring-1 ring-red-800/50 placeholder:text-white/20"
          />
          <div className="mt-4 flex gap-2">
            <Button size="sm" className="flex-1" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              className="flex-1"
              disabled={resetPhrase !== 'RESET'}
              onClick={() => {
                onReset();
                setConfirmReset(false);
                onToast('Progress reset');
              }}
            >
              Erase
            </Button>
          </div>
        </Dialog>
      )}
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-white/45">{label}</dt>
      <dd className="text-right font-bold tabular-nums text-amber-100">{value}</dd>
    </>
  );
}
