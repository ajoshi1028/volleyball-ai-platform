"""
Volleyball play recognition — temporal motion detection.

Instead of guessing play types from static positions (unreliable),
detects MOMENTS OF ACTION by tracking player movement between frames.

Identifies:
  - Rally starts/ends (sudden formation changes)
  - Attack moments (player jumping — bbox height spike)
  - Defensive plays (player crouching — bbox aspect ratio change)
  - Ball-in-play events (clustered player movement)

Each event highlights the specific player(s) involved.
"""

import statistics
import math
from typing import Optional


def _center(bbox):
    return ((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2)


def _height(bbox):
    return abs(bbox[3] - bbox[1])


def _width(bbox):
    return abs(bbox[2] - bbox[0])


def _find_players(frame_data):
    return [obj for obj in frame_data.get("objects", []) if obj["label"] == "player"]


def _distance(a, b):
    return math.sqrt((a[0] - b[0])**2 + (a[1] - b[1])**2)


def _match_players_between_frames(prev_players, curr_players):
    """
    Match players between two frames using nearest-neighbor on bbox centers.
    Returns list of (prev_idx, curr_idx, distance_moved) tuples.
    """
    if not prev_players or not curr_players:
        return []

    prev_centers = [_center(p["bbox"]) for p in prev_players]
    curr_centers = [_center(p["bbox"]) for p in curr_players]

    matches = []
    used_curr = set()

    for pi, pc in enumerate(prev_centers):
        best_ci = None
        best_dist = float("inf")
        for ci, cc in enumerate(curr_centers):
            if ci in used_curr:
                continue
            d = _distance(pc, cc)
            if d < best_dist:
                best_dist = d
                best_ci = ci
        if best_ci is not None and best_dist < 300:  # Max 300px movement between frames
            matches.append((pi, best_ci, best_dist))
            used_curr.add(best_ci)

    return matches


def recognize_plays(detection_result: dict) -> dict:
    """
    Detect plays by tracking player motion between consecutive frames.

    Algorithm:
    1. Match players between consecutive frames (nearest-neighbor)
    2. Compute per-player movement speed and bbox height changes
    3. Detect events:
       - ATTACK: player's bbox height increases >12% (jumping)
       - DEFENSE: player's bbox gets wider relative to height (crouching)
       - SERVE: isolated player moves significantly while others are still
       - RALLY: multiple players moving simultaneously
    4. Tag the specific player(s) causing each event
    """
    detections = detection_result.get("detections", [])
    fps = detection_result.get("fps", 30.0)
    video_id = detection_result.get("video_id", "unknown")
    vw = detection_result.get("video_width", 1920)
    vh = detection_result.get("video_height", 1080)

    if len(detections) < 5:
        return {"video_id": video_id, "fps": fps, "plays": [], "summary": {}}

    # Step 1: Compute per-frame motion metrics
    frame_events = []  # List of {frame, timestamp, play, key_player_indices}

    for i in range(1, len(detections)):
        prev_fd = detections[i - 1]
        curr_fd = detections[i]

        prev_players = _find_players(prev_fd)
        curr_players = _find_players(curr_fd)

        if len(prev_players) < 3 or len(curr_players) < 3:
            continue

        matches = _match_players_between_frames(prev_players, curr_players)
        if len(matches) < 3:
            continue

        frame_num = curr_fd.get("frame", i * 5)
        timestamp = curr_fd.get("timestamp_sec", frame_num / fps)

        # Compute per-player metrics
        movements = []  # (curr_player_idx, distance, height_change_ratio, aspect_change)
        for pi, ci, dist in matches:
            prev_h = _height(prev_players[pi]["bbox"])
            curr_h = _height(curr_players[ci]["bbox"])
            prev_ar = _width(prev_players[pi]["bbox"]) / max(prev_h, 1)
            curr_ar = _width(curr_players[ci]["bbox"]) / max(curr_h, 1)

            h_ratio = curr_h / max(prev_h, 1)  # >1 = got taller (jumping), <1 = got shorter
            ar_change = curr_ar - prev_ar  # positive = got wider (crouching)

            movements.append({
                "curr_idx": ci,
                "dist": dist,
                "h_ratio": h_ratio,
                "ar_change": ar_change,
                "curr_h": curr_h,
                "curr_y": _center(curr_players[ci]["bbox"])[1],
            })

        if not movements:
            continue

        avg_dist = statistics.mean([m["dist"] for m in movements])
        max_dist_player = max(movements, key=lambda m: m["dist"])

        # All player Y positions (for determining net proximity)
        all_ys = [m["curr_y"] for m in movements]
        median_y = statistics.median(all_ys)

        # Detect ATTACK (jumping)
        # Player's bbox got significantly taller = jumping
        jumpers = [m for m in movements if m["h_ratio"] > 1.12 and m["curr_y"] < median_y]
        if jumpers:
            best_jumper = max(jumpers, key=lambda m: m["h_ratio"])
            frame_events.append({
                "frame": frame_num,
                "timestamp": timestamp,
                "play": "spike",
                "key_players": [best_jumper["curr_idx"]],
                "confidence": min(best_jumper["h_ratio"] - 1, 0.5) * 2,  # 0-1 scale
            })
            continue

        # Detect BLOCK (multiple players jumping at net)
        net_jumpers = [m for m in movements if m["h_ratio"] > 1.08 and m["curr_y"] < median_y - 10]
        if len(net_jumpers) >= 2:
            frame_events.append({
                "frame": frame_num,
                "timestamp": timestamp,
                "play": "block",
                "key_players": [m["curr_idx"] for m in net_jumpers],
                "confidence": 0.7,
            })
            continue

        # Detect DIG (player crouching in back court)
        crouchers = [m for m in movements if m["ar_change"] > 0.08 and m["curr_y"] > median_y]
        if crouchers:
            best_croucher = max(crouchers, key=lambda m: m["ar_change"])
            frame_events.append({
                "frame": frame_num,
                "timestamp": timestamp,
                "play": "dig",
                "key_players": [best_croucher["curr_idx"]],
                "confidence": min(best_croucher["ar_change"], 0.5) * 2,
            })
            continue

        # Detect SERVE (one player moves while others are still)
        if max_dist_player["dist"] > avg_dist * 2.5 and avg_dist < 15:
            # One player moved a lot while others barely moved
            if max_dist_player["curr_y"] > median_y:  # Back court
                frame_events.append({
                    "frame": frame_num,
                    "timestamp": timestamp,
                    "play": "serve",
                    "key_players": [max_dist_player["curr_idx"]],
                    "confidence": min(max_dist_player["dist"] / 100, 1.0),
                })
                continue

        # Detect SET (front player with slight height increase)
        front_risers = [m for m in movements if m["h_ratio"] > 1.05 and m["curr_y"] < median_y and m["dist"] > 5]
        if front_risers:
            best = max(front_risers, key=lambda m: m["h_ratio"])
            frame_events.append({
                "frame": frame_num,
                "timestamp": timestamp,
                "play": "set",
                "key_players": [best["curr_idx"]],
                "confidence": min((best["h_ratio"] - 1) * 5, 1.0),
            })
            continue

    # Step 2: Merge consecutive same-type events into segments
    segments = _merge_events(frame_events, fps)

    # Step 3: Summary
    summary = {}
    for seg in segments:
        summary[seg["play"]] = summary.get(seg["play"], 0) + 1

    return {
        "video_id": video_id,
        "fps": fps,
        "plays": segments,
        "summary": summary,
    }


def _merge_events(events, fps, max_gap_sec=1.0, min_duration_frames=1):
    """Merge nearby events of the same type into play segments."""
    if not events:
        return []

    segments = []
    current = {
        "play": events[0]["play"],
        "start_frame": events[0]["frame"],
        "end_frame": events[0]["frame"],
        "key_player_indices": events[0]["key_players"],
        "confidence": events[0].get("confidence", 0.5),
    }

    for i in range(1, len(events)):
        evt = events[i]
        gap = evt["timestamp"] - (current["end_frame"] / fps)

        if evt["play"] == current["play"] and gap < max_gap_sec:
            current["end_frame"] = evt["frame"]
            current["key_player_indices"] = evt["key_players"]
            current["confidence"] = max(current["confidence"], evt.get("confidence", 0.5))
        else:
            current["start_time_sec"] = round(current["start_frame"] / fps, 2)
            current["end_time_sec"] = round(current["end_frame"] / fps, 2)
            current["confidence"] = round(current["confidence"], 2)
            segments.append(current)

            current = {
                "play": evt["play"],
                "start_frame": evt["frame"],
                "end_frame": evt["frame"],
                "key_player_indices": evt["key_players"],
                "confidence": evt.get("confidence", 0.5),
            }

    # Don't forget last segment
    current["start_time_sec"] = round(current["start_frame"] / fps, 2)
    current["end_time_sec"] = round(current["end_frame"] / fps, 2)
    current["confidence"] = round(current["confidence"], 2)
    segments.append(current)

    return segments
