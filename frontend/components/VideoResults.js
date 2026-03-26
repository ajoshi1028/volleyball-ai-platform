'use client'

import { useState } from 'react'

const API_URL = 'http://localhost:8000'

export default function VideoResults({ video }) {
  const [detecting, setDetecting] = useState(false)
  const [detection, setDetection] = useState(null)
  const [error, setError] = useState('')

  const handleDetect = async () => {
    setDetecting(true)
    setError('')

    try {
      const res = await fetch(`${API_URL}/detect?gcs_uri=${encodeURIComponent(video.gcs_uri)}`, {
        method: 'POST',
      })

      if (!res.ok) throw new Error('Detection failed')

      const data = await res.json()
      setDetection(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setDetecting(false)
    }
  }

  return (
    <div style={{ border: '1px solid #ddd', padding: '20px', borderRadius: '8px', marginBottom: '15px' }}>
      <h3>{video.filename}</h3>
      <p><strong>Uploaded:</strong> {video.timestamp}</p>

      {!detection ? (
        <>
          <p style={{ color: '#999', marginBottom: '15px' }}>Ready for detection...</p>
          <button
            onClick={handleDetect}
            disabled={detecting}
            style={{
              padding: '10px 20px',
              background: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: detecting ? 'not-allowed' : 'pointer',
              opacity: detecting ? 0.6 : 1,
            }}
          >
            {detecting ? 'Running Detection...' : 'Run Detection'}
          </button>
          {error && <p style={{ color: 'red', marginTop: '10px' }}>{error}</p>}
        </>
      ) : (
        <div style={{ marginTop: '15px' }}>
          <h4>Detection Results</h4>
          <div style={{ background: '#f5f5f5', padding: '15px', borderRadius: '6px' }}>
            <p><strong>Resolution:</strong> {detection.resolution}</p>
            <p><strong>Total Frames:</strong> {detection.total_frames}</p>
            <p><strong>FPS:</strong> {Math.round(detection.fps)}</p>
            <p><strong>Frames Analyzed:</strong> {detection.processed_frames}</p>

            <div style={{ borderTop: '1px solid #ddd', marginTop: '10px', paddingTop: '10px' }}>
              <p style={{ fontWeight: 'bold', color: '#667eea' }}>👥 Player Detection</p>
              <p><strong>Frames with Players:</strong> {detection.frames_with_detections}</p>
              <p><strong>Total Detection Instances:</strong> {detection.total_detections}</p>
              <p><strong>Avg Players per Frame:</strong> {detection.avg_people_per_detection_frame}</p>
              <p><strong>Max Players in Frame:</strong> {detection.max_people_in_frame}</p>
            </div>

            <div style={{ borderTop: '1px solid #ddd', marginTop: '10px', paddingTop: '10px' }}>
              <p style={{ fontWeight: 'bold', color: '#667eea' }}>🏐 Ball Detection</p>
              <p><strong>Frames with Ball Detected:</strong> {detection.frames_with_ball}</p>
              <p><strong>Ball Detection Rate:</strong> {detection.ball_detection_rate}%</p>
            </div>

            {detection.plays && Object.keys(detection.plays).length > 0 && (
              <div style={{ borderTop: '1px solid #ddd', marginTop: '10px', paddingTop: '10px' }}>
                <p style={{ fontWeight: 'bold', color: '#667eea' }}>🎮 Play Recognition</p>
                {Object.entries(detection.plays).map(([play, count]) => (
                  <p key={play}><strong>{play.charAt(0).toUpperCase() + play.slice(1)}:</strong> {count}</p>
                ))}
              </div>
            )}

            {detection.annotated_video_uri && (
              <div style={{ borderTop: '1px solid #ddd', marginTop: '10px', paddingTop: '10px' }}>
                <p><strong>Annotated Video:</strong> <a href={detection.annotated_video_uri} target="_blank" rel="noopener noreferrer" style={{ color: '#667eea' }}>View in GCS</a></p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
