'use client'

import { useRef, useState, useEffect } from 'react'
import Nav from './components/Nav'
import FilmLibrary from './components/FilmLibrary'
import VideoUploader from './components/VideoUploader'
import VideoPlayer from './components/VideoPlayer'
import PlayerTrackingPanel from './components/PlayerTrackingPanel'
import PlayTimeline from './components/PlayTimeline'

const STORAGE_KEY = 'volleyball-films'
const API_BASE = 'http://localhost:8000'

const MOCK_PLAYS = [
  { id: '1', label: 'Serve', timestamp: 4 },
  { id: '2', label: 'Dig', timestamp: 11 },
  { id: '3', label: 'Set', timestamp: 18 },
  { id: '4', label: 'Spike', timestamp: 24 },
  { id: '5', label: 'Block', timestamp: 31 },
]

const MOCK_PLAYERS = [
  { id: 'p1', jersey: 3, position: 'OH', x: 0.24, y: 0.61 },
  { id: 'p2', jersey: 7, position: 'S', x: 0.51, y: 0.55 },
  { id: 'p3', jersey: 11, position: 'MB', x: 0.38, y: 0.48 },
  { id: 'p4', jersey: 14, position: 'L', x: 0.67, y: 0.72 },
  { id: 'p5', jersey: 2, position: 'OH', x: 0.19, y: 0.43 },
  { id: 'p6', jersey: 9, position: 'RS', x: 0.79, y: 0.51 },
]

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
  const [mockMode, setMockMode] = useState(false)

  useEffect(() => {
    setFilms(loadFilms())
  }, [])

  const currentPlayers = mockMode
    ? MOCK_PLAYERS
    : detectionFrames.find((f) => Math.abs(f.timestamp - currentTime) < 0.1)?.players ?? []

  const activePlays = mockMode ? MOCK_PLAYS : plays

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

  async function runDetection(film) {
    if (!film.gcs_uri) {
      // No GCS URI (file was just uploaded locally), use mock data
      setTimeout(() => setAnalyzing(false), 1500)
      setPlays(MOCK_PLAYS)
      return
    }

    try {
      // Call backend detection endpoint
      const detailsRes = await fetch(`${API_BASE}/detect?gcs_uri=${encodeURIComponent(film.gcs_uri)}`)
      if (!detailsRes.ok) throw new Error('Detection failed')

      const detectionData = await detailsRes.json()
      console.log('Detection response:', detectionData)

      // Extract plays from detection results
      // Backend returns plays as: { video_id, fps, plays: [...segments], summary: {...} }
      const playsData = detectionData.plays || {}
      const playsArray = playsData.plays || []

      const playsFromBackend = playsArray.map((play, idx) => ({
        id: `${play.play}-${idx}`,
        label: play.play ? play.play.charAt(0).toUpperCase() + play.play.slice(1) : 'Unknown',
        timestamp: play.start_time_sec || 0,
        start_time_sec: play.start_time_sec,
        end_time_sec: play.end_time_sec,
      }))

      console.log('Extracted plays:', playsFromBackend)
      setPlays(playsFromBackend)

      // Store results in backend
      await fetch(`${API_BASE}/store-results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_id: film.id,
          gcs_uri: film.gcs_uri,
          fps: detectionData.fps || 30,
          frame_count: detectionData.total_frames || 0,
          detections: [],
        }),
      })
    } catch (err) {
      console.error('Detection error:', err)
      setPlays(MOCK_PLAYS)
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
    setMockMode(false)
    setAnalyzing(true)
    setScreen('review')

    // Run detection on the video
    runDetection(film)
  }

  async function handleUploadComplete(result, localUrl) {
    const film = {
      id: crypto.randomUUID(),
      filename: result.filename,
      gcs_uri: result.gcs_uri,
      uploadedAt: new Date().toISOString(),
    }
    localUrls.set(film.id, localUrl)
    setFilms((prev) => {
      const updated = [film, ...prev]
      saveFilms(updated)
      return updated
    })
    openReview(film, localUrl)
  }

  async function handleNewUploadFile(file) {
    // Upload to GCS first
    const localUrl = URL.createObjectURL(file)
    const form = new FormData()
    form.append('file', file)

    try {
      const res = await fetch(`${API_BASE}/upload-video`, { method: 'POST', body: form })
      if (!res.ok) throw new Error('Upload failed')
      const result = await res.json()
      handleUploadComplete(result, localUrl)
    } catch (err) {
      console.error('Upload error:', err)
      alert('Failed to upload video. Please try again.')
    }
  }

  function handleSeek(time) {
    playerRef.current?.seek(time)
  }

  function goToLibrary() {
    setScreen('library')
    setActiveFilm(null)
  }

  const mockToggle = (
    <button
      onClick={() => setMockMode((p) => !p)}
      className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all"
      style={
        mockMode
          ? { background: 'var(--ppu-orange-dim)', color: 'var(--ppu-orange)', borderColor: 'rgba(255,99,0,0.4)' }
          : { background: 'transparent', color: '#64748b', borderColor: 'var(--ppu-border)' }
      }
    >
      <span className={`w-1.5 h-1.5 rounded-full ${mockMode ? 'bg-orange-500' : 'bg-slate-600'}`} />
      Mock data {mockMode ? 'on' : 'off'}
    </button>
  )

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

  if (screen === 'upload') {
    return (
      <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--ppu-navy)' }}>
        <Nav onBackToLibrary={goToLibrary} />
        <VideoUploader onUploadComplete={handleUploadComplete} />
      </div>
    )
  }

  // Review screen
  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--ppu-navy)' }}>
      <Nav currentFilm={activeFilm?.filename} onBackToLibrary={goToLibrary} rightSlot={mockToggle} />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 overflow-hidden">
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
          <PlayTimeline
            plays={activePlays}
            duration={videoDuration}
            analyzing={analyzing}
            onSeek={handleSeek}
          />
        </div>
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
