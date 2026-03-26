import cv2
import numpy as np
from collections import defaultdict

class PlayRecognizer:
    """Recognize volleyball plays based on player positions and movements"""

    def __init__(self, frame_height, frame_width):
        self.frame_height = frame_height
        self.frame_width = frame_width

        # Court zones (rough estimates for typical volleyball court)
        self.baseline_zone = frame_height * 0.85  # Bottom 15% is baseline
        self.net_zone_start = frame_height * 0.35
        self.net_zone_end = frame_height * 0.65
        self.net_x = frame_width / 2
        self.net_tolerance = frame_width * 0.15

    def get_play_type(self, detections, prev_detections=None):
        """
        Classify play type based on player detections

        Args:
            detections: List of bounding boxes [x1, y1, x2, y2, conf, cls]
            prev_detections: Previous frame detections for motion analysis

        Returns:
            play_type: str (serve, block, spike, dig, set, receive, or None)
            confidence: float (0-1)
        """
        if not detections or len(detections) == 0:
            return None, 0.0

        # Extract player positions (center of bboxes)
        players = self._extract_player_positions(detections)

        if not players:
            return None, 0.0

        # Analyze player positions and postures
        baseline_players = [p for p in players if p['y'] > self.baseline_zone]
        net_players = [p for p in players if self.net_zone_start < p['y'] < self.net_zone_end]
        mid_court_players = [p for p in players if p['y'] <= self.net_zone_start]

        # Check for different plays
        if len(baseline_players) >= 1 and len(players) < 6:
            return "serve", 0.7

        if len(net_players) >= 2:
            # Multiple players at net
            if self._players_clustered(net_players):
                return "block", 0.75
            else:
                return "set", 0.6

        if len(mid_court_players) >= 1:
            return "attack", 0.65

        if len(baseline_players) >= 2:
            return "dig", 0.6

        return None, 0.0

    def _extract_player_positions(self, detections):
        """Extract center positions of detected players"""
        players = []
        for det in detections:
            if len(det) >= 6:
                x1, y1, x2, y2, conf, cls_id = det[0], det[1], det[2], det[3], det[4], det[5]

                # Filter low confidence detections
                if conf < 0.5:
                    continue

                # Only people (class 0)
                if int(cls_id) != 0:
                    continue

                center_x = (x1 + x2) / 2
                center_y = (y1 + y2) / 2
                height = y2 - y1
                width = x2 - x1

                players.append({
                    'x': center_x,
                    'y': center_y,
                    'height': height,
                    'width': width,
                    'bbox': (x1, y1, x2, y2)
                })

        return players

    def _players_clustered(self, players, distance_threshold=150):
        """Check if players are clustered together (close to each other)"""
        if len(players) < 2:
            return False

        # Calculate average distance between players
        distances = []
        for i in range(len(players)):
            for j in range(i + 1, len(players)):
                dist = np.sqrt((players[i]['x'] - players[j]['x'])**2 +
                               (players[i]['y'] - players[j]['y'])**2)
                distances.append(dist)

        if not distances:
            return False

        avg_distance = np.mean(distances)
        return avg_distance < distance_threshold

    def _is_jumping(self, current_players, prev_players):
        """Detect if players are jumping based on position change"""
        if not prev_players or not current_players:
            return False

        # Match players between frames and check height changes
        for curr in current_players:
            # Find closest player in previous frame
            if prev_players:
                closest_prev = min(prev_players,
                                 key=lambda p: abs(p['x'] - curr['x']) + abs(p['y'] - curr['y']))

                # If player moved up significantly, they're jumping
                if closest_prev['y'] - curr['y'] > 50:  # Moved up 50+ pixels
                    return True

        return False


def analyze_plays(video_path, detections_by_frame, model):
    """
    Analyze video and extract play-by-play information

    Args:
        video_path: Path to video file
        detections_by_frame: Dict of frame_num -> detections
        model: YOLO model for detection

    Returns:
        plays: List of detected plays with timestamps
    """
    cap = cv2.VideoCapture(video_path)
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    fps = cap.get(cv2.CAP_PROP_FPS)

    recognizer = PlayRecognizer(frame_height, frame_width)
    plays = []
    current_play = None
    play_start_frame = 0
    prev_detections = None
    frame_num = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        # Run detection every 5th frame
        if frame_num % 5 == 0:
            results = model(frame, verbose=False, conf=0.3)
            boxes = results[0].boxes

            # Convert to simple format
            detections = []
            for box in boxes:
                x1, y1, x2, y2 = box.xyxy[0]
                conf = box.conf[0]
                cls_id = box.cls[0]
                detections.append([x1.item(), y1.item(), x2.item(), y2.item(), conf.item(), cls_id.item()])

            # Recognize play
            play_type, confidence = recognizer.get_play_type(detections, prev_detections)

            # Track play sequences
            if play_type and confidence > 0.5:
                if current_play is None or current_play['type'] != play_type:
                    # New play detected
                    if current_play:
                        current_play['end_frame'] = frame_num - 5
                        current_play['duration_sec'] = (current_play['end_frame'] - current_play['start_frame']) / fps
                        plays.append(current_play)

                    current_play = {
                        'type': play_type,
                        'start_frame': frame_num,
                        'confidence': confidence,
                        'timestamp_sec': frame_num / fps
                    }
            else:
                if current_play:
                    current_play['end_frame'] = frame_num - 5
                    current_play['duration_sec'] = (current_play['end_frame'] - current_play['start_frame']) / fps
                    plays.append(current_play)
                    current_play = None

            prev_detections = detections

        frame_num += 1

    cap.release()

    # Add final play if exists
    if current_play:
        current_play['end_frame'] = frame_num
        current_play['duration_sec'] = (frame_num - current_play['start_frame']) / fps
        plays.append(current_play)

    return plays
