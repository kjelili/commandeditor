'use client'

import { useRef, useState, useEffect } from 'react'

interface FileUploadProps {
  onFilesUpload: (files: File[]) => void
  uploadedFiles: File[]
}

const ACCEPTED_TYPES = {
  'application/pdf': '.pdf',
  'image/*': 'images',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/msword': '.doc',
  'text/plain': '.txt',
  'text/html': '.html',
  'text/markdown': '.md',
}

export default function FileUpload({ onFilesUpload, uploadedFiles }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [driveLoading, setDriveLoading] = useState(false)
  const [dropboxLoading, setDropboxLoading] = useState(false)

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const accepted = Array.from(files).filter(file => {
      const name = file.name.toLowerCase()
      const type = file.type.toLowerCase()
      return (
        type === 'application/pdf' || name.endsWith('.pdf') ||
        type.startsWith('image/') || name.match(/\.(png|jpg|jpeg|webp|gif|bmp)$/i) ||
        type.includes('wordprocessingml') || type === 'application/msword' ||
        name.endsWith('.docx') || name.endsWith('.doc') ||
        type === 'text/plain' || name.endsWith('.txt') ||
        type === 'text/html' || name.endsWith('.html') || name.endsWith('.htm') ||
        type === 'text/markdown' || name.endsWith('.md') || name.endsWith('.markdown')
      )
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (accepted.length > 0) onFilesUpload(accepted)
    else alert('Please upload: PDF, Images, Word, Text, HTML, or Markdown files')
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFileSelect(e.dataTransfer.files)
  }

  // ── Google Drive Picker ──────────────────────────────────────────────────
  const openGoogleDrivePicker = async () => {
    setDriveLoading(true)
    try {
      // Load Google API script if not already loaded
      if (!(window as any).gapi) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script')
          script.src = 'https://apis.google.com/js/api.js'
          script.onload = () => resolve()
          script.onerror = () => reject(new Error('Google API failed to load'))
          document.head.appendChild(script)
        })
      }
      await new Promise<void>(resolve => (window as any).gapi.load('picker', resolve))

      // Use Google Picker without OAuth for public files (read-only picker)
      // For demonstration: open a file input styled as Google Drive
      // In production you'd provide an API key and OAuth client ID
      const PICKER_API_KEY = '' // Optional: add your Google API key here
      if (!PICKER_API_KEY) {
        // Graceful fallback: open a URL input dialog
        const url = window.prompt('Paste a public Google Drive file URL (or direct PDF URL):')
        if (url) {
          await fetchRemoteFile(url, 'drive-file.pdf')
        }
        return
      }

      const view = new (window as any).google.picker.DocsView()
        .setMimeTypes('application/pdf,image/png,image/jpeg,image/webp')
        .setSelectFolderEnabled(false)

      const picker = new (window as any).google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(PICKER_API_KEY)
        .setCallback(async (data: any) => {
          if (data.action === 'picked' && data.docs?.length > 0) {
            const doc = data.docs[0]
            await fetchRemoteFile(
              `https://drive.google.com/uc?export=download&id=${doc.id}`,
              doc.name
            )
          }
        })
        .build()
      picker.setVisible(true)
    } catch (err) {
      console.error('Google Drive picker error:', err)
      // Graceful fallback
      const url = window.prompt('Paste a direct PDF URL to load:')
      if (url) await fetchRemoteFile(url, 'remote-file.pdf')
    } finally {
      setDriveLoading(false)
    }
  }

  // ── Dropbox Chooser ──────────────────────────────────────────────────────
  const openDropboxChooser = async () => {
    setDropboxLoading(true)
    try {
      // Load Dropbox SDK
      if (!(window as any).Dropbox) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script')
          script.src = 'https://www.dropbox.com/static/api/2/dropins.js'
          script.setAttribute('id', 'dropboxjs')
          script.setAttribute('data-app-key', 'your_dropbox_app_key') // optional
          script.onload = () => resolve()
          script.onerror = () => reject(new Error('Dropbox SDK failed to load'))
          document.head.appendChild(script)
        })
      }

      const Dropbox = (window as any).Dropbox
      if (!Dropbox?.choose) {
        // Graceful fallback
        const url = window.prompt('Paste a direct Dropbox file link (change dl=0 to dl=1):')
        if (url) await fetchRemoteFile(url.replace('dl=0', 'dl=1'), 'dropbox-file.pdf')
        return
      }

      Dropbox.choose({
        success: async (files: any[]) => {
          for (const file of files) {
            await fetchRemoteFile(file.link, file.name)
          }
        },
        cancel: () => {},
        linkType: 'direct',
        multiselect: true,
        extensions: ['.pdf', '.png', '.jpg', '.jpeg', '.docx', '.txt'],
      })
    } catch (err) {
      const url = window.prompt('Paste a direct Dropbox file link:')
      if (url) await fetchRemoteFile(url, 'dropbox-file.pdf')
    } finally {
      setDropboxLoading(false)
    }
  }

  // ── Fetch remote file by URL ─────────────────────────────────────────────
  const fetchRemoteFile = async (url: string, fallbackName: string) => {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const contentType = res.headers.get('content-type') || 'application/pdf'
      // Infer filename from URL or Content-Disposition
      const cdHeader = res.headers.get('content-disposition')
      const nameMatch = cdHeader?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
      const name = nameMatch ? nameMatch[1].replace(/['"]/g, '') : fallbackName
      const file = new File([blob], name, { type: contentType })
      onFilesUpload([file])
    } catch (err: any) {
      alert(`Could not load file: ${err.message}\n\nTip: The server must allow cross-origin requests (CORS).`)
    }
  }

  const getFileIcon = (file: File) => {
    const name = file.name.toLowerCase()
    const type = file.type.toLowerCase()
    if (type === 'application/pdf' || name.endsWith('.pdf')) return '📄'
    if (type.startsWith('image/')) return '🖼️'
    if (name.endsWith('.docx') || name.endsWith('.doc')) return '📝'
    if (name.endsWith('.md') || name.endsWith('.markdown')) return '📋'
    if (name.endsWith('.html') || name.endsWith('.htm')) return '🌐'
    return '📃'
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  return (
    <div className="card h-full animate-fade-up">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm"
               style={{ background: 'linear-gradient(135deg, var(--blue-bright), var(--blue-vivid))' }}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold">Upload Files</h2>
            <p className="text-xs" style={{ color: 'rgba(10,10,15,0.4)' }}>PDF, Images, Word, Text, HTML, MD</p>
          </div>
        </div>
        {uploadedFiles.length > 0 && (
          <span className="badge badge-ink">{uploadedFiles.length} file{uploadedFiles.length > 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Drop Zone */}
      <div
        className={`upload-zone${isDragging ? ' dragging' : ''}`}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
      >
        <div className={`w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center transition-all duration-200 ${isDragging ? 'scale-110' : ''}`}
             style={{ background: isDragging ? 'var(--accent)' : 'var(--surface-2)' }}>
          <svg className="w-7 h-7 transition-colors"
               style={{ color: isDragging ? 'white' : 'rgba(10,10,15,0.35)' }}
               fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        <p className="text-sm font-medium mb-3" style={{ color: isDragging ? 'var(--accent)' : 'rgba(10,10,15,0.6)' }}>
          {isDragging ? 'Release to upload' : 'Drop files here, or browse'}
        </p>
        <label
          data-upload-btn
          htmlFor="file-input"
          className="btn-primary text-xs px-4 py-2 cursor-pointer inline-flex items-center gap-2"
          style={{ display: 'inline-flex' }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          </svg>
          Choose Files
        </label>
        <input
          ref={fileInputRef}
          id="file-input"
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.doc,.docx,.txt,.html,.htm,.md,.markdown"
          multiple
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files)}
        />
      </div>

      {/* Cloud import row */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={openGoogleDrivePicker}
          disabled={driveLoading}
          className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all"
          style={{ background: 'var(--surface-2)', border: '1.5px solid var(--border)', color: 'var(--ink-soft)' }}
          onMouseOver={e => { (e.currentTarget as HTMLElement).style.borderColor = '#4285F4'; (e.currentTarget as HTMLElement).style.color = '#4285F4' }}
          onMouseOut={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--ink-soft)' }}
          aria-label="Import from Google Drive"
        >
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6.28 3L1 12.14l3.14 5.44L9.42 8.4 6.28 3zM9.42 8.4l-5.28 9.18H16.8L22.08 8.4H9.42zM16.8 17.58L22.08 8.4l-3.14-5.44-5.28 9.18L16.8 17.58z" />
          </svg>
          {driveLoading ? 'Loading…' : 'Google Drive'}
        </button>
        <button
          onClick={openDropboxChooser}
          disabled={dropboxLoading}
          className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all"
          style={{ background: 'var(--surface-2)', border: '1.5px solid var(--border)', color: 'var(--ink-soft)' }}
          onMouseOver={e => { (e.currentTarget as HTMLElement).style.borderColor = '#0061FF'; (e.currentTarget as HTMLElement).style.color = '#0061FF' }}
          onMouseOut={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--ink-soft)' }}
          aria-label="Import from Dropbox"
        >
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 2L0 6l6 4-6 4 6 4 6-4-6-4 6-4L6 2zm12 0l-6 4 6 4-6 4 6 4 6-4-6-4 6-4-6-4zm-6 9l-6 4v2l6-4 6 4v-2l-6-4z"/>
          </svg>
          {dropboxLoading ? 'Loading…' : 'Dropbox'}
        </button>
      </div>
      <p className="text-xs mt-1.5 text-center" style={{ color: 'var(--ink-muted)' }}>
        Or paste a URL: <button onClick={async () => { const u = window.prompt('Paste a direct file URL:'); if (u) await fetchRemoteFile(u, 'remote-file.pdf') }}
          className="underline" style={{ color: 'var(--blue-vivid)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 'inherit' }}>
          Load from URL
        </button>
      </p>

      {/* File List */}
      {uploadedFiles.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="section-label">Loaded files</p>
            <button
              onClick={() => onFilesUpload([])}
              className="text-xs px-2 py-1 rounded-lg transition-colors"
              style={{ color: 'rgba(10,10,15,0.4)', background: 'transparent' }}
              onMouseOver={(e: React.MouseEvent) => (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'}
              onMouseOut={(e: React.MouseEvent) => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              Clear all
            </button>
          </div>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {uploadedFiles.map((file, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-xl animate-fade-up"
                   style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <span className="text-lg">{getFileIcon(file)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs" style={{ color: 'rgba(10,10,15,0.4)' }}>{formatSize(file.size)}</p>
                </div>
                <button
                  onClick={() => onFilesUpload(uploadedFiles.filter((_, idx) => idx !== i))}
                  className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
                  style={{ color: 'rgba(10,10,15,0.3)' }}
                  onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = '#fee2e2'; (e.currentTarget as HTMLElement).style.color = '#dc2626' }}
                  onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'rgba(10,10,15,0.3)' }}
                  title="Remove file"
                  aria-label={`Remove ${file.name}`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
