// Volleyball AI Platform — Type Definitions

export interface UploadResponse {
  gcs_uri: string;
  filename: string;
}

export interface DetectedObject {
  label: "player" | "ball";
  confidence: number;
  bbox: [number, number, number, number];
  is_key_player?: boolean;
  play?: string;
}

export interface DetectionFrame {
  frame: number;
  timestamp: number;
  objects: DetectedObject[];
  play?: string;
  players: TrackedPlayer[];
}

export interface TrackedPlayer {
  id: string;
  x: number;
  y: number;
  confidence: number;
}

export interface FilmRecord {
  id: string;
  filename: string;
  gcs_uri: string;
  uploadedAt: string;
  duration?: number;
  thumbnail?: string;
}

export interface Play {
  id: string;
  label: string;
  timestamp: number;
  confidence?: number;
  start_time_sec?: number;
  end_time_sec?: number;
}

export interface BallSpeed {
  avg_px_per_sec: number;
  max_px_per_sec: number;
}

export interface VideoStats {
  totalFrames: number;
  fps: number;
  resolution: string;
  processedFrames: number;
  playersDetected: number;
  maxPlayersInFrame: number;
  avgPlayersPerFrame: number;
  ballDetectionRate: number;
  ballSpeed: BallSpeed | null;
  playSummary: Record<string, number>;
}
