# Volleyball AI Platform - Backend

FastAPI backend for uploading videos to Google Cloud Storage and processing with YOLO.

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Make sure credentials are set up:
```bash
# Verify the key file exists
ls ~/.volleyball-backend-key.json
```

3. Run the server:
```bash
uvicorn app.main:app --reload --port 8000
```

4. Test the API:
- Health check: `GET http://localhost:8000/health`
- Upload video: `POST http://localhost:8000/upload-video` (multipart form)
- Detect plays: `POST http://localhost:8000/detect?gcs_uri=gs://...`

## Endpoints

- `GET /health` - Server health check
- `POST /upload-video` - Upload video to GCS
- `POST /detect` - Run YOLO detection on a video

## Environment Variables

- `GOOGLE_APPLICATION_CREDENTIALS` - Path to GCS credentials (optional, uses ~/.volleyball-backend-key.json by default)
