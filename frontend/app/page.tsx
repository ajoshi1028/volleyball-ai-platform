"use client";

import { useRef, useState, useEffect } from "react";
import Nav from "./components/Nav";
import FilmLibrary from "./components/FilmLibrary";
import VideoUploader from "./components/VideoUploader";
import VideoPlayer, { VideoPlayerHandle } from "./components/VideoPlayer";
import PlayerTrackingPanel from "./components/PlayerTrackingPanel";
import PlayTimeline from "./components/PlayTimeline";
import { DetectionFrame, FilmRecord, Play, TrackedPlayer, UploadResponse } from "./types";

const STORAGE_KEY = "volleyball-films";
const API_BASE = "http://localhost:8000";

const MOCK_PLAYS: Play[] = [
  { id: "1", label: "Serve",  timestamp: 4,  start_time_sec: 4,  end_time_sec: 6  },
  { id: "2", label: "Dig",   timestamp: 11, start_time_sec: 11, end_time_sec: 13 },
  { id: "3", label: "Set",   timestamp: 18, start_time_sec: 18, end_time_sec: 20 },
  { id: "4", label: "Spike", timestamp: 24, start_time_sec: 24, end_time_sec: 26 },
  { id: "5", label: "Block", timestamp: 31, start_time_sec: 31, end_time_sec: 33 },
];

const MOCK_PLAYERS: TrackedPlayer[] = [
  { id: "p1", jersey: 3,  position: "OH", x: 0.24, y: 0.61 },
  { id: "p2", jersey: 7,  position: "S",  x: 0.51, y: 0.55 },
  { id: "p3", jersey: 11, position: "MB", x: 0.38, y: 0.48 },
  { id: "p4", jersey: 14, position: "L",  x: 0.67, y: 0.72 },
  { id: "p5", jersey: 2,  position: "OH", x: 0.19, y: 0.43 },
  { id: "p6", jersey: 9,  position: "RS", x: 0.79, y: 0.51 },
];

type Screen = "library" | "upload" | "review";

function loadFilms(): FilmRecord[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch { return []; }
}

function saveFilms(films: FilmRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(films));
}

