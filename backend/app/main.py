from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import os
import tempfile
import sys
from pathlib import Path

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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
