"use client";

import { Play, TrackedPlayer, VideoStats } from "../types";

interface Props {
  stats: VideoStats | null;
  plays: Play[];
  players: TrackedPlayer[];
  currentTime: number;
  analyzing: boolean;
}

const PLAY_TYPES = ["serve", "dig", "set", "spike", "block"] as const;

const PLAY_COLORS: Record<string, string> = {
  serve: "#ff6300",
  set: "#22c55e",
  dig: "#a855f7",
  spike: "#ef4444",
  block: "#3b82f6",
};

export default function StatsPanel({
  stats,
  plays,
  players,
  currentTime,
  analyzing,
}: Props) {
  const playCounts: Record<string, number> = {};
  plays.forEach((p) => {
    const key = p.label.toLowerCase();
    playCounts[key] = (playCounts[key] || 0) + 1;
  });

  const activePlay = plays.find(
    (p) =>
      currentTime >= (p.start_time_sec ?? p.timestamp) &&
      currentTime <= (p.end_time_sec ?? p.timestamp + 2)
  );

  return (
    <div
      className="flex flex-col h-full border-l overflow-y-auto"
      style={{ background: "var(--ppu-panel)", borderColor: "var(--ppu-border)" }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 border-b shrink-0"
        style={{ borderColor: "var(--ppu-border)" }}
      >
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">
          Video Analysis
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
        {analyzing ? (
          <SkeletonLoader />
        ) : stats ? (
          <>
            {/* Active Play Indicator */}
            {activePlay && (
              <div
                className="rounded-xl p-3 animate-fade-in"
                style={{
                  background:
                    (PLAY_COLORS[activePlay.label.toLowerCase()] || "#ff6300") + "20",
                  borderLeft: `3px solid ${PLAY_COLORS[activePlay.label.toLowerCase()] || "#ff6300"}`,
                }}
              >
                <p
                  className="text-[10px] uppercase tracking-wider font-bold"
                  style={{
                    color: PLAY_COLORS[activePlay.label.toLowerCase()],
                  }}
                >
                  Active Play
                </p>
                <p className="text-lg font-bold text-white mt-0.5">
                  {activePlay.label.charAt(0).toUpperCase() + activePlay.label.slice(1)}
                  {activePlay.confidence && (
                    <span className="text-sm font-normal text-slate-400 ml-2">
                      {Math.round(activePlay.confidence * 100)}%
                    </span>
                  )}
                </p>
              </div>
            )}

            {/* Play Summary */}
            <Section title="Play Breakdown">
              <div className="grid grid-cols-2 gap-2">
                {PLAY_TYPES.map((type) => (
                  <div
                    key={type}
                    className="rounded-lg p-2.5"
                    style={{ background: "var(--ppu-card)" }}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ background: PLAY_COLORS[type] }}
                      />
                      <span className="text-[10px] uppercase font-semibold text-slate-400">
                        {type}
                      </span>
                    </div>
                    <p
                      className="text-xl font-bold tabular-nums"
                      style={{ color: PLAY_COLORS[type] }}
                    >
                      {playCounts[type] || 0}
                    </p>
                  </div>
                ))}
                <div
                  className="rounded-lg p-2.5"
                  style={{ background: "var(--ppu-card)" }}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="w-2 h-2 rounded-full bg-white/30" />
                    <span className="text-[10px] uppercase font-semibold text-slate-400">
                      Total
                    </span>
                  </div>
                  <p className="text-xl font-bold tabular-nums text-white">
                    {plays.length}
                  </p>
                </div>
              </div>
            </Section>

            {/* Player Detection */}
            <Section title="Player Detection">
              <div className="space-y-2">
                <StatRow
                  label="Players in Frame"
                  value={String(players.length)}
                  accent
                />
                <StatRow
                  label="Max in Frame"
                  value={String(stats.maxPlayersInFrame)}
                />
                <StatRow
                  label="Avg per Frame"
                  value={String(stats.avgPlayersPerFrame)}
                />
                <StatRow
                  label="Total Detections"
                  value={stats.playersDetected.toLocaleString()}
                />
              </div>
            </Section>

            {/* Ball Tracking */}
            <Section title="Ball Tracking">
              <div className="space-y-2">
                <StatRow
                  label="Detection Rate"
                  value={`${stats.ballDetectionRate}%`}
                  accent={stats.ballDetectionRate > 0}
                />
                {stats.ballSpeed ? (
                  <>
                    <StatRow
                      label="Avg Speed"
                      value={`${Math.round(stats.ballSpeed.avg_px_per_sec)} px/s`}
                    />
                    <StatRow
                      label="Max Speed"
                      value={`${Math.round(stats.ballSpeed.max_px_per_sec)} px/s`}
                      accent
                    />
                  </>
                ) : (
                  <p className="text-[11px] text-slate-600 italic">
                    No ball speed data available
                  </p>
                )}
              </div>
            </Section>

            {/* Mini Court — Player positions */}
            <Section title="Player Positions">
              <div
                className="relative rounded-lg overflow-hidden w-full"
                style={{ background: "#0d1f2d", aspectRatio: "16/9" }}
              >
                {/* Court lines */}
                <div
                  className="absolute inset-2 border rounded-sm"
                  style={{ borderColor: "#1e3a4a" }}
                />
                <div
                  className="absolute top-2 bottom-2 w-px"
                  style={{ left: "50%", background: "#2a5070" }}
                />
                <div
                  className="absolute top-2 bottom-2 w-px"
                  style={{
                    left: "calc(50% - 22%)",
                    background: "#1e3a4a",
                    opacity: 0.5,
                  }}
                />
                <div
                  className="absolute top-2 bottom-2 w-px"
                  style={{
                    left: "calc(50% + 22%)",
                    background: "#1e3a4a",
                    opacity: 0.5,
                  }}
                />

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
                      transition: "left 1s ease, top 1s ease, opacity 0.5s ease",
                      boxShadow: "0 0 6px rgba(255,99,0,0.4)",
                    }}
                  />
                ))}

                {players.length === 0 && (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-[10px] text-slate-600">No players detected</p>
                  </div>
                )}
              </div>
            </Section>

            {/* Video Info */}
            <Section title="Video Info">
              <div className="space-y-2">
                <StatRow label="Resolution" value={stats.resolution} />
                <StatRow label="FPS" value={String(stats.fps)} />
                <StatRow
                  label="Frames Processed"
                  value={stats.processedFrames.toLocaleString()}
                />
                <StatRow
                  label="Total Frames"
                  value={stats.totalFrames.toLocaleString()}
                />
              </div>
            </Section>
          </>
        ) : (
          <EmptyState />
        )}
      </div>

      {/* Footer */}
      <div
        className="px-4 py-2 border-t shrink-0 text-center"
        style={{ borderColor: "var(--ppu-border)" }}
      >
        <p className="text-[9px] text-slate-600 uppercase tracking-wider">
          Pepperdine x StatsPerform AI
        </p>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

function StatRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between px-3 py-2 rounded-lg"
      style={{ background: "var(--ppu-card)" }}
    >
      <span className="text-xs text-slate-400">{label}</span>
      <span
        className={`text-xs font-bold tabular-nums ${accent ? "text-[var(--ppu-orange)]" : "text-white"}`}
      >
        {value}
      </span>
    </div>
  );
}

function SkeletonLoader() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i}>
          <div className="h-3 w-20 rounded bg-slate-700/40 mb-2 animate-pulse" />
          <div className="space-y-1.5">
            <div
              className="h-9 rounded-lg animate-pulse"
              style={{ background: "var(--ppu-card)" }}
            />
            <div
              className="h-9 rounded-lg animate-pulse"
              style={{ background: "var(--ppu-card)" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-16">
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center"
        style={{ background: "var(--ppu-card)" }}
      >
        <svg
          className="w-6 h-6 text-slate-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      </div>
      <p className="text-xs text-slate-600 leading-relaxed">
        Analysis data will appear
        <br />
        once AI detection runs
      </p>
    </div>
  );
}
