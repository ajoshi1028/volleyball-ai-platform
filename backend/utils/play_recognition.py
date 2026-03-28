"""
Volleyball play recognition — identifies WHICH player is making each play.

Uses player bounding box geometry:
  - SERVE:  Isolated player farthest from net (highest Y), behind baseline
  - SPIKE:  Front-row player with tallest bbox (jumping at net)
  - BLOCK:  2-3 players clustered tightly at net, elevated together
  - SET:    Player near net with above-average height (arms raised)
  - DIG:    Back-court player with widest aspect ratio (crouched low)
"""

import statistics
from typing import Optional


def _center(bbox):
    return ((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2)


def _height(bbox):
    return abs(bbox[3] - bbox[1])


def _width(bbox):
    return abs(bbox[2] - bbox[0])


def _aspect_ratio(bbox):
    h = _height(bbox)
    return _width(bbox) / h if h > 0 else 1


def _find_players(frame_data):
    return [obj for obj in frame_data.get("objects", []) if obj["label"] == "player"]


def _distance(a, b):
    return ((a[0] - b[0])**2 + (a[1] - b[1])**2) ** 0.5


def _classify_frame(players, all_median_h, all_median_y):
    """
    Classify which play is happening and which player(s) are doing it.

    Returns: (play_type, key_player_indices) or (None, [])
    """
    if len(players) < 3:
        return None, []

    centers = [_center(p["bbox"]) for p in players]
    heights = [_height(p["bbox"]) for p in players]
    widths = [_width(p["bbox"]) for p in players]
    ys = [c[1] for c in centers]
    xs = [c[0] for c in centers]

    median_y = statistics.median(ys)
    median_h = statistics.median(heights) if len(heights) > 0 else all_median_h

    # ─── Check for SPIKE: player near net with significantly taller bbox ───
    # The spiker is jumping, so their bbox is taller than average
    tallest_idx = max(range(len(players)), key=lambda i: heights[i])
    tallest_h = heights[tallest_idx]
    tallest_y = ys[tallest_idx]

    if tallest_h > median_h * 1.12 and tallest_y < median_y:
        # Player is taller than average AND closer to net (lower Y = higher in frame = closer to net)
        return "spike", [tallest_idx]

    # ─── Check for BLOCK: 2-3 players clustered at net, all above average height ───
    net_threshold = median_y - (max(ys) - min(ys)) * 0.15
    net_players = [(i, p) for i, (p, y) in enumerate(zip(players, ys)) if y < net_threshold]
    if len(net_players) >= 2:
        # Check if they're clustered horizontally (close together)
        net_xs = [centers[i][0] for i, _ in net_players]
        x_spread = max(net_xs) - min(net_xs) if len(net_xs) > 1 else 0
        avg_width = statistics.mean([widths[i] for i, _ in net_players])

        # Clustered = within ~3 player widths of each other
        if x_spread < avg_width * 4 and len(net_players) <= 4:
            # Check at least 2 are elevated (taller bbox)
            elevated = [(i, p) for i, p in net_players if heights[i] > median_h * 1.05]
            if len(elevated) >= 2:
                return "block", [i for i, _ in elevated]

    # ─── Check for SERVE: isolated player at back of court ───
    # Server is farthest from net (highest Y) and isolated from others
    farthest_idx = max(range(len(players)), key=lambda i: ys[i])
    farthest_y = ys[farthest_idx]
    farthest_x = xs[farthest_idx]

    # Check isolation: how far is this player from the nearest neighbor?
    min_dist = float("inf")
    for i, c in enumerate(centers):
        if i != farthest_idx:
            d = _distance(centers[farthest_idx], c)
            min_dist = min(min_dist, d)

    avg_spacing = statistics.mean([
        min(_distance(centers[i], centers[j]) for j in range(len(centers)) if j != i)
        for i in range(len(centers))
    ]) if len(centers) > 1 else 0

    if min_dist > avg_spacing * 1.3 and farthest_y > median_y:
        return "serve", [farthest_idx]

    # ─── Check for DIG: back-court player with widest aspect ratio (crouched) ───
    back_players = [(i, p) for i, (p, y) in enumerate(zip(players, ys)) if y > median_y]
    if back_players:
        # Find widest aspect ratio (most crouched)
        widest_idx = max(
            [i for i, _ in back_players],
            key=lambda i: _aspect_ratio(players[i]["bbox"])
        )
        ar = _aspect_ratio(players[widest_idx]["bbox"])
        if ar > 0.55:  # Significantly wider than normal standing player (~0.3-0.4)
            return "dig", [widest_idx]

    # ─── Check for SET: player near net, arms raised (taller than neighbors) ───
    front_players = [(i, p) for i, (p, y) in enumerate(zip(players, ys)) if y < median_y]
    if front_players:
        # Setter is typically the tallest front-row player (arms up)
        tallest_front = max([i for i, _ in front_players], key=lambda i: heights[i])
        if heights[tallest_front] > median_h * 1.05:
            return "set", [tallest_front]

    return None, []


def _merge_segments(labeled_frames, fps, min_run=2):
    """Merge consecutive same-label frames into play segments."""
    if not labeled_frames:
        return []

    segments = []
    run_start = labeled_frames[0]
    run_label = run_start["play"]
    run_players = run_start["key_players"]
    run_count = 1

    for i in range(1, len(labeled_frames)):
        curr = labeled_frames[i]
        if curr["play"] == run_label:
            run_count += 1
            run_players = curr["key_players"]  # Use latest player indices
        else:
            if run_count >= min_run:
                segments.append({
                    "play": run_label,
                    "start_frame": run_start["frame"],
                    "end_frame": labeled_frames[i - 1]["frame"],
                    "start_time_sec": round(run_start["frame"] / fps, 2),
                    "end_time_sec": round(labeled_frames[i - 1]["frame"] / fps, 2),
                    "key_player_indices": run_players,
                })
            run_start = curr
            run_label = curr["play"]
            run_players = curr["key_players"]
            run_count = 1

    if run_count >= min_run:
        segments.append({
            "play": run_label,
            "start_frame": run_start["frame"],
            "end_frame": labeled_frames[-1]["frame"],
            "start_time_sec": round(run_start["frame"] / fps, 2),
            "end_time_sec": round(labeled_frames[-1]["frame"] / fps, 2),
            "key_player_indices": run_players,
        })

    return segments


def recognize_plays(detection_result: dict) -> dict:
    """
    Identify volleyball plays and the specific player(s) making each play.
    """
    detections = detection_result.get("detections", [])
    fps = detection_result.get("fps", 30.0)
    video_id = detection_result.get("video_id", "unknown")

    if len(detections) < 5:
        return {"video_id": video_id, "fps": fps, "plays": [], "summary": {}}

    # Global baselines from all frames
    all_heights = []
    all_ys = []
    for fd in detections:
        for obj in fd.get("objects", []):
            if obj["label"] == "player":
                all_heights.append(_height(obj["bbox"]))
                all_ys.append(_center(obj["bbox"])[1])

    if not all_heights:
        return {"video_id": video_id, "fps": fps, "plays": [], "summary": {}}

    global_median_h = statistics.median(all_heights)
    global_median_y = statistics.median(all_ys)

    # Classify each frame
    labeled_frames = []
    for fd in detections:
        players = _find_players(fd)
        play, key_indices = _classify_frame(players, global_median_h, global_median_y)
        if play:
            labeled_frames.append({
                "frame": fd.get("frame", 0),
                "play": play,
                "key_players": key_indices,
            })

    segments = _merge_segments(labeled_frames, fps)

    # Summary
    summary = {}
    for seg in segments:
        summary[seg["play"]] = summary.get(seg["play"], 0) + 1

    return {
        "video_id": video_id,
        "fps": fps,
        "plays": segments,
        "summary": summary,
    }
