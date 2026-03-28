"use client";

import { Play } from "../types";

interface Props {
  plays: Play[];
  duration: number;
  analyzing: boolean;
  onSeek: (time: number) => void;
}

const PLAY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  serve: { bg: "rgba(255,99,0,0.15)", text: "#ff6300", border: "rgba(255,99,0,0.3)" },
  set:   { bg: "rgba(34,197,94,0.15)", text: "#22c55e", border: "rgba(34,197,94,0.3)" },
  dig:   { bg: "rgba(168,85,247,0.15)", text: "#a855f7", border: "rgba(168,85,247,0.3)" },
  spike: { bg: "rgba(239,68,68,0.15)", text: "#ef4444", border: "rgba(239,68,68,0.3)" },
  block: { bg: "rgba(59,130,246,0.15)", text: "#3b82f6", border: "rgba(59,130,246,0.3)" },
};

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

export default function PlayTimeline({ plays, duration, analyzing, onSeek }: Props) {
  if (!analyzing && plays.length === 0) return null;

  return (
    <div className="border-t px-4 py-2.5 shrink-0" style={{ background: "var(--ppu-panel)", borderColor: "var(--ppu-border)" }}>
      {analyzing ? (
        <div className="flex gap-2">
          {[72, 96, 56, 88, 64].map((w, i) => (
            <div key={i} className="h-7 rounded-full animate-pulse" style={{ width: `${w}px`, background: "var(--ppu-card)" }} />
          ))}
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          {plays.map((play) => {
            const key = play.label.toLowerCase();
            const c = PLAY_COLORS[key] || PLAY_COLORS.serve;
            return (
              <button
                key={play.id}
                onClick={() => onSeek(play.timestamp)}
                className="shrink-0 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-all hover:scale-105 border"
                style={{ background: c.bg, color: c.text, borderColor: c.border }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.text }} />
                {play.label.charAt(0).toUpperCase() + play.label.slice(1)}
                <span className="text-[10px] font-normal opacity-60">{formatTime(play.timestamp)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
