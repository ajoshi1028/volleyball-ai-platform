import cv2
import tempfile
import os
from pathlib import Path
from ultralytics import YOLO

from utils.gcs import download_from_gcs, upload_to_gcs
from utils.play_recognition import recognize_plays

# Load models lazily to avoid crashes if files are missing
_pretrained_model = None
_trained_model = None


def _get_pretrained_model():
    global _pretrained_model
    if _pretrained_model is None:
        model_path = Path(__file__).parent.parent / "yolo11m.pt"
        if not model_path.exists():
            # YOLO will auto-download if not found
            _pretrained_model = YOLO("yolo11m.pt")
        else:
            _pretrained_model = YOLO(str(model_path))
    return _pretrained_model


def _get_trained_model():
    global _trained_model
    if _trained_model is None:
        model_path = Path(__file__).parent.parent / "volleyball_trained.pt"
        if model_path.exists():
            _trained_model = YOLO(str(model_path))
        else:
            _trained_model = None  # Will skip ball detection
    return _trained_model


def detect_in_video(gcs_uri: str) -> dict:
    """
    Run YOLO detection on a video from GCS.
    Uses pretrained YOLOv8m for player detection (reliable)
    and custom-trained model for ball detection (when available).
    """
    # Extract blob name from GCS URI
    # gs://bucket-name/path/to/file.mp4 -> path/to/file.mp4
    parts = gcs_uri.replace("gs://", "").split("/", 1)
    blob_name = parts[1] if len(parts) > 1 else gcs_uri

    with tempfile.TemporaryDirectory() as tmpdir:
        video_path = Path(tmpdir) / "video.mp4"

        try:
            download_from_gcs(blob_name, str(video_path))
        except Exception as e:
            return {"error": f"Failed to download video from GCS: {e}"}

        if not video_path.exists() or video_path.stat().st_size == 0:
            return {"error": "Downloaded video is empty or missing"}

        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            return {"error": "Could not open video file"}

        # Video properties
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        # Load models
        pretrained = _get_pretrained_model()
        trained = _get_trained_model()

        stats = {
            "total_frames": total_frames,
            "fps": round(fps, 2),
            "resolution": f"{width}x{height}",
            "frames_with_detections": 0,
            "max_people_in_frame": 0,
            "avg_people_per_detection_frame": 0,
            "total_detections": 0,
            "frames_with_ball": 0,
            "ball_detection_rate": 0,
        }

        frames_detections = []
        frame_count = 0
        processed_frames = 0

        # Annotated video output
        output_path = Path(tmpdir) / "annotated_video.mp4"
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        out = cv2.VideoWriter(str(output_path), fourcc, fps, (width, height))

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            # Process every 5th frame for speed
            if frame_count % 5 == 0:
                # Person detection (COCO class 0 = person)
                pretrained_results = pretrained(frame, verbose=False, conf=0.3)
                person_boxes = [
                    box for box in pretrained_results[0].boxes
                    if int(box.cls) == 0
                ]

                # Ball detection — try trained model first, then COCO fallback
                ball_boxes = []

                # Method 1: Custom-trained model (class 0 = Ball)
                if trained is not None:
                    trained_results = trained(frame, verbose=False, conf=0.15)
                    for box in trained_results[0].boxes:
                        if int(box.cls) == 0:
                            x1, y1, x2, y2 = box.xyxy[0]
                            bw, bh = float(x2 - x1), float(y2 - y1)
                            max_ball = min(width, height) * 0.15
                            if 3 < bw < max_ball and 3 < bh < max_ball:
                                ball_boxes.append(box)

                # Method 2: COCO sports ball fallback (class 32)
                if not ball_boxes:
                    for box in pretrained_results[0].boxes:
                        if int(box.cls) == 32:  # COCO sports ball
                            x1, y1, x2, y2 = box.xyxy[0]
                            bw, bh = float(x2 - x1), float(y2 - y1)
                            max_ball = min(width, height) * 0.15
                            if 3 < bw < max_ball and 3 < bh < max_ball:
                                ball_boxes.append(box)

                num_people = len(person_boxes)
                has_ball = len(ball_boxes) > 0

                if num_people > 0:
                    stats["frames_with_detections"] += 1
                    stats["total_detections"] += num_people
                    stats["max_people_in_frame"] = max(
                        stats["max_people_in_frame"], num_people
                    )

                if has_ball:
                    stats["frames_with_ball"] += 1

                # Build frame detection object for play recognition
                frame_obj = {
                    "frame": frame_count,
                    "timestamp_sec": round(frame_count / fps, 3),
                    "objects": [],
                }

                for box in person_boxes:
                    x1, y1, x2, y2 = box.xyxy[0]
                    frame_obj["objects"].append({
                        "label": "player",
                        "confidence": round(float(box.conf[0]), 3),
                        "bbox": [float(x1), float(y1), float(x2), float(y2)],
                    })

                for box in ball_boxes:
                    x1, y1, x2, y2 = box.xyxy[0]
                    frame_obj["objects"].append({
                        "label": "ball",
                        "confidence": round(float(box.conf[0]), 3),
                        "bbox": [float(x1), float(y1), float(x2), float(y2)],
                    })

                frames_detections.append(frame_obj)

                # Draw annotations on frame
                annotated_frame = pretrained_results[0].plot()
                out.write(annotated_frame)
                processed_frames += 1
            else:
                out.write(frame)

            frame_count += 1

        cap.release()
        out.release()

        # Calculate averages
        if stats["frames_with_detections"] > 0:
            stats["avg_people_per_detection_frame"] = round(
                stats["total_detections"] / stats["frames_with_detections"], 1
            )

        if processed_frames > 0:
            stats["ball_detection_rate"] = round(
                (stats["frames_with_ball"] / processed_frames) * 100, 1
            )

        # Run play recognition
        play_result = recognize_plays({
            "video_id": Path(gcs_uri).stem,
            "gcs_uri": gcs_uri,
            "fps": fps,
            "frame_count": total_frames,
            "detections": frames_detections,
        })

        # Upload annotated video to GCS
        try:
            annotated_uri = upload_to_gcs(
                str(output_path),
                f"raw-videos/{Path(gcs_uri).stem}_annotated.mp4",
            )
            stats["annotated_video_uri"] = annotated_uri
        except Exception:
            stats["annotated_video_uri"] = None

        stats["processed_frames"] = processed_frames
        stats["play_recognition"] = play_result
        stats["play_summary"] = play_result.get("summary", {})

        # ─── Ball speed calculation ──────────────────────────────
        ball_positions = []
        for fd in frames_detections:
            balls = [o for o in fd["objects"] if o["label"] == "ball"]
            if balls:
                bx = (balls[0]["bbox"][0] + balls[0]["bbox"][2]) / 2
                by = (balls[0]["bbox"][1] + balls[0]["bbox"][3]) / 2
                ball_positions.append({
                    "frame": fd["frame"],
                    "timestamp": fd["timestamp_sec"],
                    "x": round(bx, 1),
                    "y": round(by, 1),
                })

        ball_speeds = []
        for i in range(1, len(ball_positions)):
            prev = ball_positions[i - 1]
            curr = ball_positions[i]
            dt = curr["timestamp"] - prev["timestamp"]
            if dt > 0:
                dx = curr["x"] - prev["x"]
                dy = curr["y"] - prev["y"]
                dist = (dx**2 + dy**2) ** 0.5
                speed = dist / dt  # pixels per second
                ball_speeds.append(speed)
                curr["speed_px_per_sec"] = round(speed, 1)

        if ball_speeds:
            stats["ball_speed"] = {
                "avg_px_per_sec": round(sum(ball_speeds) / len(ball_speeds), 1),
                "max_px_per_sec": round(max(ball_speeds), 1),
            }
        stats["ball_positions"] = ball_positions

        # ─── Sampled detection frames for frontend overlay ───────
        # Send every Nth frame to keep response size reasonable
        play_segments = play_result.get("plays", [])
        overlay_frames = []

        # Include frames during active plays (most important)
        for fd in frames_detections:
            t = fd["timestamp_sec"]
            active_play = None
            for seg in play_segments:
                if seg["start_time_sec"] <= t <= seg["end_time_sec"]:
                    active_play = seg["play"]
                    break

            # Include this frame if: it's during a play, OR every 10th frame
            if active_play or fd["frame"] % 50 == 0:
                overlay_frames.append({
                    "frame": fd["frame"],
                    "timestamp": round(fd["timestamp_sec"], 3),
                    "objects": fd["objects"],
                    "play": active_play,
                })

        stats["detection_frames"] = overlay_frames

        return stats
