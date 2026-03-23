# Claude Code Guide — Volleyball AI Platform

## Project Overview
AI-powered platform to analyze volleyball practice videos using YOLO detection and play recognition.

**Stack:** FastAPI (Python) + Next.js (React) + YOLO + Google Cloud Storage

## How Claude Should Approach Tasks

### Backend (Python/FastAPI)
- Location: `/backend`
- Virtual environment: `venv/` (Python 3.12)
- Always activate venv before running: `source venv/bin/activate`
- Dependencies in: `requirements.txt`
- Use `pip` for package management
- Run server: `uvicorn app.main:app --port 8000`
- Never commit: `volleyball-backend-key.json`, venv, `__pycache__/`

### Frontend (Next.js)
- Location: `/frontend` (not yet created)
- Use Node.js 18+
- Dependencies: `npm install`
- Run dev: `npm run dev`
- Never commit: `node_modules/`, `.next/`, `.env.local`

### Google Cloud Storage
- Bucket: `pepperdine-volleyball-2026`
- Credentials: `~/.volleyball-backend-key.json` (shared via Google Drive, not git)
- Backend integration: `backend/utils/gcs.py`
- For uploads: use `upload_to_gcs(local_path, gcs_blob_name)`

## Development Workflow

### When Adding Features
1. **Clarify the requirement** — Ask what the feature should do
2. **Check existing code** — Don't duplicate, reuse when possible
3. **Test locally** — Backend on 8000, frontend on 3000
4. **Keep it simple** — No over-engineering for hackathons

### When Debugging
1. Start with server logs (terminal output)
2. Check `requirements.txt` versions match installed packages
3. Verify GCS credentials are accessible
4. Use `curl` to test API endpoints

### Git Practices
- Commit frequently with clear messages
- Never commit secrets (keys, tokens, env files)
- Keep commits focused on one feature
- Push to main branch (this is a hackathon, not production)

## Key Files & Their Purpose

```
backend/
├── app/main.py          # FastAPI routes, endpoints
├── utils/gcs.py         # Google Cloud Storage helpers
├── models/              # YOLO models (coming soon)
├── requirements.txt     # Python dependencies
└── venv/                # Virtual environment

frontend/
├── pages/               # Next.js pages
├── components/          # React components
└── package.json         # Node dependencies
```

## API Endpoints

### Current
- `GET /health` — Health check, returns `{"status":"ok"}`
- `POST /upload-video` — Upload video to GCS, returns `{gcs_uri, filename}`

### Coming Soon
- `POST /detect` — Run YOLO on video, returns detected players/ball
- `GET /results/{video_id}` — Fetch detection results

## Common Tasks

### Running the Backend
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --port 8000
```

### Testing an Endpoint
```bash
# Health check
curl http://localhost:8000/health

# Upload video (example)
curl -X POST -F "file=@video.mp4" http://localhost:8000/upload-video
```

### Installing New Package
```bash
cd backend
source venv/bin/activate
pip install package-name
pip freeze > requirements.txt  # Update requirements
```

### Debugging GCS Issues
```bash
# Check credentials exist
ls ~/.volleyball-backend-key.json

# Check it's valid JSON
python -m json.tool ~/.volleyball-backend-key.json
```

## What NOT to Do
- ❌ Commit `volleyball-backend-key.json`
- ❌ Store videos in the repo (use GCS)
- ❌ Commit `node_modules/` or `venv/`
- ❌ Use hardcoded paths (use relative imports)
- ❌ Add features the team didn't ask for (stay focused)

## Preferences
- Code style: Follow existing patterns in the codebase
- Error handling: Validate at API boundaries (user input, external APIs)
- Comments: Only where logic isn't self-evident
- Type hints: Use for function signatures (FastAPI benefits from them)

## How to Ask for Help
- "Can Claude help with X?" — Yes, describe what you need
- If Claude suggests something unclear, ask to explain it
- If code fails, share the full error message
- Always test locally before committing

## Team

| Person | Track | Responsibilities |
|--------|-------|-----------------|
| **Kyle** | Frontend | Upload UI, results display, connecting frontend to backend API |
| **Yoshi** | YOLO Detection | `/detect` endpoint, running YOLOv8 on videos, returning bounding boxes |
| **Josh** | Data + Play Recognition | `GET /results/{video_id}`, storing detection output, play recognition logic |

**Integration point:** Yoshi and Josh should agree on a JSON schema for detection results before splitting off. Kyle can build against mock data until the backend is ready.

## Hackathon Strategy
**Priority order:**
1. Get basic upload working ✅
2. Build frontend upload UI
3. Integrate YOLO detection
4. Add play recognition
5. Improve UI/UX
6. Optimize performance

**Keep scope tight** — 2-3 polished features beat 5 half-baked ones.
