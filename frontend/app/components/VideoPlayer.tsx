"use client";

// -----------------------------------------------------------------
// Yoshi: when /detect returns bounding boxes, pass them in via the
// `detections` prop (update the DetectionFrame type in ../types.ts)
// and draw them on the <canvas> overlay synced to currentTime.
// -----------------------------------------------------------------

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { DetectionFrame } from "../types";

export interface VideoPlayerHandle {
  seek: (time: number) => void;
}

interface Props {
  src: string;
  detections: DetectionFrame[];
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

const VideoPlayer = forwardRef<VideoPlayerHandle, Props>(function VideoPlayer(
  { src, detections, analyzing, onTimeUpdate, onDurationChange, onThumbnail },
  ref
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrubberRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useImperativeHandle(ref, () => ({
    seek(time: number) {
      if (videoRef.current) videoRef.current.currentTime = time;
    },
  }));

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
    // Seek to 10% into the video (or 1s, whichever is smaller) to grab a representative frame
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
  const hasDetections = detections.length > 0;

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

      {/* Canvas overlay — Yoshi draws bounding boxes here */}
      {hasDetections && (
        <canvas className="absolute inset-0 w-full h-full pointer-events-none" />
      )}

      {/* Bottom control bar — overlaid on video */}
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
          {/* Visible track */}
          <div className="absolute inset-x-0 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.25)" }} />
          {/* Progress */}
          <div
            className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full pointer-events-none"
            style={{ width: `${progressPct}%`, background: "#ff6300" }}
          />
          {/* Thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
            style={{ left: `${progressPct}%`, background: "#ff6300", boxShadow: "0 0 4px rgba(255,99,0,0.8)" }}
          />
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-3">
          {/* Play/pause */}
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

          {/* Time */}
          <span className="text-xs tabular-nums text-white/70">
            {formatTime(currentTime)}{duration > 0 ? ` / ${formatTime(duration)}` : ""}
          </span>

          <div className="flex-1" />

          {/* Analyzing badge */}
          {analyzing && (
            <span className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(255,99,0,0.2)", color: "#ff6300" }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#ff6300" }} />
              Analyzing...
            </span>
          )}
          {hasDetections && !analyzing && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(255,99,0,0.2)", color: "#ff6300" }}>
              AI Tracking
            </span>
          )}

          {/* Fullscreen */}
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
