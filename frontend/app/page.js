'use client'

import { useState } from 'react'
import UploadForm from '@/components/UploadForm'
import VideoResults from '@/components/VideoResults'

export default function Home() {
  const [videos, setVideos] = useState([])

  const handleVideoUploaded = (videoData) => {
    setVideos([...videos, videoData])
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      <header style={{ textAlign: 'center', color: 'white', marginBottom: '40px' }}>
        <h1 style={{ fontSize: '2.5em', marginBottom: '10px' }}>🏐 Volleyball AI Platform</h1>
        <p style={{ fontSize: '1.1em' }}>Upload practice videos to analyze plays automatically</p>
      </header>

      <main>
        <section style={{ background: 'white', padding: '40px', borderRadius: '12px', marginBottom: '40px' }}>
          <h2>Upload Video</h2>
          <UploadForm onVideoUploaded={handleVideoUploaded} />
        </section>

        {videos.length > 0 && (
          <section style={{ background: 'white', padding: '40px', borderRadius: '12px' }}>
            <h2>Uploaded Videos</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px', marginTop: '20px' }}>
              {videos.map((video, idx) => (
                <VideoResults key={idx} video={video} />
              ))}
            </div>
          </section>
        )}
      </main>

      <footer style={{ textAlign: 'center', color: 'white', padding: '20px', marginTop: '40px' }}>
        <p>Pepperdine Volleyball AI Hackathon 2026</p>
      </footer>
    </div>
  )
}
