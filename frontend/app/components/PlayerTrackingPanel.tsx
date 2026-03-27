"use client";

// -----------------------------------------------------------------
// Yoshi: when /detect returns player data, pass it in via the
// `players` prop. Update the TrackedPlayer type in ../types.ts
// to match the actual response shape.
// -----------------------------------------------------------------

import { TrackedPlayer } from "../types";

interface Props {
  players: TrackedPlayer[];
  currentTime: number;
  analyzing: boolean;
}

export default function PlayerTrackingPanel({ players, currentTime, analyzing }: Props) {
  return (
    <div className="flex flex-col h-full border-l" style={{ background: "var(--ppu-panel)", borderColor: "var(--ppu-border)" }}>
      {/* Header */}
      <div className="px-4 py-3 border-b" style={{ borderColor: "var(--ppu-border)" }}>
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Player Tracking</h2>
          <span className="text-xs tabular-nums" style={{ color: "var(--ppu-orange)" }}>
            {currentTime.toFixed(1)}s
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {analyzing ? (
          // Skeleton loading state
          <>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-3 animate-pulse" style={{ background: "var(--ppu-card)" }}>
                <div className="w-2 h-2 rounded-full shrink-0 bg-slate-700" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-2.5 rounded bg-slate-700" style={{ width: `${50 + Math.random() * 40}%` }} />
                  <div className="h-2 rounded bg-slate-800" style={{ width: `${30 + Math.random() * 30}%` }} />
                </div>
              </div>
            ))}
          </>
        ) : players.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-12">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "var(--ppu-card)" }}>
              <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Player tracking will appear<br />once detection runs
            </p>
          </div>
        ) : (
          players.map((player) => (
            <div key={player.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5" style={{ background: "var(--ppu-card)" }}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: "var(--ppu-orange)" }}>
                {(player.jersey as number) ?? "?"}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-white">{(player.position as string) ?? "—"}</span>
                {/* Replace with real positional data once Yoshi finalizes schema */}
                {player.x !== undefined && (
                  <span className="text-xs text-slate-500 tabular-nums">
                    x {Number(player.x).toFixed(2)} · y {Number(player.y).toFixed(2)}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
