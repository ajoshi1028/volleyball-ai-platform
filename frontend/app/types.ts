// -----------------------------------------------------------------
// Volleyball AI Platform — Type Definitions
// -----------------------------------------------------------------

export interface UploadResponse {
  gcs_uri: string;
  filename: string;
}

export interface BBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface DetectedObject {
  label: "player" | "ball";
  confidence: number;
  bbox: [number, number, number, number]; // [x1, y1, x2, y2]
}

export interface DetectionFrame {
  frame: number;
  timestamp: number;       // seconds
  objects: DetectedObject[];
  play?: string;           // play type active at this frame (serve, spike, etc.)
  playConfidence?: number; // how confident the classification is
  players: TrackedPlayer[];
}

export interface TrackedPlayer {
  id: string;
  x: number;          // normalized 0-1 (horizontal position in frame)
  y: number;          // normalized 0-1 (vertical position in frame)
  confidence: number;
  jersey?: number;
  position?: string;
  [key: string]: unknown;
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
  start_time_sec?: number;
  end_time_sec?: number;
}

export interface BallPosition {
  frame: number;
  timestamp: number;
  x: number;
  y: number;
  speed_px_per_sec?: number;
}

export interface DetectionResult {
  totalFrames: number;
  fps: number;
  resolution: string;
  framesWithDetections: number;
  maxPeopleInFrame: number;
  avgPeoplePerFrame: number;
  totalDetections: number;
  framesWithBall: number;
  ballDetectionRate: number;
  processedFrames: number;
  annotatedVideoUri?: string;
  playSummary: Record<string, number>;
  ballSpeed?: {
    avg_px_per_sec: number;
    max_px_per_sec: number;
  };
}

export interface PlayResult {
  [key: string]: unknown;
}
