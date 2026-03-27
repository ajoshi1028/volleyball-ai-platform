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
from utils.play_recognition import recognize_plays

app = FastAPI(title="Volleyball AI Platform")

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

    allowed_extensions = {".mp4", ".mov", ".avi", ".mkv"}
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Allowed: {allowed_extensions}",
        )

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp:
            contents = await file.read()
            tmp.write(contents)
            tmp_path = tmp.name

        gcs_blob_name = f"raw-videos/{file.filename}"
        gcs_uri = upload_to_gcs(tmp_path, gcs_blob_name)

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
    Play recognition runs automatically inside detection.
    Returns detection stats + play_recognition with timestamps.
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
    """
    Schema for YOLO detection output. Posted to /store-results.

    Fields:
        video_id:    Unique ID for the video (e.g. filename)
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

    Called after /detect finishes. Runs recognize_plays and saves to memory.
    """
    detection_dict = detection.model_dump()

    play_result = recognize_plays(detection_dict)

    results_store[detection.video_id] = {
        "detections": detection_dict,
        "plays": play_result,
    }

    return JSONResponse(
        status_code=200,
        content={
            "message": "Results stored and plays recognized",
            "video_id": detection.video_id,
            "play_summary": play_result.get("summary", {}),
        },
    )


@app.get("/results/{video_id}")
async def get_results(video_id: str):
    """Fetch stored detection results and play recognition for a video."""
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
    """List all video IDs that have stored results."""
    return JSONResponse(
        status_code=200,
        content={
            "processed_videos": [
                {
                    "video_id": vid,
                    "play_summary": data["plays"].get("summary", {}),
                }
                for vid, data in results_store.items()
            ]
        },
    )


@app.get("/search")
async def search_plays(
    play_type: str = None,
    video_id: str = None,
    confidence_threshold: float = 0.5
):
    """
    Search for plays across videos with optional filters.

    Args:
        play_type: Type of play to search for (e.g., "serve", "block", "set", "attack", "dig")
        video_id: Optional filter to search within a specific video
        confidence_threshold: Minimum confidence score (0-1)
    """
    results = []

    for vid, data in results_store.items():
        if video_id and vid != video_id:
            continue

        plays_summary = data.get("plays", {}).get("summary", {})

        if play_type:
            if play_type in plays_summary:
                results.append({
                    "video_id": vid,
                    "play_type": play_type,
                    "count": plays_summary[play_type],
                    "gcs_uri": data.get("detections", {}).get("gcs_uri", ""),
                })
        else:
            for ptype, count in plays_summary.items():
                results.append({
                    "video_id": vid,
                    "play_type": ptype,
                    "count": count,
                    "gcs_uri": data.get("detections", {}).get("gcs_uri", ""),
                })

    return JSONResponse(
        status_code=200,
        content={
            "query": {"play_type": play_type, "video_id": video_id},
            "results": results,
            "total_matches": len(results),
        },
    )


@app.post("/trajectory")
async def get_trajectory(video_id: str, play_type: str = None):
    """Get ball trajectory data for a video or specific play."""
    if video_id not in results_store:
        raise HTTPException(status_code=404, detail="Video not found")

    data = results_store[video_id]
    detections = data.get("detections", {})

    return JSONResponse(
        status_code=200,
        content={
            "video_id": video_id,
            "play_type": play_type,
            "ball_trajectory": [],
            "frame_rate": detections.get("fps", 30),
        },
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
