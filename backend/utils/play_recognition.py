"""
Play recognition logic for volleyball AI platform.

Takes YOLO detection output (bounding boxes per frame) and classifies
what type of volleyball play is occurring.

Detection schema (agreed with Yoshi):
{
  "video_id": str,
  "gcs_uri": str,
  "fps": float,
  "frame_count": int,
  "detections": [
    {
      "frame": int,
      "timestamp_sec": float,
      "objects": [
        {
          "label": "player" | "ball",
          "confidence": float,        # 0.0 - 1.0
          "bbox": [x1, y1, x2, y2],  # pixel coords, top-left to bottom-right
          "track_id": int | None      # optional tracking ID across frames
        }
      ]
    }
  ]
}
"""

from typing import Optional


# ---------------------------------------------------------------------------
# Types (plain dicts — no extra dependencies needed)
# ---------------------------------------------------------------------------

BBox = list[float]  # [x1, y1, x2, y2]


def _center(bbox: BBox) -> tuple[float, float]:
    """Return (cx, cy) center of a bounding box."""
    x1, y1, x2, y2 = bbox
    return ((x1 + x2) / 2, (y1 + y2) / 2)


def _height(bbox: BBox) -> float:
    return abs(bbox[3] - bbox[1])


def _width(bbox: BBox) -> float:
    return abs(bbox[2] - bbox[0])


def _area(bbox: BBox) -> float:
    return _width(bbox) * _height(bbox)


# ---------------------------------------------------------------------------
# Play classification helpers
# ---------------------------------------------------------------------------

def _get_ball_positions(detections: list[dict]) -> list[Optional[tuple[float, float]]]:
    """
    Return a list of (cx, cy) ball positions per frame, or None if no ball found.
    """
    positions = []
    for frame_data in detections:
        ball = next(
            (obj for obj in frame_data.get("objects", []) if obj["label"] == "ball"),
            None,
        )
        if ball:
            positions.append(_center(ball["bbox"]))
        else:
            positions.append(None)
    return positions


def _ball_vertical_velocity(positions: list[Optional[tuple[float, float]]], window: int = 5) -> list[Optional[float]]:
    """
    Estimate vertical velocity of the ball at each frame (pixels/frame).
    Positive = moving down (y increases downward in image coords).
    Returns None where ball isn't detected.
    """
    velocities: list[Optional[float]] = [None] * len(positions)
    for i in range(window, len(positions) - window):
        before = positions[i - window]
        after = positions[i + window]
        if before is not None and after is not None:
            dy = after[1] - before[1]
            velocities[i] = dy / (2 * window)
    return velocities


def _find_players(frame_data: dict) -> list[dict]:
    return [obj for obj in frame_data.get("objects", []) if obj["label"] == "player"]


# ---------------------------------------------------------------------------
# Play segment detection
# ---------------------------------------------------------------------------

def _classify_play_at_frame(
    frame_idx: int,
    detections: list[dict],
    ball_positions: list[Optional[tuple[float, float]]],
    ball_velocities: list[Optional[float]],
    frame_height: int = 720,
) -> Optional[str]:
    """
    Heuristic classification of a single frame's play type.

    Rules (tunable):
      - SERVE:   Ball detected high in frame (top 30%), no nearby players underneath it
      - SET:     Ball detected mid-frame (30–60% height), player hands near ball (small bbox above waist)
      - DIG:     Ball detected low in frame (bottom 40%), player(s) crouched (tall/wide aspect ratio)
      - SPIKE:   Ball moving sharply downward (high positive velocity) AND a player is elevated
                 (player bbox center in upper 50% of frame)
    """
    if frame_idx >= len(detections):
        return None

    ball_pos = ball_positions[frame_idx]
    if ball_pos is None:
        return None  # Can't classify without ball

    ball_cx, ball_cy = ball_pos
    ball_y_norm = ball_cy / frame_height  # 0 = top, 1 = bottom

    players = _find_players(detections[frame_idx])
    velocity = ball_velocities[frame_idx]

    # --- SPIKE: ball moving fast downward + a player is elevated ---
    if velocity is not None and velocity > 8:
        elevated_players = [
            p for p in players
            if _center(p["bbox"])[1] / frame_height < 0.5
        ]
        if elevated_players:
            return "spike"

    # --- SERVE: ball very high up, moving upward or slow ---
    if ball_y_norm < 0.30:
        if velocity is None or abs(velocity) < 4:
            return "serve"

    # --- DIG: ball low, at least one player in wide/low stance ---
    if ball_y_norm > 0.60:
        crouched = [
            p for p in players
            if _width(p["bbox"]) > _height(p["bbox"]) * 0.6  # wide stance
        ]
        if crouched:
            return "dig"

    # --- SET: ball mid-height, player close to ball ---
    if 0.30 <= ball_y_norm <= 0.60:
        nearby = [
            p for p in players
            if abs(_center(p["bbox"])[0] - ball_cx) < 80
            and abs(_center(p["bbox"])[1] - ball_cy) < 100
        ]
        if nearby:
            return "set"

    return None


