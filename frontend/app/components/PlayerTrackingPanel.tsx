"use client";

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

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {analyzing ? (
          <div className="space-y-3">
            <div className="rounded-lg animate-pulse" style={{ background: "var(--ppu-card)", height: 120 }} />
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2.5 animate-pulse" style={{ background: "var(--ppu-card)" }}>
                <div className="w-5 h-5 rounded-full bg-slate-700 shrink-0" />
                <div className="flex-1 h-2.5 rounded bg-slate-700" />
              </div>
            ))}
          </div>
        ) : players.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-12">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "var(--ppu-card)" }}>
              <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Player positions will appear<br />once detection runs
            </p>
          </div>
        ) : (
          <>
            {/* Player count */}
            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-slate-500">Detected</span>
              <span className="text-xs font-bold tabular-nums" style={{ color: "var(--ppu-orange)" }}>
                {players.length} players
              </span>
            </div>

            {/* Mini court — div-based so CSS transitions work on player dots */}
            <div
              className="relative rounded-lg overflow-hidden w-full"
              style={{ background: "#0d1f2d", aspectRatio: "16/9" }}
            >
              {/* Court outline */}
              <div className="absolute inset-2 border rounded-sm" style={{ borderColor: "#1e3a4a" }} />
              {/* Net */}
              <div className="absolute top-2 bottom-2 w-px" style={{ left: "50%", background: "#2a5070" }} />
              {/* Attack lines */}
              <div className="absolute top-2 bottom-2 w-px" style={{ left: "calc(50% - 22%)", background: "#1e3a4a", opacity: 0.6 }} />
              <div className="absolute top-2 bottom-2 w-px" style={{ left: "calc(50% + 22%)", background: "#1e3a4a", opacity: 0.6 }} />

              {/* Player dots — absolutely positioned with CSS transitions */}
              {players.map((p) => (
                <div
                  key={p.id}
                  className="absolute rounded-full"
                  style={{
                    left: `${p.x * 100}%`,
                    top: `${p.y * 100}%`,
                    width: 10,
                    height: 10,
                    marginLeft: -5,
                    marginTop: -5,
                    background: "var(--ppu-orange)",
                    opacity: 0.5 + p.confidence * 0.5,
                    transition: "left 0.6s ease, top 0.6s ease, opacity 0.3s ease",
                  }}
                />
              ))}
            </div>

            {/* Player list */}
            <div className="space-y-1.5">
              {players.map((p) => {
                const xLabel = p.x < 0.33 ? "Left" : p.x > 0.66 ? "Right" : "Center";
                const yLabel = p.y < 0.4 ? "Front" : p.y > 0.7 ? "Back" : "Mid";
                return (
                  <div key={p.id} className="flex items-center gap-2.5 rounded-lg px-3 py-2" style={{ background: "var(--ppu-card)" }}>
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: "var(--ppu-orange)", opacity: 0.5 + p.confidence * 0.5 }} />
                    <div className="flex-1 flex items-center justify-between min-w-0">
                      <span className="text-xs text-slate-300">{yLabel} {xLabel}</span>
                      <span className="text-xs tabular-nums text-slate-500">{Math.round(p.confidence * 100)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
