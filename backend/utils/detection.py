import cv2
import tempfile
from pathlib import Path
from ultralytics import YOLO
import sys
from pathlib import Path as PathlibPath

# Add parent directory to path for imports
sys.path.insert(0, str(PathlibPath(__file__).parent.parent))

from utils.gcs import download_from_gcs, upload_to_gcs
from utils.play_recognition import PlayRecognizer
from collections import defaultdict

# Load trained YOLOv8m model (fine-tuned on 110 volleyball frames)
model = YOLO('volleyball_trained.pt')

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
        detections = {
            "total_frames": total_frames,
            "fps": fps,
            "resolution": f"{width}x{height}",
            "frames_with_detections": 0,
            "max_people_in_frame": 0,
            "avg_people_per_detection_frame": 0,
            "total_detections": 0,
            "frames_with_ball": 0,
            "ball_detection_rate": 0,
            "plays": defaultdict(int),
        }

        frame_count = 0
        processed_frames = 0
        recognizer = PlayRecognizer(height, width)
        prev_detections = None
        current_play = None
        play_start_frame = 0

        # Setup video writer for annotated video
        output_path = Path(tmpdir) / "annotated_video.mp4"
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(str(output_path), fourcc, fps, (width, height))

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            # Process every 5th frame for speed
            if frame_count % 5 == 0:
                # Run detection with lower confidence threshold for better ball detection
                results = model(frame, verbose=False, conf=0.3)

                # Count detections (person class = 0, sports ball class = 32 in COCO)
                boxes = results[0].boxes
                person_detections = [box for box in boxes if int(box.cls) == 0]

                # Ball detection with size filtering (class 0 in trained model)
                ball_detections = []
                for box in boxes:
                    if int(box.cls) == 0:  # Ball class in trained model
                        # Filter by box size (volleyball should be 10-200 pixels)
                        x1, y1, x2, y2 = box.xyxy[0]
                        box_width = x2 - x1
                        box_height = y2 - y1
                        if 10 < box_width < 300 and 10 < box_height < 300:
                            ball_detections.append(box)

                detections_in_frame = len(person_detections)
                has_ball = len(ball_detections) > 0

                if detections_in_frame > 0:
                    detections["frames_with_detections"] += 1
                    detections["total_detections"] += detections_in_frame
                    detections["max_people_in_frame"] = max(
                        detections["max_people_in_frame"],
                        detections_in_frame
                    )

                if has_ball:
                    detections["frames_with_ball"] += 1

                # Play recognition
                current_frame_detections = []
                for box in boxes:
                    x1, y1, x2, y2 = box.xyxy[0]
                    conf = box.conf[0]
                    cls_id = box.cls[0]
                    current_frame_detections.append([x1.item(), y1.item(), x2.item(), y2.item(), conf.item(), cls_id.item()])

                play_type, confidence = recognizer.get_play_type(current_frame_detections, prev_detections)

                if play_type and confidence > 0.5:
                    detections["plays"][play_type] += 1

                prev_detections = current_frame_detections

                # Draw boxes on frame
                annotated_frame = results[0].plot()
                out.write(annotated_frame)
                processed_frames += 1
            else:
                out.write(frame)

            frame_count += 1

        # Calculate averages
        if detections["frames_with_detections"] > 0:
            detections["avg_people_per_detection_frame"] = round(
                detections["total_detections"] / detections["frames_with_detections"], 2
            )

        if processed_frames > 0:
            detections["ball_detection_rate"] = round(
                (detections["frames_with_ball"] / processed_frames) * 100, 1
            )

        cap.release()
        out.release()

        # Upload annotated video
        annotated_gcs_uri = upload_to_gcs(
            str(output_path),
            f"raw-videos/{Path(gcs_uri).stem}_annotated.mp4"
        )

        detections["annotated_video_uri"] = annotated_gcs_uri
        detections["processed_frames"] = processed_frames

        # Convert plays dict to regular dict
        detections["plays"] = dict(detections["plays"])

        return detections
