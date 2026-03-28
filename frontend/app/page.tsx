"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import Nav from "./components/Nav";
import FilmLibrary from "./components/FilmLibrary";
import VideoPlayer, { VideoPlayerHandle } from "./components/VideoPlayer";
import StatsPanel from "./components/StatsPanel";
import PlayTimeline from "./components/PlayTimeline";
import {
  DetectionFrame,
  FilmRecord,
  Play,
  TrackedPlayer,
  VideoStats,
  UploadResponse,
} from "./types";

const STORAGE_KEY = "volleyball-films";
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Screen = "library" | "review";

function loadFilms(): FilmRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveFilms(films: FilmRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(films));
}

export default function Home() {
  const playerRef = useRef<VideoPlayerHandle>(null);
  const [screen, setScreen] = useState<Screen>("library");
  const [films, setFilms] = useState<FilmRecord[]>([]);
  const localUrlsRef = useRef(new Map<string, string>());

  // Review state
  const [activeFilm, setActiveFilm] = useState<FilmRecord | null>(null);
  const [localVideoUrl, setLocalVideoUrl] = useState("");
  const [detectionFrames, setDetectionFrames] = useState<DetectionFrame[]>([]);
  const [plays, setPlays] = useState<Play[]>([]);
  const [videoStats, setVideoStats] = useState<VideoStats | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setFilms(loadFilms());
  }, []);

  // Current players from detection frames based on video time
  const currentPlayers: TrackedPlayer[] = (() => {
    if (!detectionFrames.length) return [];
    const closest = detectionFrames.reduce((best, f) =>
      Math.abs(f.timestamp - currentTime) < Math.abs(best.timestamp - currentTime) ? f : best
    );
    return closest.players;
  })();

  // Save duration back to film record
  useEffect(() => {
    if (!activeFilm || !videoDuration) return;
    setFilms((prev) => {
      const updated = prev.map((f) =>
        f.id === activeFilm.id ? { ...f, duration: videoDuration } : f
      );
      saveFilms(updated);
      return updated;
    });
  }, [videoDuration, activeFilm]);

  const handleThumbnail = useCallback(
    (dataUrl: string) => {
      if (!activeFilm) return;
      setFilms((prev) => {
        const updated = prev.map((f) =>
          f.id === activeFilm.id ? { ...f, thumbnail: dataUrl } : f
        );
        saveFilms(updated);
        return updated;
      });
    },
    [activeFilm]
  );

  // ─── Check backend is reachable ─────────────────────────────
  async function checkBackend(): Promise<boolean> {
    try {
      const res = await fetch(`${API}/health`, { signal: AbortSignal.timeout(5000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  // ─── Upload to GCS ──────────────────────────────────────────
  async function uploadToGCS(file: File): Promise<UploadResponse> {
    // Pre-flight: make sure backend is reachable
    const backendOk = await checkBackend();
    if (!backendOk) {
      throw new Error(
        "Cannot connect to backend server. Make sure the backend is running:\n" +
        "cd backend && source venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8000"
      );
    }

    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API}/upload-video`, { method: "POST", body: form });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Upload failed (${res.status}): ${errText}`);
    }
    return (await res.json()) as UploadResponse;
  }

  // ─── Run AI Detection ───────────────────────────────────────
  async function runDetection(gcsUri: string) {
    setAnalyzing(true);
    setStatusMessage("Running AI analysis — detecting players, ball, and plays...");
    setErrorMessage(null);

    try {
      const res = await fetch(`${API}/detect?gcs_uri=${encodeURIComponent(gcsUri)}`, {
        method: "POST",
        signal: AbortSignal.timeout(300000),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Detection failed (${res.status}): ${errText}`);
      }
      const data = await res.json();

      // Parse plays
      if (data?.play_recognition?.plays) {
        const mapped: Play[] = data.play_recognition.plays.map(
          (
            p: {
              play: string;
              start_time_sec: number;
              end_time_sec: number;
              confidence?: number;
            },
            i: number
          ) => ({
            id: String(i),
            label: p.play,
            timestamp: p.start_time_sec,
            confidence: p.confidence,
            start_time_sec: p.start_time_sec,
            end_time_sec: p.end_time_sec,
          })
        );
        setPlays(mapped);
      }

      // Parse detection frames for overlay
      if (data?.detection_frames) {
        const vw: number = data.video_width ?? 1920;
        const vh: number = data.video_height ?? 1080;

        const frames: DetectionFrame[] = data.detection_frames.map(
          (f: { frame: number; timestamp: number; objects: any[]; play?: string }) => ({
            frame: f.frame,
            timestamp: f.timestamp,
            objects: f.objects.map((o: any) => ({
              label: o.label as "player" | "ball",
              confidence: o.confidence,
              bbox: o.bbox as [number, number, number, number],
              is_key_player: o.is_key_player || false,
              play: o.play,
            })),
            players: f.objects
              .filter((o: any) => o.label === "player")
              .map((o: any) => ({
                x: (o.bbox[0] + o.bbox[2]) / 2 / vw,
                y: (o.bbox[1] + o.bbox[3]) / 2 / vh,
                confidence: o.confidence,
              }))
              .filter(
                (o: { x: number; y: number }) =>
                  o.x > 0.05 && o.x < 0.95 && o.y > 0.2 && o.y < 0.95
              )
              .sort(
                (a: { confidence: number }, b: { confidence: number }) =>
                  b.confidence - a.confidence
              )
              .slice(0, 14)
              .sort((a: { y: number }, b: { y: number }) => a.y - b.y)
              .map((o: { x: number; y: number; confidence: number }, i: number) => ({
                id: `p${i}`,
                x: o.x,
                y: o.y,
                confidence: o.confidence,
              })),
          })
        );
        setDetectionFrames(frames);
      }

      // Parse stats
      setVideoStats({
        totalFrames: data.total_frames || 0,
        fps: data.fps || 30,
        resolution: data.resolution || "unknown",
        processedFrames: data.processed_frames || 0,
        playersDetected: data.total_detections || 0,
        maxPlayersInFrame: data.max_people_in_frame || 0,
        avgPlayersPerFrame: data.avg_people_per_detection_frame || 0,
        ballDetectionRate: data.ball_detection_rate || 0,
        ballSpeed: data.ball_speed || null,
        playSummary: data.play_summary || {},
      });

      setStatusMessage("Analysis complete!");
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error("Detection error:", err);
      setErrorMessage(err instanceof Error ? err.message : "Detection failed");
      setStatusMessage(null);
    } finally {
      setAnalyzing(false);
    }
  }

  // ─── Handle New Upload (from card grid) ─────────────────────
  async function handleNewUpload(file: File) {
    const localUrl = URL.createObjectURL(file);
    const film: FilmRecord = {
      id: crypto.randomUUID(),
      filename: file.name,
      gcs_uri: "",
      uploadedAt: new Date().toISOString(),
    };

    localUrlsRef.current.set(film.id, localUrl);
    setFilms((prev) => {
      const updated = [film, ...prev];
      saveFilms(updated);
      return updated;
    });

    // Switch to review screen immediately
    setActiveFilm(film);
    setLocalVideoUrl(localUrl);
    setDetectionFrames([]);
    setPlays([]);
    setVideoStats(null);
    setCurrentTime(0);
    setVideoDuration(0);
    setErrorMessage(null);
    setAnalyzing(true);
    setStatusMessage("Uploading video to Google Cloud Storage...");
    setScreen("review");

    try {
      const uploadResult = await uploadToGCS(file);

      const updatedFilm = { ...film, gcs_uri: uploadResult.gcs_uri };
      setActiveFilm(updatedFilm);
      setFilms((prev) => {
        const updated = prev.map((f) => (f.id === film.id ? updatedFilm : f));
        saveFilms(updated);
        return updated;
      });

      setStatusMessage("Upload complete! Starting AI analysis...");
      await runDetection(uploadResult.gcs_uri);
    } catch (err) {
      console.error("Upload/detection pipeline error:", err);
      setAnalyzing(false);
      setStatusMessage(null);
      setErrorMessage(
        err instanceof Error
          ? `Error: ${err.message}`
          : "Something went wrong. Check that the backend is running on port 8000."
      );
    }
  }

  // ─── Open Review for existing film ──────────────────────────
  async function openReview(film: FilmRecord, localUrl: string) {
    setActiveFilm(film);
    setLocalVideoUrl(localUrl);
    setDetectionFrames([]);
    setPlays([]);
    setVideoStats(null);
    setCurrentTime(0);
    setVideoDuration(0);
    setErrorMessage(null);
    setStatusMessage(null);
    setScreen("review");

    if (film.gcs_uri) {
      runDetection(film.gcs_uri);
    } else {
      // Need to upload first
      setAnalyzing(true);
      setStatusMessage("Uploading video to Google Cloud Storage...");
      try {
        // Re-fetch the file from blob URL
        const resp = await fetch(localUrl);
        const blob = await resp.blob();
        const file = new File([blob], film.filename, { type: blob.type });
        const uploadResult = await uploadToGCS(file);

        const updatedFilm = { ...film, gcs_uri: uploadResult.gcs_uri };
        setActiveFilm(updatedFilm);
        setFilms((prev) => {
          const updated = prev.map((f) => (f.id === film.id ? updatedFilm : f));
          saveFilms(updated);
          return updated;
        });

        setStatusMessage("Upload complete! Starting AI analysis...");
        await runDetection(uploadResult.gcs_uri);
      } catch (err) {
        console.error("Upload error:", err);
        setAnalyzing(false);
        setStatusMessage(null);
        setErrorMessage(err instanceof Error ? err.message : "Upload failed");
      }
    }
  }

  function goToLibrary() {
    setScreen("library");
    setActiveFilm(null);
    setStatusMessage(null);
    setErrorMessage(null);
  }

  // ─── Library View ───────────────────────────────────────────
  if (screen === "library") {
    return (
      <div className="flex flex-col h-screen overflow-hidden">
        <Nav onBackToLibrary={goToLibrary} />
        <FilmLibrary
          films={films}
          localUrls={localUrlsRef.current}
          onOpen={(film, url) => openReview(film, url)}
          onReupload={(film, file) => {
            const url = URL.createObjectURL(file);
            localUrlsRef.current.set(film.id, url);
            openReview(film, url);
          }}
          onNewUpload={handleNewUpload}
        />
      </div>
    );
  }

  // ─── Review View ────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Nav
        currentFilm={activeFilm?.filename}
        onBackToLibrary={goToLibrary}
        analyzing={analyzing}
      />

      {/* Status / Error banner */}
      {(statusMessage || errorMessage) && (
        <div
          className="px-4 py-2.5 text-center text-xs font-medium shrink-0 flex items-center justify-center gap-2"
          style={{
            background: errorMessage ? "rgba(239,68,68,0.15)" : "var(--ppu-orange-dim)",
            color: errorMessage ? "#ef4444" : "var(--ppu-orange)",
          }}
        >
          {analyzing && !errorMessage && (
            <span
              className="w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin shrink-0"
              style={{
                borderColor: "var(--ppu-orange)",
                borderTopColor: "transparent",
              }}
            />
          )}
          {errorMessage ? <span>{errorMessage}</span> : <span>{statusMessage}</span>}
          {errorMessage && (
            <button
              onClick={() => setErrorMessage(null)}
              className="ml-2 underline opacity-70 hover:opacity-100"
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Main content: video + timeline */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-hidden p-2">
            <VideoPlayer
              ref={playerRef}
              src={localVideoUrl}
              detections={detectionFrames}
              plays={plays}
              analyzing={analyzing}
              onTimeUpdate={setCurrentTime}
              onDurationChange={setVideoDuration}
              onThumbnail={handleThumbnail}
            />
          </div>
          <PlayTimeline
            plays={plays}
            duration={videoDuration}
            analyzing={analyzing}
            onSeek={(t) => playerRef.current?.seek(t)}
          />
        </div>

        {/* Stats sidebar */}
        <div className="w-72 shrink-0">
          <StatsPanel
            stats={videoStats}
            plays={plays}
            players={currentPlayers}
            currentTime={currentTime}
            analyzing={analyzing}
          />
        </div>
      </div>
    </div>
  );
}
