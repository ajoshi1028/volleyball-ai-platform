"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { DetectionFrame, Play } from "../types";

export interface VideoPlayerHandle {
  seek: (time: number) => void;
}

interface Props {
  src: string;
  detections: DetectionFrame[];
  plays: Play[];
  analyzing: boolean;
  onTimeUpdate?: (currentTime: number) => void;
  onDurationChange?: (duration: number) => void;
  onThumbnail?: (dataUrl: string) => void;
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60)
    .toString()
    .padStart(2, "0")}`;
}

// Play type color scheme (exact spec from user)
const PLAY_COLORS: Record<
  string,
  { fill: string; stroke: string; glow: string; label: string }
> = {
  serve: {
    fill: "#ff6300",
    stroke: "#ff6300",
    glow: "rgba(255,99,0,0.6)",
    label: "SERVE",
  },
  set: {
    fill: "#22c55e",
    stroke: "#22c55e",
    glow: "rgba(34,197,94,0.6)",
    label: "SET",
  },
  dig: {
    fill: "#a855f7",
    stroke: "#a855f7",
    glow: "rgba(168,85,247,0.6)",
    label: "DIG",
  },
  spike: {
    fill: "#ef4444",
    stroke: "#ef4444",
    glow: "rgba(239,68,68,0.6)",
    label: "SPIKE",
  },
  block: {
    fill: "#3b82f6",
    stroke: "#3b82f6",
    glow: "rgba(59,130,246,0.6)",
    label: "BLOCK",
  },
};

const VideoPlayer = forwardRef<VideoPlayerHandle, Props>(function VideoPlayer(
  { src, detections, plays, analyzing, onTimeUpdate, onDurationChange, onThumbnail },
  ref
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrubberRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useImperativeHandle(ref, () => ({
    seek(time: number) {
      if (videoRef.current) videoRef.current.currentTime = time;
    },
  }));

  // ─── Canvas overlay with play-specific colored boxes ──────
  const drawOverlay = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = video.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const t = video.currentTime;

    // Find active play at current time
    const activePlay = plays.find(
      (p) =>
        t >= (p.start_time_sec ?? p.timestamp) &&
        t <= (p.end_time_sec ?? p.timestamp + 2)
    );

    // Find closest detection frame
    const frame = detections.reduce<DetectionFrame | null>((best, f) => {
      if (!best) return f;
      return Math.abs(f.timestamp - t) < Math.abs(best.timestamp - t) ? f : best;
    }, null);

    const isClose = frame && Math.abs(frame.timestamp - t) < 0.5;

    if (isClose && frame) {
      const videoW = video.videoWidth || 1920;
      const videoH = video.videoHeight || 1080;
      const displayAspect = rect.width / rect.height;
      const videoAspect = videoW / videoH;

      let scaleX: number, scaleY: number, offsetX: number, offsetY: number;
      if (displayAspect > videoAspect) {
        const renderH = rect.height;
        const renderW = renderH * videoAspect;
        scaleX = renderW / videoW;
        scaleY = renderH / videoH;
        offsetX = (rect.width - renderW) / 2;
        offsetY = 0;
      } else {
        const renderW = rect.width;
        const renderH = renderW / videoAspect;
        scaleX = renderW / videoW;
        scaleY = renderH / videoH;
        offsetX = 0;
        offsetY = (rect.height - renderH) / 2;
      }

      for (const obj of frame.objects) {
        const [x1, y1, x2, y2] = obj.bbox;
        const dx = x1 * scaleX + offsetX;
        const dy = y1 * scaleY + offsetY;
        const dw = (x2 - x1) * scaleX;
        const dh = (y2 - y1) * scaleY;

        if (obj.label === "player") {
          const isKey = obj.is_key_player === true;
          const playType = obj.play;

          if (isKey && playType) {
            const colors = PLAY_COLORS[playType] || PLAY_COLORS.serve;

            // Bold colored box with glow effect
            ctx.save();
            ctx.shadowColor = colors.glow;
            ctx.shadowBlur = 16;
            ctx.strokeStyle = colors.stroke;
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.roundRect(dx, dy, dw, dh, 5);
            ctx.stroke();
            ctx.restore();

            // Crisp stroke on top
            ctx.strokeStyle = colors.stroke;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.roundRect(dx, dy, dw, dh, 5);
            ctx.stroke();

            // Play label badge above the box
            const conf = Math.round(obj.confidence * 100);
            const labelText = `${colors.label} ${conf}%`;
            ctx.font = "bold 13px Inter, system-ui, sans-serif";
            const tw = ctx.measureText(labelText).width;
            const badgeW = tw + 16;
            const badgeH = 24;
            const badgeX = dx + (dw - badgeW) / 2;
            const badgeY = dy - badgeH - 6;

            // Badge background
            ctx.fillStyle = colors.fill;
            ctx.beginPath();
            ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 5);
            ctx.fill();

            // Badge text
            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "center";
            ctx.fillText(labelText, badgeX + badgeW / 2, badgeY + 17);
            ctx.textAlign = "start";
          } else {
            // Non-key players: subtle thin white dashed outline
            ctx.strokeStyle = "rgba(255,255,255,0.25)";
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(dx, dy, dw, dh);
            ctx.setLineDash([]);
          }
        } else if (obj.label === "ball") {
          // Ball: yellow glowing circle
          const cx = ((x1 + x2) / 2) * scaleX + offsetX;
          const cy = ((y1 + y2) / 2) * scaleY + offsetY;
          const r = Math.max(dw, dh) / 2 + 8;

          // Outer glow
          ctx.save();
          ctx.shadowColor = "#fbbf24";
          ctx.shadowBlur = 20;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.strokeStyle = "#fbbf24";
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.restore();

          // Second ring
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(251,191,36,0.6)";
          ctx.lineWidth = 2;
          ctx.stroke();

          // Center dot
          ctx.beginPath();
          ctx.arc(cx, cy, 3, 0, Math.PI * 2);
          ctx.fillStyle = "#fbbf24";
          ctx.fill();

          // Label
          ctx.font = "bold 11px Inter, system-ui, sans-serif";
          ctx.fillStyle = "#fbbf24";
          ctx.fillText(
            `Ball ${Math.round(obj.confidence * 100)}%`,
            cx + r + 8,
            cy + 4
          );
        }
      }
    }

    // Active play banner at top center
    if (activePlay) {
      const playKey = activePlay.label.toLowerCase();
      const colors = PLAY_COLORS[playKey] || PLAY_COLORS.serve;

      const bannerW = 240;
      const bannerH = 44;
      const bannerX = (canvas.width - bannerW) / 2;
      const bannerY = 16;

      // Background
      ctx.save();
      ctx.shadowColor = colors.glow;
      ctx.shadowBlur = 24;
      ctx.fillStyle = colors.fill + "dd";
      ctx.beginPath();
      ctx.roundRect(bannerX, bannerY, bannerW, bannerH, 12);
      ctx.fill();
      ctx.restore();

      // Accent line
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.fillRect(bannerX + 14, bannerY + 12, 3, bannerH - 24);

      // Text
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 20px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        activePlay.label.toUpperCase(),
        canvas.width / 2,
        bannerY + 30
      );
      ctx.textAlign = "start";
    }

    animFrameRef.current = requestAnimationFrame(drawOverlay);
  }, [detections, plays]);

  useEffect(() => {
    if (detections.length > 0 || plays.length > 0) {
      animFrameRef.current = requestAnimationFrame(drawOverlay);
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [detections, plays, drawOverlay]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      const v = videoRef.current;
      if (!v) return;
      if (e.code === "Space") {
        e.preventDefault();
        playing ? v.pause() : v.play();
        setPlaying(!playing);
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        v.currentTime = Math.max(0, v.currentTime - 5);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        v.currentTime = Math.min(v.duration, v.currentTime + 5);
      } else if (e.code === "KeyF") {
        e.preventDefault();
        toggleFullscreen();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing]);

  useEffect(() => {
    function onChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    playing ? v.pause() : v.play();
    setPlaying(!playing);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen();
    else document.exitFullscreen();
  }

  function handleTimeUpdate() {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
    onTimeUpdate?.(v.currentTime);
  }

  function handleLoadedMetadata() {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration);
    onDurationChange?.(v.duration);

    if (!onThumbnail) return;
    const seekTo = Math.min(1, v.duration * 0.1);
    v.currentTime = seekTo;
    v.addEventListener(
      "seeked",
      function capture() {
        v.removeEventListener("seeked", capture);
        const c = document.createElement("canvas");
        c.width = 320;
        c.height = 180;
        c.getContext("2d")?.drawImage(v, 0, 0, 320, 180);
        onThumbnail(c.toDataURL("image/jpeg", 0.7));
        v.currentTime = 0;
      },
      { once: true }
    );
  }

  function scrubTo(e: React.MouseEvent<HTMLDivElement>) {
    if (!scrubberRef.current || duration === 0) return;
    const r = scrubberRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    if (videoRef.current) videoRef.current.currentTime = pct * duration;
  }

  const pct = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;
  const hasOverlay = detections.length > 0 || plays.length > 0;

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col h-full bg-black rounded-xl overflow-hidden"
    >
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full object-contain"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setPlaying(false)}
        onClick={togglePlay}
        playsInline
      />

      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ display: hasOverlay ? "block" : "none" }}
      />

      {/* Analyzing spinner overlay */}
      {analyzing && !hasOverlay && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 pointer-events-none">
          <div
            className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin-slow"
            style={{ borderColor: "var(--ppu-orange)", borderTopColor: "transparent" }}
          />
          <p className="text-xs text-white/70 mt-3 font-medium">Analyzing video...</p>
        </div>
      )}

      {/* Controls */}
      <div
        className="absolute bottom-0 left-0 right-0 flex flex-col gap-2 px-4 pt-8 pb-3"
        style={{
          background: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 100%)",
        }}
      >
        {/* Scrubber */}
        <div
          ref={scrubberRef}
          onClick={scrubTo}
          onMouseMove={(e) => e.buttons === 1 && scrubTo(e)}
          className="relative flex items-center h-5 cursor-pointer group"
        >
          {/* Play markers */}
          {plays.map((play, i) => {
            const left =
              duration > 0
                ? ((play.start_time_sec ?? play.timestamp) / duration) * 100
                : 0;
            const playKey = play.label.toLowerCase();
            const color = PLAY_COLORS[playKey]?.fill || "#ff6300";
            return (
              <div
                key={i}
                className="absolute top-0 bottom-0 flex items-center pointer-events-none"
                style={{ left: `${left}%` }}
              >
                <div
                  className="w-1 h-3 rounded-full"
                  style={{ background: color, opacity: 0.7 }}
                />
              </div>
            );
          })}

          <div
            className="absolute inset-x-0 h-1 rounded-full"
            style={{ background: "rgba(255,255,255,0.15)" }}
          />
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 h-1 rounded-full pointer-events-none"
            style={{ width: `${pct}%`, background: "var(--ppu-orange)" }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
            style={{
              left: `${pct}%`,
              background: "var(--ppu-orange)",
              boxShadow: "0 0 8px rgba(255,99,0,0.8)",
            }}
          />
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            className="text-white hover:text-[var(--ppu-orange)] transition-colors"
          >
            {playing ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7L8 5z" />
              </svg>
            )}
          </button>

          <span className="text-xs tabular-nums text-white/60">
            {formatTime(currentTime)}
            {duration > 0 ? ` / ${formatTime(duration)}` : ""}
          </span>

          <div className="flex-1" />

          {hasOverlay && !analyzing && (
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
              style={{
                background: "rgba(255,99,0,0.2)",
                color: "var(--ppu-orange)",
              }}
            >
              AI OVERLAY
            </span>
          )}

          <button
            onClick={toggleFullscreen}
            className="text-white/50 hover:text-white transition-colors"
          >
            {isFullscreen ? (
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 9V5H5m14 4V5h-4M5 15h4v4m10-4h-4v4"
                />
              </svg>
            ) : (
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 8V4h4M16 4h4v4M4 16v4h4m12-4v4h-4"
                />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
});

export default VideoPlayer;
