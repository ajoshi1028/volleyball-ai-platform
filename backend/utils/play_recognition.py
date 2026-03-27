"""
Play recognition for volleyball AI platform.

Segments video into plays based on player positioning changes over time.
Uses adaptive thresholds computed from the actual detection data.
"""

from typing import Optional
import statistics


BBox = list[float]


def _center(bbox: BBox) -> tuple[float, float]:
    x1, y1, x2, y2 = bbox
    return ((x1 + x2) / 2, (y1 + y2) / 2)


def _height(bbox: BBox) -> float:
    return abs(bbox[3] - bbox[1])


def _width(bbox: BBox) -> float:
    return abs(bbox[2] - bbox[0])


def _find_players(frame_data: dict) -> list[dict]:
    return [obj for obj in frame_data.get("objects", []) if obj["label"] == "player"]


def recognize_plays(detection_result: dict) -> dict:
    """
    Analyze player positioning across frames to identify volleyball plays.

    Computes per-frame metrics (height ratios, clustering, court balance)
    and detects play transitions based on metric changes over time.
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
        if len(players) < 3:
            frame_metrics.append(None)
            continue

        centers = [_center(p["bbox"]) for p in players]
        heights = [_height(p["bbox"]) for p in players]
        ys = [c[1] for c in centers]
        xs = [c[0] for c in centers]

        med_y = statistics.median(ys)
        med_h = statistics.median(heights)
        max_h = max(heights)

        frame_metrics.append({
            "frame": frame_data.get("frame", 0),
            "timestamp": frame_data.get("timestamp_sec", 0),
            "num_players": len(players),
            "forward": len([y for y in ys if y < med_y - 15]),
            "back": len([y for y in ys if y > med_y + 15]),
            "height_ratio": max_h / med_h if med_h > 0 else 1,
            "x_spread": max(xs) - min(xs),
            "y_spread": max(ys) - min(ys),
            "mean_y": statistics.mean(ys),
            "mean_x": statistics.mean(xs),
        })

    # Filter out None frames
    valid_metrics = [m for m in frame_metrics if m is not None]
    if len(valid_metrics) < 5:
        return {"video_id": video_id, "fps": fps, "plays": [], "summary": {}}

    # ─── Step 2: Compute global baselines ────────────────────────
    all_hr = [m["height_ratio"] for m in valid_metrics]
    all_fwd = [m["forward"] for m in valid_metrics]
    all_bck = [m["back"] for m in valid_metrics]
    all_ysp = [m["y_spread"] for m in valid_metrics]
    all_np = [m["num_players"] for m in valid_metrics]

    med_hr = statistics.median(all_hr)
    med_fwd = statistics.median(all_fwd)
    med_bck = statistics.median(all_bck)
    med_ysp = statistics.median(all_ysp)
    med_np = statistics.median(all_np)

    # ─── Step 3: Classify each frame based on deviation ──────────
    labels = []
    for m in frame_metrics:
        if m is None:
            labels.append(None)
            continue

        hr = m["height_ratio"]
        fwd = m["forward"]
        bck = m["back"]
        ysp = m["y_spread"]
        np_ = m["num_players"]

        # Spike: someone jumping (height ratio spike)
        if hr > med_hr * 1.05 and fwd >= med_fwd:
            labels.append("spike")
        # Block: more players forward than usual, tight Y spread
        elif fwd > med_fwd + 1 and ysp < med_ysp * 0.9:
            labels.append("block")
        # Serve: fewer players than usual (players rotating), or back-heavy
        elif np_ < med_np - 1 or bck > med_bck + 2:
            labels.append("serve")
        # Dig: back-heavy, spread Y
        elif bck > fwd + 1 and ysp > med_ysp * 1.05:
            labels.append("dig")
        # Set: balanced forward/back, moderate spread
        elif abs(fwd - bck) <= 1:
            labels.append("set")
        else:
            labels.append(None)

    # ─── Step 4: Smooth labels (remove noise) ────────────────────
    # Apply majority voting in sliding window of 3
    smoothed = list(labels)
    for i in range(1, len(smoothed) - 1):
        window = [labels[i-1], labels[i], labels[i+1]]
        non_none = [w for w in window if w is not None]
        if non_none:
            from collections import Counter
            most_common = Counter(non_none).most_common(1)[0][0]
            smoothed[i] = most_common

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

        if run_len >= 2:  # minimum 2 frames
            start_m = frame_metrics[start_idx]
            end_m = frame_metrics[end_idx]
            if start_m and end_m:
                segments.append({
                    "play": label,
                    "start_frame": start_m["frame"],
                    "end_frame": end_m["frame"],
                    "start_time_sec": round(start_m["timestamp"], 2),
                    "end_time_sec": round(end_m["timestamp"], 2),
                })

    # ─── Step 6: Summary ─────────────────────────────────────────
    summary = {}
    for seg in segments:
        p = seg["play"]
        summary[p] = summary.get(p, 0) + 1

    return {
        "video_id": video_id,
        "fps": fps,
        "plays": segments,
        "summary": summary,
    }
