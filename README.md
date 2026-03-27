# 🏐 Volleyball AI Platform

An AI-powered platform for analyzing volleyball practice videos. Automatically detects players and the ball using a custom-trained YOLOv8 model, recognizes play types (serves, blocks, sets, attacks, digs), and provides search capabilities to find specific plays across multiple videos.

**Built for:** Pepperdine × StatsPerform AI Hackathon 2026

## ✨ Features

- **Player Detection** — Detects all players on court with bounding boxes
- **Ball Detection** — Custom-trained model to detect volleyballs in practice footage
- **Play Recognition** — Automatically classifies plays: serves, blocks, sets, attacks, digs
- **Video Management** — Upload and organize practice videos with local storage
- **Search & Filter** — Find specific plays across multiple videos
- **Mock Data** — Toggle to see demo data while testing

## 🏗️ Architecture

```
Volleyball AI Platform
├── Backend (FastAPI)
│   ├── /upload-video    → Upload to Google Cloud Storage
│   ├── /detect          → Run YOLO detection on video
│   ├── /store-results   → Save detection & play recognition
│   ├── /results         → Retrieve stored results
│   ├── /search          → Search for plays by type
│   └── /trajectory      → Get ball trajectory data
│
└── Frontend (Next.js 14 + React)
    ├── Film Library     → Browse uploaded videos
    ├── Video Uploader   → Drag-and-drop upload
    ├── Video Player     → Watch with detection overlay
    ├── Play Timeline    → Visualize detected plays
    └── Player Panel     → Track individual players
```

## 🛠️ Tech Stack

**Backend:**
- FastAPI (Python web framework)
- YOLOv8 (Computer vision - custom trained on volleyball footage)
- Google Cloud Storage (video management)
- OpenCV (video processing)

**Frontend:**
- Next.js 14 (React framework)
- TypeScript
- Tailwind CSS (styling)
- Custom-trained model: YOLOv8m fine-tuned on 110 annotated volleyball frames

## 📋 Prerequisites

- **Python:** 3.12+
- **Node.js:** 18+
- **Google Cloud:** Project with GCS bucket configured
- **Service Account:** JSON key file for authentication

## 🚀 Quick Start

### 1. Clone & Setup

```bash
git clone https://github.com/YOUR_USERNAME/volleyball-ai-platform.git
cd volleyball-ai-platform
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment (Python 3.12)
python3.12 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Set up Google Cloud credentials
# Place your service account JSON key at: ~/.volleyball-backend-key.json
export GOOGLE_APPLICATION_CREDENTIALS=~/.volleyball-backend-key.json

# Start the server
uvicorn app.main:app --reload --port 8000
```

**Backend runs on:** `http://localhost:8000`

Test it:
```bash
curl http://localhost:8000/health
# Expected: {"status":"ok"}
```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

**Frontend runs on:** `http://localhost:3000`

## 📡 API Endpoints

### Health Check
```bash
GET /health
```
Returns: `{"status":"ok"}`

### Upload Video
```bash
POST /upload-video
Content-Type: multipart/form-data

# Returns: { gcs_uri, filename }
```

### Run Detection
```bash
POST /detect?gcs_uri=gs://bucket/path/to/video.mp4

# Returns: { detection statistics, plays dict, annotated_video_uri }
```

### Store Results
```bash
POST /store-results
Content-Type: application/json

{
  "video_id": "video_123",
  "gcs_uri": "gs://bucket/path/video.mp4",
  "fps": 30,
  "frame_count": 900,
  "detections": [...]
}

# Returns: { video_id, play_summary }
```

### Search Plays
```bash
GET /search?play_type=serve&video_id=video_123

# Returns: { query, results[], total_matches }
```

### Get Results
```bash
GET /results/{video_id}

# Returns: { detections, plays }
```

### List Videos
```bash
GET /results

# Returns: { processed_videos[] }
```

## 🎮 How to Use the Frontend

1. **Open** `http://localhost:3000`
2. **Upload** a volleyball video (drag-and-drop or click upload button)
3. **View** the detection results with player counts and play recognition
4. **Toggle Mock Data** to see demo data for testing
5. **Search** for specific play types across your videos
6. **Review** detections on the video player

## 📦 Project Structure

```
volleyball-ai-platform/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   └── main.py              # FastAPI routes
│   ├── utils/
│   │   ├── __init__.py
│   │   ├── gcs.py               # Google Cloud Storage utilities
│   │   ├── detection.py         # YOLO detection pipeline
│   │   └── play_recognition.py  # Play classification logic
│   ├── requirements.txt
│   └── venv/                    # Python virtual environment
│
├── frontend/
│   ├── app/
│   │   ├── components/          # React components
│   │   ├── page.js              # Main page component
│   │   ├── layout.tsx           # Root layout
│   │   ├── globals.css          # Global styles
│   │   └── types.ts             # TypeScript types
│   ├── public/
│   ├── package.json
│   ├── tailwind.config.js       # Tailwind CSS config
│   ├── postcss.config.js        # PostCSS config
│   └── next.config.js           # Next.js config
│
├── README.md                    # This file
└── .gitignore
```

## 🔧 Troubleshooting

### Backend Won't Start

**Port 8000 already in use:**
```bash
lsof -ti:8000 | xargs kill -9
```

**ModuleNotFoundError:**
- Verify you're in the backend directory
- Activate venv: `source venv/bin/activate`
- Reinstall: `pip install -r requirements.txt`

**GCS Credential Errors:**
- Verify file: `ls ~/.volleyball-backend-key.json`
- Check readable: `cat ~/.volleyball-backend-key.json | head -5`

### Frontend Won't Start

**Port 3000 in use:**
```bash
lsof -ti:3000 | xargs kill -9
```

**Module not found:**
- Delete node_modules: `rm -rf node_modules`
- Reinstall: `npm install`
- Clear cache: `rm -rf .next`

**Tailwind CSS errors:**
- Install @tailwindcss/postcss: `npm install -D @tailwindcss/postcss`
- Clear cache: `rm -rf .next && npm run dev`

## 📊 Model Details

**YOLOv8m (Medium)**
- **Training Data:** 110 annotated volleyball frames
- **Classes:**
  - Class 0: Ball
  - Class 1: Player
- **Accuracy:** ~80% ball detection, 95%+ player detection
- **Speed:** ~50ms per frame on CPU

## 🎯 Detection Performance

- Ball Detection Rate: 80%+ (varies by video quality)
- Player Detection: 95%+
- Play Recognition: Serve, Block, Set, Attack, Dig
- Processing Speed: ~5x faster than realtime (on modern hardware)

## 🚀 Deployment

### Running in Production

```bash
# Backend
gunicorn -w 4 -k uvicorn.workers.UvicornWorker app.main:app --bind 0.0.0.0:8000

# Frontend
npm run build
npm run start
```

### Docker (Coming Soon)

```bash
docker build -t volleyball-ai-backend ./backend
docker build -t volleyball-ai-frontend ./frontend
docker-compose up
```

## 📝 License

Created for Pepperdine × StatsPerform AI Hackathon 2026

## 🤝 Contributors

- Yoshi (Backend, Detection, Play Recognition)
- Kyle (Frontend, UI/UX)
- Josh (Integration, Testing)

---

**Questions?** Check the API documentation or run with `--help` flag.
