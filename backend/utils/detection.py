import cv2
import tempfile
from pathlib import Path
from ultralytics import YOLO
import sys
from pathlib import Path as PathlibPath

# Add parent directory to path for imports
sys.path.insert(0, str(PathlibPath(__file__).parent.parent))

from utils.gcs import download_from_gcs, upload_to_gcs
from utils.play_recognition import recognize_plays
from collections import defaultdict

# Load BOTH models:
# - Pretrained YOLOv8m for reliable person detection (COCO classes)
# - Custom-trained model for volleyball-specific ball detection
pretrained_model = YOLO('yolov8m.pt')
trained_model = YOLO('volleyball_trained.pt')

def detect_in_video(gcs_uri: str) -> dict:
    """
    Run YOLO detection on a video from GCS.
    Returns detection statistics and annotated video URI.
    """
    # Extract blob name from GCS URI (e.g., gs://bucket/raw-videos/file.mp4 -> raw-videos/file.mp4)
    blob_name = gcs_uri.split('/', 3)[-1] if '/' in gcs_uri else gcs_uri

    # Download video from GCS
    with tempfile.TemporaryDirectory() as tmpdir:
        video_path = Path(tmpdir) / "video.mp4"
        download_from_gcs(blob_name, str(video_path))

        # Open video
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            return {"error": "Could not open video"}

        # Get video properties
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        # Process frames (sample every 5th frame for speed)
        detections_stats = {
            "total_frames": total_frames,
            "fps": fps,
            "resolution": f"{width}x{height}",
            "frames_with_detections": 0,
            "max_people_in_frame": 0,
            "avg_people_per_detection_frame": 0,
            "total_detections": 0,
            "frames_with_ball": 0,
            "ball_detection_rate": 0,
        }

        # Collect per-frame detections for play recognition
        frames_detections = []
        frame_count = 0
        processed_frames = 0



        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            # Process every 10th frame for speed
            if frame_count % 10 == 0:
                # Use PRETRAINED model for person detection (COCO class 0 = person)
                pretrained_results = pretrained_model(frame, verbose=False, conf=0.3)
                pretrained_boxes = pretrained_results[0].boxes
                person_detections = [box for box in pretrained_boxes if int(box.cls) == 0]

                # Use TRAINED model for ball detection (trained class 0 = Ball)
                trained_results = trained_model(frame, verbose=False, conf=0.05)
                trained_boxes = trained_results[0].boxes
                ball_detections = []
                for box in trained_boxes:
                    if int(box.cls) == 0:  # Ball class in trained model
                        x1, y1, x2, y2 = box.xyxy[0]
                        box_width = x2 - x1
                        box_height = y2 - y1
                        if 5 < box_width < 300 and 5 < box_height < 300:
                            ball_detections.append(box)

                detections_in_frame = len(person_detections)
                has_ball = len(ball_detections) > 0

                if detections_in_frame > 0:
                    detections_stats["frames_with_detections"] += 1
                    detections_stats["total_detections"] += detections_in_frame
                    detections_stats["max_people_in_frame"] = max(
                        detections_stats["max_people_in_frame"],
                        detections_in_frame
                    )

                if has_ball:
                    detections_stats["frames_with_ball"] += 1

                # Collect frame detections for play recognition
                frame_obj = {
                    "frame": frame_count,
                    "timestamp_sec": frame_count / fps,
                    "objects": []
                }

                # Add person detections
                for box in person_detections:
                    x1, y1, x2, y2 = box.xyxy[0]
                    conf = float(box.conf[0])
                    frame_obj["objects"].append({
                        "label": "player",
                        "confidence": conf,
                        "bbox": [float(x1), float(y1), float(x2), float(y2)]
                    })

                # Add ball detections
                for box in ball_detections:
                    x1, y1, x2, y2 = box.xyxy[0]
                    conf = float(box.conf[0])
                    frame_obj["objects"].append({
                        "label": "ball",
                        "confidence": conf,
                        "bbox": [float(x1), float(y1), float(x2), float(y2)]
                    })

                frames_detections.append(frame_obj)
                processed_frames += 1

            frame_count += 1

        # Calculate averages
        if detections_stats["frames_with_detections"] > 0:
            detections_stats["avg_people_per_detection_frame"] = round(
                detections_stats["total_detections"] / detections_stats["frames_with_detections"], 2
            )

        if processed_frames > 0:
            detections_stats["ball_detection_rate"] = round(
                (detections_stats["frames_with_ball"] / processed_frames) * 100, 1
            )

        cap.release()

        # Run play recognition on collected detections
        play_recognition_result = recognize_plays({
            "video_id": Path(gcs_uri).stem,
            "gcs_uri": gcs_uri,
            "fps": fps,
            "frame_count": total_frames,
            "detections": frames_detections
        })

        detections_stats["annotated_video_uri"] = ""
        detections_stats["processed_frames"] = processed_frames
        detections_stats["video_width"] = width
        detections_stats["video_height"] = height
        detections_stats["frames_detections"] = frames_detections
        # Return FULL play recognition (segments with timestamps + summary)
        detections_stats["play_recognition"] = play_recognition_result
        detections_stats["play_summary"] = play_recognition_result.get("summary", {})

        return detections_stats
