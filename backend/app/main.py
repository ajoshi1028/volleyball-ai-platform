from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import tempfile
import sys
from pathlib import Path
from typing import Any

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from utils.gcs import upload_to_gcs
from utils.detection import detect_in_video

app = FastAPI(title="Volleyball AI Platform")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {"status": "ok"}


@app.post("/upload-video")
async def upload_video(file: UploadFile = File(...)):
    """
    Upload a video file to Google Cloud Storage.

    Args:
        file: Video file from user

    Returns:
        JSON with GCS URI and metadata
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    # Validate file type
    allowed_extensions = {".mp4", ".mov", ".avi", ".mkv"}
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Allowed: {allowed_extensions}",
        )

    try:
        # Save file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp:
            contents = await file.read()
            tmp.write(contents)
            tmp_path = tmp.name

        # Upload to GCS
        gcs_blob_name = f"raw-videos/{file.filename}"
        gcs_uri = upload_to_gcs(tmp_path, gcs_blob_name)

        # Clean up temp file
        os.unlink(tmp_path)

        return JSONResponse(
            status_code=200,
            content={
                "message": "Video uploaded successfully",
                "gcs_uri": gcs_uri,
                "filename": file.filename,
            },
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/detect")
async def detect_plays(gcs_uri: str):
    """
    Run YOLO detection on a video stored in GCS.

    Args:
        gcs_uri: GCS URI of the video to process

    Returns:
        Detection results with player counts and annotated video
    """
    try:
        results = detect_in_video(gcs_uri)
        return JSONResponse(
            status_code=200,
            content={
                "message": "Detection completed",
                "gcs_uri": gcs_uri,
                **results,
            },
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# In-memory results store  { video_id: { "detections": ..., "plays": ... } }
# ---------------------------------------------------------------------------
results_store: dict[str, dict[str, Any]] = {}


class DetectionResult(BaseModel):
    video_id: str
    gcs_uri: str
    fps: float = 30.0
    frame_count: int = 0
    detections: list[dict[str, Any]] = []


@app.post("/store-results")
async def store_results(detection: DetectionResult):
    plays = recognize_plays(detection.detections, detection.fps)
    results_store[detection.video_id] = {
        "detections": detection.model_dump(),
        "plays": plays,
    }
    return {
        "message": "Results stored and plays recognized",
        "video_id": detection.video_id,
        "play_summary": {p["play"]: 1 for p in plays.get("plays", [])},
    }


@app.get("/results/{video_id}")
async def get_results(video_id: str):
    if video_id not in results_store:
        raise HTTPException(status_code=404, detail="Results not found")
    return results_store[video_id]


@app.get("/results")
async def list_results():
    return {
        "processed_videos": [
            {"video_id": vid, "play_summary": data.get("plays", {}).get("summary", {})}
            for vid, data in results_store.items()
        ]
    }


# ---------------------------------------------------------------------------
# Josh's endpoints — results storage + play recognition
# ---------------------------------------------------------------------------

class DetectionResult(BaseModel):
    """
    Schema for YOLO detection output. Yoshi posts to /store-results with this shape.

    Fields:
        video_id:    Unique ID for the video (e.g. filename without extension)
        gcs_uri:     GCS URI of the processed video
        fps:         Frames per second of the video
        frame_count: Total number of frames
        detections:  Per-frame list of detected objects
    """
    video_id: str
    gcs_uri: str
    fps: float = 30.0
    frame_count: int = 0
    detections: list[dict[str, Any]] = []


@app.post("/store-results")
async def store_results(detection: DetectionResult):
    """
    Store YOLO detection results and run play recognition.

    Called by Yoshi's /detect step after YOLOv8 finishes processing.
    Runs play recognition automatically and saves everything in memory.

    Returns:
        Stored video_id + play recognition summary
    """
    detection_dict = detection.dict()

    # Run play recognition on the detection data
    play_result = recognize_plays(detection_dict)

    # Save both raw detections and play recognition output
    results_store[detection.video_id] = {
        "detections": detection_dict,
        "plays": play_result,
    }

    return JSONResponse(
        status_code=200,
        content={
            "message": "Results stored and plays recognized",
            "video_id": detection.video_id,
            "play_summary": play_result["summary"],
        },
    )


@app.get("/results/{video_id}")
async def get_results(video_id: str):
    """
    Fetch stored detection results and play recognition for a video.

    Args:
        video_id: The video ID used when results were stored

    Returns:
        Full detection data + play recognition output (segments + summary)
    """
    if video_id not in results_store:
        raise HTTPException(
            status_code=404,
            detail=f"No results found for video_id '{video_id}'. Has this video been processed?",
        )

    return JSONResponse(
        status_code=200,
        content=results_store[video_id],
    )


@app.get("/results")
async def list_results():
    """
    List all video IDs that have stored results.

    Returns:
        List of processed video IDs with their play summaries
    """
    return JSONResponse(
        status_code=200,
        content={
            "processed_videos": [
                {
                    "video_id": vid,
                    "play_summary": data["plays"]["summary"],
                }
                for vid, data in results_store.items()
            ]
        },
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
