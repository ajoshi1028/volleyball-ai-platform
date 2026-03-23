from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
import os
import tempfile
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from utils.gcs import upload_to_gcs

app = FastAPI(title="Volleyball AI Platform")


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
    Placeholder for YOLO detection endpoint.

    Args:
        gcs_uri: GCS URI of the video to process

    Returns:
        Detection results (coordinates, play types, etc.)
    """
    return {
        "message": "Detection endpoint - coming soon",
        "gcs_uri": gcs_uri,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