export default function Home() {
  const playerRef = useRef<VideoPlayerHandle>(null);

  const [screen, setScreen] = useState<Screen>("library");
  const [films, setFilms] = useState<FilmRecord[]>([]);
  const [localUrls] = useState(() => new Map<string, string>());

  const [activeFilm, setActiveFilm] = useState<FilmRecord | null>(null);
  const [localVideoUrl, setLocalVideoUrl] = useState("");
  const [detectionFrames, setDetectionFrames] = useState<DetectionFrame[]>([]);
  const [plays, setPlays] = useState<Play[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [mockMode, setMockMode] = useState(false);

  useEffect(() => { setFilms(loadFilms()); }, []);

  const currentPlayers: TrackedPlayer[] = mockMode
    ? MOCK_PLAYERS
    : (() => {
        if (!detectionFrames.length) return [];
        const closest = detectionFrames.reduce((best, f) =>
          Math.abs(f.timestamp - currentTime) < Math.abs(best.timestamp - currentTime) ? f : best
        );
        return closest.players;
      })();

  const activePlays = mockMode ? MOCK_PLAYS : plays;

  // Save duration + thumbnail back to the film record once we have them
  useEffect(() => {
    if (!activeFilm || !videoDuration) return;
    setFilms((prev) => {
      const updated = prev.map((f) => f.id === activeFilm.id ? { ...f, duration: videoDuration } : f);
      saveFilms(updated);
      return updated;
    });
  }, [videoDuration]);

  function handleThumbnail(dataUrl: string) {
    if (!activeFilm) return;
    setFilms((prev) => {
      const updated = prev.map((f) => f.id === activeFilm.id ? { ...f, thumbnail: dataUrl } : f);
      saveFilms(updated);
      return updated;
    });
  }

  async function openReview(film: FilmRecord, localUrl: string) {
    setActiveFilm(film);
    setLocalVideoUrl(localUrl);
    setDetectionFrames([]);
    setPlays([]);
    setCurrentTime(0);
    setVideoDuration(0);
    setMockMode(false);
    setAnalyzing(true);
    setScreen("review");

    // Skip API calls if no GCS URI (dev/local preview mode)
    if (!film.gcs_uri) { setAnalyzing(false); return; }

    try {
      // Step 1 (Yoshi): run YOLO detection + play recognition in one call
      const detectRes = await fetch(`${API_BASE}/detect?gcs_uri=${encodeURIComponent(film.gcs_uri)}`, { method: "POST" });
      const detectData = detectRes.ok ? await detectRes.json() : null;

      // Step 2: read plays + per-frame player positions from detect response
      if (detectData?.play_recognition?.plays) {
        const mapped: Play[] = (detectData.play_recognition.plays as { play: string; start_time_sec: number; end_time_sec: number }[]).map((p, i) => ({
          id: String(i),
          label: p.play,
          timestamp: p.start_time_sec,
          start_time_sec: p.start_time_sec,
          end_time_sec: p.end_time_sec,
        }));
        setPlays(mapped);
      }

      if (detectData?.frames_detections) {
        const vw: number = detectData.video_width ?? 1920;
        const vh: number = detectData.video_height ?? 1080;
        const frames: DetectionFrame[] = (detectData.frames_detections as { frame: number; timestamp_sec: number; objects: { label: string; confidence: number; bbox: number[] }[] }[]).map((f) => ({
          frame: f.frame,
          timestamp: f.timestamp_sec,
          players: f.objects
            .filter((o) => o.label === "player")
            .map((o) => ({
              nx: ((o.bbox[0] + o.bbox[2]) / 2) / vw,
              ny: ((o.bbox[1] + o.bbox[3]) / 2) / vh,
              confidence: o.confidence,
            }))
            .filter((o) => o.nx > 0.07 && o.nx < 0.93 && o.ny > 0.07 && o.ny < 0.93)
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 14)
            .map((o, i) => ({
              id: `p${i}`,
              x: o.nx,
              y: o.ny,
              confidence: o.confidence,
            })),
        }));
        setDetectionFrames(frames);
      }

      // Step 3: store results for /search endpoint
      if (detectData) {
        await fetch(`${API_BASE}/store-results`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            video_id: film.filename,
            gcs_uri: film.gcs_uri,
            fps: detectData.fps ?? 30,
            frame_count: detectData.total_frames ?? 0,
            detections: [],
          }),
        });
      }
    } catch (err) {
      console.error("Detection/results error:", err);
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleUploadComplete(result: UploadResponse, localUrl: string) {
    const film: FilmRecord = {
      id: crypto.randomUUID(),
      filename: result.filename,
      gcs_uri: result.gcs_uri,
      uploadedAt: new Date().toISOString(),
    };
    localUrls.set(film.id, localUrl);
    setFilms((prev) => {
      const updated = [film, ...prev];
      saveFilms(updated);
      return updated;
    });
    openReview(film, localUrl);
  }

function handleSeek(time: number) {
    playerRef.current?.seek(time);
  }

  function goToLibrary() {
    setScreen("library");
    setActiveFilm(null);
  }

  const mockToggle = (
    <button
      onClick={() => setMockMode((p) => !p)}
      className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all"
      style={
        mockMode
          ? { background: "var(--ppu-orange-dim)", color: "var(--ppu-orange)", borderColor: "rgba(255,99,0,0.4)" }
          : { background: "transparent", color: "#64748b", borderColor: "var(--ppu-border)" }
      }
    >
      <span className={`w-1.5 h-1.5 rounded-full ${mockMode ? "bg-orange-500" : "bg-slate-600"}`} />
      Mock data {mockMode ? "on" : "off"}
    </button>
  );

  if (screen === "library") {
    return (
      <div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--ppu-navy)" }}>
        <Nav onBackToLibrary={goToLibrary} />
        <FilmLibrary
          films={films}
          localUrls={localUrls}
          onOpen={(film, url) => openReview(film, url)}
          onReupload={(film, url) => { localUrls.set(film.id, url); openReview(film, url); }}
          onUploadClick={() => setScreen("upload")}
        />
      </div>
    );
  }

  if (screen === "upload") {
    return (
      <div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--ppu-navy)" }}>
        <Nav onBackToLibrary={goToLibrary} />
        <VideoUploader onUploadComplete={handleUploadComplete} />
      </div>
    );
  }

  // Review screen
  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--ppu-navy)" }}>
      <Nav
        currentFilm={activeFilm?.filename}
        onBackToLibrary={goToLibrary}
        rightSlot={mockToggle}
      />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <VideoPlayer
              ref={playerRef}
              src={localVideoUrl}
              detections={detectionFrames}
              analyzing={analyzing}
              onTimeUpdate={setCurrentTime}
              onDurationChange={setVideoDuration}
              onThumbnail={handleThumbnail}
            />
          </div>
          <PlayTimeline
            plays={activePlays}
            duration={videoDuration}
            analyzing={analyzing}
            onSeek={handleSeek}
          />
        </div>
        <div className="w-64 shrink-0">
          <PlayerTrackingPanel
            players={currentPlayers}
            currentTime={currentTime}
            analyzing={analyzing}
          />
        </div>
      </div>
    </div>
  );
}
