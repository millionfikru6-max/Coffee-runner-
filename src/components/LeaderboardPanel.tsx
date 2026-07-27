/**
 * Leaderboard panel.
 *
 * Previously the top-10 was a cramped list buried at the bottom of the Stats
 * screen. This promotes it to a first-class destination with a podium for the
 * top three, medal tiers, per-entry detail, and a rank badge derived from the
 * player's best score so there's a visible long-term goal.
 */

import { useMemo, useState } from 'react';
import type { LeaderEntry, Profile } from '../game/progression';
import { Card, EmptyState, Pill, Segmented, Sheet } from './ui';
import { cn } from '../lib/cn';

type Sort = 'score' | 'distance';

/** Long-term rank ladder — gives players something to climb toward. */
const TIERS = [
  { min: 0, name: 'Bean Picker', icon: '🌱', color: 'text-lime-300' },
  { min: 2_500, name: 'Trail Runner', icon: '👟', color: 'text-emerald-300' },
  { min: 7_500, name: 'Highland Courier', icon: '🏃', color: 'text-sky-300' },
  { min: 15_000, name: 'Coffee Champion', icon: '☕', color: 'text-amber-300' },
  { min: 30_000, name: 'Simien Legend', icon: '⛰️', color: 'text-orange-300' },
  { min: 60_000, name: 'Nile Immortal', icon: '👑', color: 'text-yellow-200' },
];

export function tierFor(score: number) {
  let t = TIERS[0];
  for (const tier of TIERS) if (score >= tier.min) t = tier;
  return t;
}

function nextTier(score: number) {
  return TIERS.find((t) => t.min > score) ?? null;
}

function medal(i: number): { icon: string; ring: string } | null {
  if (i === 0) return { icon: '🥇', ring: 'ring-yellow-400/60 bg-yellow-400/10' };
  if (i === 1) return { icon: '🥈', ring: 'ring-slate-300/50 bg-slate-300/10' };
  if (i === 2) return { icon: '🥉', ring: 'ring-amber-600/50 bg-amber-600/10' };
  return null;
}

function relativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function LeaderboardPanel({ profile, onBack }: { profile: Profile; onBack: () => void }) {
  const [sort, setSort] = useState<Sort>('score');

  const entries = useMemo(() => {
    const list = [...profile.leaderboard];
    list.sort((a, b) => (sort === 'score' ? b.score - a.score : b.distance - a.distance));
    return list;
  }, [profile.leaderboard, sort]);

  const best = profile.stats.bestScore;
  const tier = tierFor(best);
  const next = nextTier(best);

  return (
    <Sheet
      title="Leaderboard"
      subtitle="Your ten best runs"
      icon="🏆"
      onBack={onBack}
      right={<Pill tone="gold">{profile.leaderboard.length}/10</Pill>}
    >
      {/* ---- rank badge ---- */}
      <Card className="mb-4 bg-gradient-to-br from-amber-900/40 to-black/30" glow>
        <div className="flex items-center gap-3">
          <div className="text-4xl" aria-hidden>
            {tier.icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200/60">
              Your Rank
            </div>
            <div className={cn('font-display truncate text-lg font-extrabold', tier.color)}>
              {tier.name}
            </div>
            <div className="text-[11px] text-white/50">
              Best score {best.toLocaleString()}
            </div>
          </div>
        </div>
        {next && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-[10px] text-white/45">
              <span>Next: {next.icon} {next.name}</span>
              <span className="tabular-nums">{(next.min - best).toLocaleString()} to go</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-black/40">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-[width] duration-700"
                style={{
                  width: `${Math.min(100, ((best - tier.min) / Math.max(1, next.min - tier.min)) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}
      </Card>

      <div className="mb-3">
        <Segmented<Sort>
          value={sort}
          onChange={setSort}
          options={[
            { value: 'score', label: '🏆 By Score' },
            { value: 'distance', label: '📏 By Distance' },
          ]}
        />
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon="🏃🏾"
          title="No runs yet"
          hint="Finish a run and your best scores will appear here."
        />
      ) : (
        <ol className="space-y-2">
          {entries.map((e, i) => (
            <Row key={`${e.date}-${i}`} entry={e} index={i} sort={sort} />
          ))}
        </ol>
      )}

      <p className="mt-4 text-center text-[10px] leading-relaxed text-white/35">
        Scores are stored on this device. Use Settings → Save Data to move your
        progress to another phone.
      </p>
    </Sheet>
  );
}

function Row({ entry, index, sort }: { entry: LeaderEntry; index: number; sort: Sort }) {
  const m = medal(index);
  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-2xl px-3 py-2.5 ring-1 transition',
        m ? m.ring : 'bg-white/[0.045] ring-white/8',
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/30 text-base font-bold tabular-nums text-white/70">
        {m ? <span className="text-lg">{m.icon}</span> : index + 1}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span aria-hidden>{entry.emoji}</span>
          <span className="truncate text-sm font-bold text-amber-50">{entry.name}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 text-[10px] text-white/45">
          <span className="capitalize">{entry.biome}</span>
          <span className="text-white/20">·</span>
          <span>{relativeDate(entry.date)}</span>
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div
          className={cn(
            'font-display text-base font-extrabold tabular-nums',
            index === 0 ? 'text-yellow-300' : 'text-white',
          )}
        >
          {sort === 'score' ? entry.score.toLocaleString() : `${entry.distance}m`}
        </div>
        <div className="text-[10px] tabular-nums text-white/40">
          {sort === 'score' ? `${entry.distance}m` : entry.score.toLocaleString()}
        </div>
      </div>
    </li>
  );
}
