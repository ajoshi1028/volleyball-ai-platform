# Volleyball AI Platform — Frontend

Next.js frontend for uploading volleyball practice videos and viewing detection results.

## Quick Start

1. **Install Node.js** (if not already installed)
   ```bash
   brew install node
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Make sure backend is running**
   ```bash
   # In another terminal
   cd ../backend
   source venv/bin/activate
   uvicorn app.main:app --port 8000
   ```

4. **Run the frontend**
   ```bash
   npm run dev
   ```

5. **Open in browser**
   ```
   http://localhost:3000
   ```

## Features

- ✅ Upload videos to GCS
- ✅ Track upload progress
- ✅ Display uploaded videos
- 🔄 Detection results (coming soon)

## Structure

```
frontend/
├── app/
│   ├── layout.js       # Main layout
│   ├── page.js         # Home page
│   ├── globals.css     # Global styles
│   └── page.css        # Page styles
├── components/
│   ├── UploadForm.js   # Upload form component
│   ├── UploadForm.css  # Form styles
│   ├── VideoResults.js # Results display
│   └── VideoResults.css# Results styles
├── package.json
└── README.md
```

## API Connection

The frontend connects to the backend on `http://localhost:8000`.

If the backend is on a different URL, update the `API_URL` in `components/UploadForm.js`.

## Build for Production

```bash
npm run build
npm start
```
