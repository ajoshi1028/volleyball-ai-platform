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
    vw = detection_result.get("video_width", 1920)
    vh = detection_result.get("video_height", 1080)

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
        # Normalize to 0-1 range
        ys = [c[1] / vh for c in centers]
        xs = [c[0] / vw for c in centers]

        med_h = statistics.median(heights)
        max_h = max(heights)

        # Net is at ~y=0.44 of frame from end-zone camera
        # Split by court depth (y position in frame)
        near_idxs = [i for i, y in enumerate(ys) if y > 0.58]   # near team (backcourt)
        far_idxs  = [i for i, y in enumerate(ys) if y < 0.50]   # far team (front court)
        net_count = len([y for y in ys if y < 0.50])             # near/at net

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

        # Spike: height ratio spike (someone jumping)
        if hr > med_hr * 1.08:
            labels.append("spike")
        # Block: more players at net than usual
        elif net > med_net:
            labels.append("block")
        # Serve: near team spread wide in passing formation
        elif near_xs > med_near_xs * 1.1:
            labels.append("serve")
        # Dig: near team spread moderately wide
        elif near_xs > med_near_xs * 1.05 and near >= med_near:
            labels.append("dig")
        # Set: near team converging tighter than usual
        elif near_xs < med_near_xs * 0.9:
            labels.append("set")
        else:
            labels.append(None)

    # ─── Debug: print per-frame labels and key metrics ───────────
    print(f"\n[play_recognition] baselines: hr={med_hr:.2f} near_xs={med_near_xs:.2f} net={med_net:.1f} near={med_near:.1f}")
    for m, label in zip(frame_metrics, labels):
        if m:
            print(f"  t={m['timestamp']:.1f}s hr={m['height_ratio']:.2f} near_xs={m['near_x_spread']:.2f} net={m['net_count']} near={m['near_count']} → {label}")

    # ─── Step 4: Smooth with majority voting (window=5) ──────────
    smoothed = list(labels)
    half = 1
    for i in range(half, len(smoothed) - half):
        window = labels[i - half:i + half + 1]
        non_none = [w for w in window if w is not None]
        if len(non_none) >= 2:
            most_common, count = Counter(non_none).most_common(1)[0]
            smoothed[i] = most_common if count >= 2 else None
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
