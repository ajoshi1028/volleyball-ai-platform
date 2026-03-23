# Volleyball AI Platform

AI-powered system to analyze volleyball practice footage.

## Features
- Ball tracking
- Play detection
- Trajectory visualization

## Tech Stack
- FastAPI
- Next.js
- YOLO (Computer Vision)

## Setup

### Prerequisites
- Python 3.12+
- Node.js 18+
- Google Cloud account with GCS bucket configured

### Backend Setup (FastAPI)

1. **Clone the repo**
   ```bash
   git clone https://github.com/YOUR_USERNAME/volleyball-ai-platform.git
   cd volleyball-ai-platform/backend
   ```

2. **Create virtual environment**
   ```bash
   python3.12 -m venv venv
   source venv/bin/activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Set up GCS credentials**
   Ask your team lead for `volleyball-backend-key.json` and save it to:
   ```bash
   ~/.volleyball-backend-key.json
   ```

5. **Run the server**
   ```bash
   uvicorn app.main:app --port 8000
   ```

   Server runs on: `http://localhost:8000`

6. **Test it**
   ```bash
   curl http://localhost:8000/health
   # Expected: {"status":"ok"}
   ```

### Frontend Setup (Next.js)
Coming soon...

### Environment Variables

Create a `.env.local` file in the backend directory:
```
GOOGLE_CLOUD_PROJECT=volleyball-ai-platform
GCS_BUCKET=pepperdine-volleyball-2026
```

## API Endpoints

- `GET /health` — Health check
- `POST /upload-video` — Upload video to GCS (multipart form)
- `POST /detect` — Run YOLO detection on a video (coming soon)

## Troubleshooting

**Port 8000 already in use?**
```bash
lsof -ti:8000 | xargs kill -9
```

**Module not found errors?**
- Make sure you're in the backend directory
- Make sure venv is activated: `source venv/bin/activate`
- Reinstall: `pip install -r requirements.txt`

**GCS credential errors?**
- Verify file exists: `ls ~/.volleyball-backend-key.json`
- Check it's readable: `cat ~/.volleyball-backend-key.json | head -5`

## Project Structure

```
volleyball-ai-platform/
├── backend/
│   ├── app/
│   │   └── main.py          # FastAPI routes
│   ├── utils/
│   │   └── gcs.py           # GCS upload/download
│   ├── models/              # ML model files (coming soon)
│   ├── requirements.txt
│   └── venv/
├── frontend/                 # Next.js app (coming soon)
├── data/                     # Sample videos (in .gitignore)
└── README.md
```

## Next Steps

1. **Frontend** — Build Next.js UI for uploading videos
2. **Detection** — Integrate YOLOv8 for player/ball tracking
3. **Play Recognition** — Classify plays (dig, set, spike, etc.)
4. **Visualization** — Render ball trajectories on video


# Download the file from Google Drive
# Then save it to home directory:
mv ~/Downloads/volleyball-backend-key.json ~/.volleyball-backend-key.json

# Verify:
ls ~/.volleyball-backend-key.json