def _merge_consecutive(play_frames: list[tuple[int, str]], min_run: int = 3) -> list[dict]:
    """
    Convert per-frame labels into play segments, filtering out noise (runs < min_run frames).
    Returns list of {play, start_frame, end_frame}.
    """
    if not play_frames:
        return []

    segments = []
    run_start_frame, run_label = play_frames[0]
    run_count = 1

    for i in range(1, len(play_frames)):
        frame, label = play_frames[i]
        if label == run_label:
            run_count += 1
        else:
            if run_count >= min_run:
                segments.append({
                    "play": run_label,
                    "start_frame": run_start_frame,
                    "end_frame": play_frames[i - 1][0],
                })
            run_start_frame, run_label = frame, label
            run_count = 1

    if run_count >= min_run:
        segments.append({
            "play": run_label,
            "start_frame": run_start_frame,
            "end_frame": play_frames[-1][0],
        })

    return segments


# ---------------------------------------------------------------------------
# Second pass corrections
# ---------------------------------------------------------------------------

def _fix_spike_dig_confusion(segments: list[dict], min_gap_frames: int = 15) -> list[dict]:
    """
    Remove a 'dig' segment that appears too soon after a 'spike'.

    When a spike lands, the ball bounces low in the frame and can get
    misclassified as a dig. If the gap between the spike's end frame and
    the next dig's start frame is less than min_gap_frames, discard the dig.
    """
    cleaned = []
    for i, seg in enumerate(segments):
        if seg["play"] == "dig" and i > 0:
            prev = segments[i - 1]
            if prev["play"] == "spike":
                gap = seg["start_frame"] - prev["end_frame"]
                if gap < min_gap_frames:
                    continue  # discard this dig
        cleaned.append(seg)
    return cleaned


def _apply_rally_sequencing(segments: list[dict]) -> list[dict]:
    """
    Use rally context to fix misclassified sets.

    A 'serve' that follows a 'dig' or another 'serve' is almost certainly
    a high set that got misclassified due to the ball being high in the frame.
    Relabel it as a 'set'.
    """
    for i, seg in enumerate(segments):
        if seg["play"] == "serve" and i > 0:
            prev = segments[i - 1]
            if prev["play"] in ("dig", "serve"):
                seg["play"] = "set"
    return segments


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def recognize_plays(detection_result: dict) -> dict:
    """
    Run play recognition on a detection result.

    Args:
        detection_result: Dict matching the detection schema above.

    Returns:
        {
          "video_id": str,
          "fps": float,
          "plays": [
            {
              "play": "serve" | "dig" | "set" | "spike",
              "start_frame": int,
              "end_frame": int,
              "start_time_sec": float,
              "end_time_sec": float
            }
          ],
          "summary": {"serve": int, "dig": int, "set": int, "spike": int}
        }
    """
    detections = detection_result.get("detections", [])
    fps = detection_result.get("fps", 30.0)
    video_id = detection_result.get("video_id", "unknown")

    ball_positions = _get_ball_positions(detections)
    ball_velocities = _ball_vertical_velocity(ball_positions)

    # Classify each frame
    play_frames: list[tuple[int, str]] = []
    for i, frame_data in enumerate(detections):
        label = _classify_play_at_frame(i, detections, ball_positions, ball_velocities)
        if label:
            play_frames.append((frame_data.get("frame", i), label))

    segments = _merge_consecutive(play_frames)
    segments = _fix_spike_dig_confusion(segments)
    segments = _apply_rally_sequencing(segments)

    # Attach timestamps
    for seg in segments:
        seg["start_time_sec"] = round(seg["start_frame"] / fps, 2)
        seg["end_time_sec"] = round(seg["end_frame"] / fps, 2)

    # Summary counts
    summary = {"serve": 0, "dig": 0, "set": 0, "spike": 0}
    for seg in segments:
        play = seg["play"]
        if play in summary:
            summary[play] += 1

    return {
        "video_id": video_id,
        "fps": fps,
        "plays": segments,
        "summary": summary,
    }
