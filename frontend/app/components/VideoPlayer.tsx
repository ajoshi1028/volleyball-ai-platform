"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
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

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const PLAY_COLORS: Record<string, string> = {
  serve: "#ff6300",
  spike: "#ef4444",
  block: "#3b82f6",
  set: "#22c55e",
  dig: "#a855f7",
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

  // ─── Canvas overlay drawing ───────────────────────────────────
  const drawOverlay = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Match canvas size to video display size
    const rect = video.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const t = video.currentTime;

    // Find current play
    const activePlay = plays.find(
      (p) => t >= (p.start_time_sec ?? p.timestamp) && t <= (p.end_time_sec ?? p.timestamp + 2)
    );

    // Find closest detection frame
    const frame = detections.reduce<DetectionFrame | null>((best, f) => {
      if (!best) return f;
      return Math.abs(f.timestamp - t) < Math.abs(best.timestamp - t) ? f : best;
    }, null);

    const isFrameClose = frame && Math.abs(frame.timestamp - t) < 0.5;

    if (isFrameClose && frame) {
      // Compute scale: detection coords are in original video resolution
      // We need to map them to the canvas display size
      const videoW = video.videoWidth || 1920;
      const videoH = video.videoHeight || 1080;

      // Account for object-contain: video is centered with letterboxing
      const displayAspect = rect.width / rect.height;
      const videoAspect = videoW / videoH;

      let scaleX: number, scaleY: number, offsetX: number, offsetY: number;
      if (displayAspect > videoAspect) {
        // Letterboxed on sides
        const renderH = rect.height;
        const renderW = renderH * videoAspect;
        scaleX = renderW / videoW;
        scaleY = renderH / videoH;
        offsetX = (rect.width - renderW) / 2;
        offsetY = 0;
      } else {
        // Letterboxed on top/bottom
        const renderW = rect.width;
        const renderH = renderW / videoAspect;
        scaleX = renderW / videoW;
        scaleY = renderH / videoH;
        offsetX = 0;
        offsetY = (rect.height - renderH) / 2;
      }

      // Draw bounding boxes — only highlight key players making the play
      for (const obj of frame.objects) {
        const [x1, y1, x2, y2] = obj.bbox;
        const dx = x1 * scaleX + offsetX;
        const dy = y1 * scaleY + offsetY;
        const dw = (x2 - x1) * scaleX;
        const dh = (y2 - y1) * scaleY;

        if (obj.label === "player") {
          const isKeyPlayer = (obj as any).is_key_player === true;
          const playType = (obj as any).play as string | undefined;

          if (isKeyPlayer && playType) {
            // KEY PLAYER — bold colored box + play label
            const color = PLAY_COLORS[playType] || "#ff6300";
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.strokeRect(dx, dy, dw, dh);

            // Glow effect
            ctx.shadowColor = color;
            ctx.shadowBlur = 8;
            ctx.strokeRect(dx, dy, dw, dh);
            ctx.shadowBlur = 0;

            // Play label with confidence
            const conf = Math.round(obj.confidence * 100);
            const labelText = `${playType.charAt(0).toUpperCase() + playType.slice(1)} ${conf}%`;
            ctx.font = "bold 13px sans-serif";
            const textW = ctx.measureText(labelText).width;

            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.roundRect(dx, dy - 22, textW + 12, 22, 4);
            ctx.fill();
            ctx.fillStyle = "#fff";
            ctx.fillText(labelText, dx + 6, dy - 6);
          } else {
            // OTHER PLAYERS — subtle thin outline only
            ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
            ctx.lineWidth = 1;
            ctx.strokeRect(dx, dy, dw, dh);
          }
        } else if (obj.label === "ball") {
          // Ball: bright yellow circle with glow
          const cx = (x1 + x2) / 2 * scaleX + offsetX;
          const cy = (y1 + y2) / 2 * scaleY + offsetY;
          const r = Math.max(dw, dh) / 2 + 5;

          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.strokeStyle = "#fbbf24";
          ctx.lineWidth = 3;
          ctx.shadowColor = "#fbbf24";
          ctx.shadowBlur = 10;
          ctx.stroke();
          ctx.shadowBlur = 0;

          ctx.font = "bold 12px sans-serif";
          ctx.fillStyle = "#fbbf24";
          ctx.fillText(`Ball ${Math.round(obj.confidence * 100)}%`, cx + r + 4, cy + 4);
        }
      }
    }

    // Draw active play banner at top
    if (activePlay) {
      const color = PLAY_COLORS[activePlay.label.toLowerCase()] || "#ff6300";

      ctx.fillStyle = color + "cc";
      const bannerW = 200;
      const bannerH = 36;
      const bannerX = (canvas.width - bannerW) / 2;
      const bannerY = 16;

      // Rounded rect
      ctx.beginPath();
      ctx.roundRect(bannerX, bannerY, bannerW, bannerH, 8);
      ctx.fill();

      ctx.fillStyle = "#fff";
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(activePlay.label.toUpperCase(), canvas.width / 2, bannerY + 24);
      ctx.textAlign = "start";
    }

    animFrameRef.current = requestAnimationFrame(drawOverlay);
  }, [detections, plays]);

  // Start/stop the overlay draw loop
  useEffect(() => {
    if (detections.length > 0 || plays.length > 0) {
      animFrameRef.current = requestAnimationFrame(drawOverlay);
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [detections, plays, drawOverlay]);

  // ─── Keyboard shortcuts ───────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const video = videoRef.current;
      if (!video) return;
      if (e.code === "Space") { e.preventDefault(); playing ? video.pause() : video.play(); setPlaying(!playing); }
      else if (e.code === "ArrowLeft") { e.preventDefault(); video.currentTime = Math.max(0, video.currentTime - 5); }
      else if (e.code === "ArrowRight") { e.preventDefault(); video.currentTime = Math.min(video.duration, video.currentTime + 5); }
      else if (e.code === "KeyF") { e.preventDefault(); toggleFullscreen(); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [playing]);

  useEffect(() => {
    function onChange() { setIsFullscreen(!!document.fullscreenElement); }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    playing ? video.pause() : video.play();
    setPlaying(!playing);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen();
    else document.exitFullscreen();
  }

  function handleTimeUpdate() {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
    onTimeUpdate?.(video.currentTime);
  }

  function handleLoadedMetadata() {
    const video = videoRef.current;
    if (!video) return;
    setDuration(video.duration);
    onDurationChange?.(video.duration);

    if (!onThumbnail) return;
    const seekTo = Math.min(1, video.duration * 0.1);
    video.currentTime = seekTo;
    video.addEventListener("seeked", function capture() {
      video.removeEventListener("seeked", capture);
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 180;
      canvas.getContext("2d")?.drawImage(video, 0, 0, 320, 180);
      onThumbnail(canvas.toDataURL("image/jpeg", 0.7));
      video.currentTime = 0;
    });
  }

  function scrubTo(e: React.MouseEvent<HTMLDivElement>) {
    if (!scrubberRef.current || duration === 0) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (videoRef.current) videoRef.current.currentTime = pct * duration;
  }

  const progressPct = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;
  const hasOverlay = detections.length > 0 || plays.length > 0;

  return (
    <div ref={containerRef} className="relative flex flex-col h-full bg-black">
      {/* Video */}
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full object-contain"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setPlaying(false)}
        onClick={togglePlay}
      />

      {/* Canvas overlay for bounding boxes + play labels */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ display: hasOverlay ? "block" : "none" }}
      />

      {/* Bottom control bar */}
      <div
        className="absolute bottom-0 left-0 right-0 flex flex-col gap-2 px-4 pt-6 pb-3"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)" }}
      >
        {/* Scrubber */}
        <div
          ref={scrubberRef}
          onClick={scrubTo}
          onMouseMove={(e) => e.buttons === 1 && scrubTo(e)}
          className="relative flex items-center h-5 cursor-pointer group"
        >
          <div className="absolute inset-x-0 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.25)" }} />
          <div
            className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full pointer-events-none"
            style={{ width: `${progressPct}%`, background: "#ff6300" }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
            style={{ left: `${progressPct}%`, background: "#ff6300", boxShadow: "0 0 4px rgba(255,99,0,0.8)" }}
          />
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-3">
          <button onClick={togglePlay} className="text-white hover:text-orange-400 transition-colors">
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

          <span className="text-xs tabular-nums text-white/70">
            {formatTime(currentTime)}{duration > 0 ? ` / ${formatTime(duration)}` : ""}
          </span>

          <div className="flex-1" />

          {analyzing && (
            <span className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(255,99,0,0.2)", color: "#ff6300" }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#ff6300" }} />
              Analyzing...
            </span>
          )}
          {hasOverlay && !analyzing && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(255,99,0,0.2)", color: "#ff6300" }}>
              AI Tracking
            </span>
          )}

          <button onClick={toggleFullscreen} className="text-white/60 hover:text-white transition-colors">
            {isFullscreen ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V5H5m14 4V5h-4M5 15h4v4m10-4h-4v4" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4h4M16 4h4v4M4 16v4h4m12-4v4h-4" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
});

export default VideoPlayer;
