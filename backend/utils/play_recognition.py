"""
Play recognition for volleyball AI platform.

Designed for END-ZONE camera angle (camera behind baseline):
  - y=0 (top of frame)    → far end of court / net area
  - y=1 (bottom of frame) → near baseline / camera side
  - x                     → lateral court position (left/right)

Near team = large bboxes, high y values (bottom half of frame)
Far team  = small bboxes, low y values (top half of frame)
"""

import statistics
from collections import Counter


BBox = list[float]


def _center(bbox: BBox) -> tuple[float, float]:
    x1, y1, x2, y2 = bbox
    return ((x1 + x2) / 2, (y1 + y2) / 2)


def _height(bbox: BBox) -> float:
    return abs(bbox[3] - bbox[1])


def _find_players(frame_data: dict) -> list[dict]:
    return [obj for obj in frame_data.get("objects", []) if obj["label"] == "player"]


def recognize_plays(detection_result: dict) -> dict:
    """
    Classify volleyball plays using end-zone camera perspective.

    Key signals:
      - Near team (y > 0.55): serving/defensive side closest to camera
      - Far team  (y < 0.45): attacking/net side furthest from camera
      - Net zone  (y < 0.35): players very close to the net
      - X-spread of near team: wide = defensive/passing formation
      - Height ratio spike: someone jumping
    """
    detections = detection_result.get("detections", [])
    fps = detection_result.get("fps", 30.0)
    video_id = detection_result.get("video_id", "unknown")

    if not detections:
        return {"video_id": video_id, "fps": fps, "plays": [], "summary": {}}

    # ─── Step 1: Compute per-frame metrics ───────────────────────
    frame_metrics = []
    for frame_data in detections:
        players = _find_players(frame_data)
        if len(players) < 4:
            frame_metrics.append(None)
            continue

        centers = [_center(p["bbox"]) for p in players]
        heights = [_height(p["bbox"]) for p in players]
        ys = [c[1] for c in centers]
        xs = [c[0] for c in centers]

        med_h = statistics.median(heights)
        max_h = max(heights)

        # Split by court depth (y position in frame)
        near_idxs = [i for i, y in enumerate(ys) if y > 0.55]   # near team
        far_idxs  = [i for i, y in enumerate(ys) if y < 0.45]   # far team
        net_count = len([y for y in ys if y < 0.35])             # at net

        near_xs = [xs[i] for i in near_idxs]
        far_xs  = [xs[i] for i in far_idxs]
        near_ys = [ys[i] for i in near_idxs]

        near_x_spread = max(near_xs) - min(near_xs) if len(near_xs) >= 2 else 0
        far_x_spread  = max(far_xs)  - min(far_xs)  if len(far_xs)  >= 2 else 0
        max_y = max(ys)  # how far back the deepest near player is

        frame_metrics.append({
            "frame":         frame_data.get("frame", 0),
            "timestamp":     frame_data.get("timestamp_sec", 0),
            "num_players":   len(players),
            "near_count":    len(near_idxs),
            "far_count":     len(far_idxs),
            "net_count":     net_count,
            "near_x_spread": near_x_spread,
            "far_x_spread":  far_x_spread,
            "height_ratio":  max_h / med_h if med_h > 0 else 1,
            "max_y":         max_y,
        })

    valid = [m for m in frame_metrics if m is not None]
    if len(valid) < 5:
        return {"video_id": video_id, "fps": fps, "plays": [], "summary": {}}

    # ─── Step 2: Compute baselines ───────────────────────────────
    med_hr      = statistics.median([m["height_ratio"]  for m in valid])
    med_near_xs = statistics.median([m["near_x_spread"] for m in valid])
    med_far_xs  = statistics.median([m["far_x_spread"]  for m in valid])
    med_net     = statistics.median([m["net_count"]      for m in valid])
    med_near    = statistics.median([m["near_count"]     for m in valid])
    med_max_y   = statistics.median([m["max_y"]          for m in valid])

    # ─── Step 3: Classify each frame ─────────────────────────────
    labels = []
    for m in frame_metrics:
        if m is None:
            labels.append(None)
            continue

        hr          = m["height_ratio"]
        near_xs     = m["near_x_spread"]
        net         = m["net_count"]
        near        = m["near_count"]
        max_y       = m["max_y"]

        # Serve: near team spread wide in passing formation + one player
        #        deep at baseline (server is isolated far back)
        if near_xs > med_near_xs * 1.15 and max_y > med_max_y * 1.05:
            labels.append("serve")
        # Block: multiple players clustered at the net
        elif net > med_net + 1:
            labels.append("block")
        # Spike: height ratio spike with net activity
        elif hr > med_hr * 1.1 and net >= med_net:
            labels.append("spike")
        # Dig: near team spread wide (passing/defensive formation)
        elif near_xs > med_near_xs * 1.1 and near >= med_near:
            labels.append("dig")
        # Set: players converging toward center (tighter than usual)
        elif near_xs < med_near_xs * 0.85 and near >= med_near:
            labels.append("set")
        else:
            labels.append(None)

    # ─── Step 4: Smooth with majority voting (window=5) ──────────
    smoothed = list(labels)
    half = 2
    for i in range(half, len(smoothed) - half):
        window = labels[i - half:i + half + 1]
        non_none = [w for w in window if w is not None]
        if len(non_none) >= 3:
            most_common, count = Counter(non_none).most_common(1)[0]
            smoothed[i] = most_common if count >= 3 else None
        else:
            smoothed[i] = None

    # ─── Step 5: Merge into segments ─────────────────────────────
    segments = []
    i = 0
    while i < len(smoothed):
        if smoothed[i] is None:
            i += 1
            continue

        label = smoothed[i]
        start_idx = i
        while i < len(smoothed) and smoothed[i] == label:
            i += 1
        end_idx = i - 1
        run_len = end_idx - start_idx + 1

        if run_len >= 3:
            start_m = frame_metrics[start_idx]
            end_m   = frame_metrics[end_idx]
            if start_m and end_m:
                segments.append({
                    "play":          label,
                    "start_frame":   start_m["frame"],
                    "end_frame":     end_m["frame"],
                    "start_time_sec": round(start_m["timestamp"], 2),
                    "end_time_sec":   round(end_m["timestamp"], 2),
                })

    # ─── Step 6: Summary ─────────────────────────────────────────
    summary = {}
    for seg in segments:
        summary[seg["play"]] = summary.get(seg["play"], 0) + 1

    return {"video_id": video_id, "fps": fps, "plays": segments, "summary": summary}
