// -----------------------------------------------------------------
// Update these types when Yoshi and Josh finalize their data schemas
// -----------------------------------------------------------------

export interface UploadResponse {
  gcs_uri: string;
  filename: string;
}

// Yoshi — update when /detect response shape is finalized
export interface DetectionFrame {
  frame: number;
  timestamp: number;
  players: TrackedPlayer[];
}

// Yoshi — update fields when detection schema is finalized
export interface TrackedPlayer {
  id: string;
  [key: string]: unknown;
}

export interface FilmRecord {
  id: string;
  filename: string;
  gcs_uri: string;
  uploadedAt: string; // ISO string
  duration?: number;  // seconds, saved after first playback
  thumbnail?: string; // base64 data URL, captured from first frame
}

// Josh — matches /results/{video_id} response shape
export interface Play {
  id: string;
  label: string;                    // mapped from "play" field
  timestamp: number;                // mapped from start_time_sec for seeking
  start_time_sec?: number;
  end_time_sec?: number;
}

// Detection and Play Recognition result types
export interface DetectionResult {
  [key: string]: unknown;
}

export interface PlayResult {
  [key: string]: unknown;
}
