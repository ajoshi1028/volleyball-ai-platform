'use client'

import { useState } from 'react'

const API_URL = 'http://localhost:8000'

export default function UploadForm({ onVideoUploaded }) {
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const handleFileChange = (e) => {
    setFile(e.target.files[0])
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) {
      setError('Please select a video')
      return
    }

    setUploading(true)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`${API_URL}/upload-video`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) throw new Error('Upload failed')

      const data = await res.json()
      onVideoUploaded({
        filename: data.filename,
        gcs_uri: data.gcs_uri,
        timestamp: new Date().toLocaleString(),
      })

      setFile(null)
      document.getElementById('file-input').value = ''
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
      <input
        type="file"
        id="file-input"
        accept="video/*"
        onChange={handleFileChange}
        disabled={uploading}
        style={{ padding: '10px', border: '2px solid #667eea', borderRadius: '6px' }}
      />
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <button 
        type="submit" 
        disabled={!file || uploading}
        style={{ padding: '12px', background: '#667eea', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
      >
        {uploading ? 'Uploading...' : 'Upload Video'}
      </button>
    </form>
  )
}
