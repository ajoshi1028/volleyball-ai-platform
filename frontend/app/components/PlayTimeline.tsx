"use client";

// -----------------------------------------------------------------
// Josh: when /results/{video_id} returns play data, pass it in via
// the `plays` prop. Update the Play type in ../types.ts to match
// the actual response shape. Each play needs a timestamp so
// clicking it seeks the video (wired up via onSeek).
// -----------------------------------------------------------------

import { Play } from "../types";

interface Props {
  plays: Play[];
  duration: number;
  analyzing: boolean;
  onSeek: (time: number) => void;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function PlayTimeline({ plays, duration, analyzing, onSeek }: Props) {
  if (!analyzing && plays.length === 0) return null;

  return (
    <div className="border-t px-4 py-2.5" style={{ background: "var(--ppu-panel)", borderColor: "var(--ppu-border)" }}>
      {analyzing ? (
        <div className="flex gap-2">
          {[72, 96, 56, 88, 64].map((w, i) => (
            <div key={i} className="h-5 rounded-full animate-pulse" style={{ width: `${w}px`, background: "var(--ppu-card)" }} />
          ))}
        </div>
      ) : (
        <div className="flex gap-1.5 overflow-x-auto">
          {plays.map((play) => (
            <button
              key={play.id}
              onClick={() => onSeek(play.timestamp)}
              className="shrink-0 flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-all hover:opacity-80 border"
              style={{ background: "var(--ppu-orange-dim)", color: "var(--ppu-orange)", borderColor: "rgba(255,99,0,0.3)" }}
            >
              {play.label}
              <span className="text-slate-500 font-normal">{formatTime(play.timestamp)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
