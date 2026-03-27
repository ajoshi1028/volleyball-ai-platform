'use client'

import { useRef, useState, useEffect } from 'react'
import Nav from './components/Nav'
import FilmLibrary from './components/FilmLibrary'
import VideoPlayer from './components/VideoPlayer'
import PlayerTrackingPanel from './components/PlayerTrackingPanel'
import PlayTimeline from './components/PlayTimeline'

const STORAGE_KEY = 'volleyball-films'
const API_BASE = 'http://localhost:8000'

function loadFilms() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

function saveFilms(films) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(films))
}

export default function Home() {
  const playerRef = useRef(null)

  const [screen, setScreen] = useState('library')
  const [films, setFilms] = useState([])
  const [localUrls] = useState(() => new Map())

  const [activeFilm, setActiveFilm] = useState(null)
  const [localVideoUrl, setLocalVideoUrl] = useState('')
  const [detectionFrames, setDetectionFrames] = useState([])
  const [plays, setPlays] = useState([])
  const [currentTime, setCurrentTime] = useState(0)
  const [videoDuration, setVideoDuration] = useState(0)
  const [analyzing, setAnalyzing] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')  // '', 'uploading', 'detecting', 'done', 'error'
  const [detectionStats, setDetectionStats] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    setFilms(loadFilms())
  }, [])

  const currentPlayers = detectionFrames.find(
    (f) => Math.abs(f.timestamp - currentTime) < 0.1
  )?.players ?? []

  // Save duration + thumbnail back to the film record once we have them
  useEffect(() => {
    if (!activeFilm || !videoDuration) return
    setFilms((prev) => {
      const updated = prev.map((f) =>
        f.id === activeFilm.id ? { ...f, duration: videoDuration } : f
      )
      saveFilms(updated)
      return updated
    })
  }, [videoDuration, activeFilm])

  function handleThumbnail(dataUrl) {
    if (!activeFilm) return
    setFilms((prev) => {
      const updated = prev.map((f) =>
        f.id === activeFilm.id ? { ...f, thumbnail: dataUrl } : f
      )
      saveFilms(updated)
      return updated
    })
  }

  // ─── Upload + Detect pipeline ────────────────────────────────────
  async function handleNewUploadFile(file) {
    const localUrl = URL.createObjectURL(file)
    const filename = file.name

    // Create film record IMMEDIATELY so user sees something
    const film = {
      id: crypto.randomUUID(),
      filename,
      gcs_uri: '',  // Will be filled after upload
      uploadedAt: new Date().toISOString(),
    }
    localUrls.set(film.id, localUrl)
    setFilms((prev) => {
      const updated = [film, ...prev]
      saveFilms(updated)
      return updated
    })

    // Switch to review screen RIGHT AWAY — show the video immediately
    setActiveFilm(film)
    setLocalVideoUrl(localUrl)
    setDetectionFrames([])
    setPlays([])
    setCurrentTime(0)
    setVideoDuration(0)
    setAnalyzing(true)
    setDetectionStats(null)
    setErrorMsg('')
    setUploadProgress('uploading')
    setScreen('review')

    // Now upload to GCS in the background
    const form = new FormData()
    form.append('file', file)

    try {
      const uploadRes = await fetch(`${API_BASE}/upload-video`, {
        method: 'POST',
        body: form,
      })
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}))
        throw new Error(err.detail || `Upload failed: ${uploadRes.status}`)
      }
      const uploadData = await uploadRes.json()

      // Update film with GCS URI
      film.gcs_uri = uploadData.gcs_uri
      setActiveFilm({ ...film })
      setFilms((prev) => {
        const updated = prev.map((f) => f.id === film.id ? { ...film } : f)
        saveFilms(updated)
        return updated
      })

      // Now run detection
      await runDetection(film)
    } catch (err) {
      console.error('Upload error:', err)
      setErrorMsg(`Upload failed: ${err.message}`)
      setUploadProgress('error')
      setAnalyzing(false)
    }
  }

  async function runDetection(film) {
    if (!film.gcs_uri) {
      // No GCS URI — can't run detection
      setUploadProgress('done')
      setAnalyzing(false)
      setDetectionStats({ error: 'Video not uploaded to cloud. Detection requires GCS upload.' })
      return
    }

    // Step 2: Run detection
    setUploadProgress('detecting')
    try {
      const res = await fetch(`${API_BASE}/detect?gcs_uri=${encodeURIComponent(film.gcs_uri)}`, {
        method: 'POST',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `Detection failed: ${res.status}`)
      }

      const data = await res.json()
      console.log('Detection response:', data)

      // Save detection stats for display
      setDetectionStats({
        totalFrames: data.total_frames,
        fps: data.fps,
        resolution: data.resolution,
        framesWithDetections: data.frames_with_detections,
        maxPeopleInFrame: data.max_people_in_frame,
        avgPeoplePerFrame: data.avg_people_per_detection_frame,
        totalDetections: data.total_detections,
        framesWithBall: data.frames_with_ball,
        ballDetectionRate: data.ball_detection_rate,
        processedFrames: data.processed_frames,
        annotatedVideoUri: data.annotated_video_uri,
        playSummary: data.play_summary || {},
      })

      // Extract plays with timestamps from play_recognition
      const playRecognition = data.play_recognition || {}
      const playSegments = playRecognition.plays || []

      const playsForTimeline = playSegments.map((seg, idx) => ({
        id: `${seg.play}-${idx}`,
        label: seg.play.charAt(0).toUpperCase() + seg.play.slice(1),
        timestamp: seg.start_time_sec,
        start_time_sec: seg.start_time_sec,
        end_time_sec: seg.end_time_sec,
      }))

      console.log('Play segments:', playsForTimeline)
      setPlays(playsForTimeline)

      // Store results in backend for search
      await fetch(`${API_BASE}/store-results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_id: film.id,
          gcs_uri: film.gcs_uri,
          fps: data.fps || 30,
          frame_count: data.total_frames || 0,
          detections: [],
        }),
      }).catch(() => {}) // non-critical

      setUploadProgress('done')
    } catch (err) {
      console.error('Detection error:', err)
      setErrorMsg(`Detection failed: ${err.message}`)
      setUploadProgress('error')
      setDetectionStats({ error: err.message })
    } finally {
      setAnalyzing(false)
    }
  }

  function openReview(film, localUrl) {
    setActiveFilm(film)
    setLocalVideoUrl(localUrl)
    setDetectionFrames([])
    setPlays([])
    setCurrentTime(0)
    setVideoDuration(0)
    setAnalyzing(true)
    setDetectionStats(null)
    setErrorMsg('')
    setScreen('review')
    runDetection(film)
  }

  function handleSeek(time) {
    playerRef.current?.seek(time)
  }

  function goToLibrary() {
    setScreen('library')
    setActiveFilm(null)
    setUploadProgress('')
    setDetectionStats(null)
    setErrorMsg('')
  }

  // ─── Library screen ──────────────────────────────────────────────
  if (screen === 'library') {
    return (
      <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--ppu-navy)' }}>
        <Nav onBackToLibrary={goToLibrary} />
        <FilmLibrary
          films={films}
          localUrls={localUrls}
          onOpen={(film, url) => openReview(film, url)}
          onReupload={(film, url) => {
            localUrls.set(film.id, url)
            openReview(film, url)
          }}
          onNewUpload={handleNewUploadFile}
        />
      </div>
    )
  }

  // ─── Review screen ───────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--ppu-navy)' }}>
      <Nav currentFilm={activeFilm?.filename} onBackToLibrary={goToLibrary} />

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Video + Timeline + Stats */}
        <div className="flex flex-col flex-1 overflow-hidden">

          {/* Video player */}
          <div className="flex-1 overflow-hidden">
            <VideoPlayer
              ref={playerRef}
              src={localVideoUrl}
              detections={detectionFrames}
              analyzing={analyzing}
              onTimeUpdate={setCurrentTime}
              onDurationChange={setVideoDuration}
              onThumbnail={handleThumbnail}
            />
          </div>

          {/* Play timeline */}
          <PlayTimeline
            plays={plays}
            duration={videoDuration}
            analyzing={analyzing}
            onSeek={handleSeek}
          />

          {/* Detection stats bar */}
          {detectionStats && !detectionStats.error && (
            <div
              className="border-t px-4 py-3 overflow-x-auto"
              style={{ background: 'var(--ppu-panel)', borderColor: 'var(--ppu-border)' }}
            >
              <div className="flex gap-6 text-xs">
                <StatItem label="Players Detected" value={detectionStats.totalDetections} />
                <StatItem label="Max in Frame" value={detectionStats.maxPeopleInFrame} />
                <StatItem label="Avg per Frame" value={detectionStats.avgPeoplePerFrame} />
                <StatItem label="Ball Detection" value={`${detectionStats.ballDetectionRate}%`} />
                <StatItem label="Frames Analyzed" value={detectionStats.processedFrames} />
                <StatItem label="Resolution" value={detectionStats.resolution} />
                {Object.entries(detectionStats.playSummary || {}).map(([play, count]) => (
                  <StatItem
                    key={play}
                    label={play.charAt(0).toUpperCase() + play.slice(1) + 's'}
                    value={count}
                    highlight
                  />
                ))}
              </div>
            </div>
          )}

          {/* Upload/Detection progress or error */}
          {(uploadProgress === 'uploading' || uploadProgress === 'detecting') && (
            <div
              className="border-t px-4 py-2.5 flex items-center gap-3"
              style={{ background: 'var(--ppu-panel)', borderColor: 'var(--ppu-border)' }}
            >
              <div
                className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: 'var(--ppu-orange)', borderTopColor: 'transparent' }}
              />
              <span className="text-xs" style={{ color: 'var(--ppu-orange)' }}>
                {uploadProgress === 'uploading'
                  ? 'Uploading video to cloud storage...'
                  : 'Running AI detection (this may take a minute)...'}
              </span>
            </div>
          )}

          {errorMsg && (
            <div
              className="border-t px-4 py-2.5 flex items-center gap-2"
              style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)' }}
            >
              <span className="text-xs text-red-400">{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Right: Player tracking panel */}
        <div className="w-64 shrink-0">
          <PlayerTrackingPanel
            players={currentPlayers}
            currentTime={currentTime}
            analyzing={analyzing}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Stat display component ──────────────────────────────────────
function StatItem({ label, value, highlight }) {
  return (
    <div className="flex flex-col gap-0.5 shrink-0">
      <span className="text-slate-500 whitespace-nowrap">{label}</span>
      <span
        className="font-semibold tabular-nums"
        style={{ color: highlight ? 'var(--ppu-orange)' : '#e2e8f0' }}
      >
        {value}
      </span>
    </div>
  )
}
