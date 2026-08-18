'use client'

// components/ScanToPDFTool.tsx — Stage 7 gap-filler: Scan to PDF
// Camera capture → document filter → multi-page PDF. Fully client-side;
// frames never leave the device (that IS the product promise).

import { useEffect, useRef, useState } from 'react'
import { pdfBlob } from '@/utils/blob'

interface Props {
  onComplete: (blob: Blob) => void
  showStatus: (msg: string, dur?: number) => void
}

type Filter = 'color' | 'gray' | 'doc'

interface CapturedPage { dataUrl: string; w: number; h: number }

function applyFilter(ctx: CanvasRenderingContext2D, w: number, h: number, filter: Filter) {
  if (filter === 'color') return
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    let v = lum
    if (filter === 'doc') {
      // document mode: aggressive contrast push toward black/white
      v = lum < 140 ? Math.max(0, lum - 60) : 255
    }
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)
}

export default function ScanToPDFTool({ onComplete, showStatus }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [pages, setPages] = useState<CapturedPage[]>([])
  const [filter, setFilter] = useState<Filter>('doc')
  const [building, setBuilding] = useState(false)

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCameraOn(false)
  }

  useEffect(() => () => stopCamera(), [])

  const startCamera = async () => {
    setCameraError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraOn(true)
    } catch (e: any) {
      setCameraError('Camera unavailable: ' + (e.message || 'permission denied') + '. You can still upload photos below.')
    }
  }

  const capture = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(video, 0, 0)
    applyFilter(ctx, canvas.width, canvas.height, filter)
    setPages(prev => [...prev, { dataUrl: canvas.toDataURL('image/jpeg', 0.9), w: canvas.width, h: canvas.height }])
    showStatus(`📸 Page ${pages.length + 1} captured`)
  }

  const addFromFiles = async (files: FileList | null) => {
    if (!files) return
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue
      const bmp = await createImageBitmap(f)
      const canvas = document.createElement('canvas')
      canvas.width = bmp.width; canvas.height = bmp.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(bmp, 0, 0)
      applyFilter(ctx, canvas.width, canvas.height, filter)
      setPages(prev => [...prev, { dataUrl: canvas.toDataURL('image/jpeg', 0.9), w: canvas.width, h: canvas.height }])
    }
  }

  const build = async () => {
    if (pages.length === 0) { showStatus('Capture or upload at least one page'); return }
    setBuilding(true)
    try {
      const { PDFDocument } = await import('pdf-lib')
      const doc = await PDFDocument.create()
      for (const p of pages) {
        const img = await doc.embedJpg(p.dataUrl)
        // Fit each scan on an A4 page, preserving aspect, centred
        const A4W = 595, A4H = 842
        const scale = Math.min(A4W / p.w, A4H / p.h)
        const dw = p.w * scale, dh = p.h * scale
        const page = doc.addPage([A4W, A4H])
        page.drawImage(img, { x: (A4W - dw) / 2, y: (A4H - dh) / 2, width: dw, height: dh })
      }
      const blob = pdfBlob(await doc.save())
      onComplete(blob)
      showStatus(`✓ Scan complete — ${pages.length} page${pages.length > 1 ? 's' : ''}`)
      setPages([])
      stopCamera()
    } catch (e: any) {
      showStatus('Scan build failed: ' + (e.message || 'unknown'))
    }
    setBuilding(false)
  }

  return (
    <div className="card animate-scale-in space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-xl" aria-hidden="true">📸</span>
        <div>
          <p className="font-semibold text-sm">Scan to PDF</p>
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Camera or photo upload → multi-page PDF. Frames never leave this device.</p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs font-semibold" style={{ color: 'var(--ink-muted)' }}>Filter:</span>
        {([['color', 'Colour'], ['gray', 'Grayscale'], ['doc', 'Document B/W']] as Array<[Filter, string]>).map(([f, label]) => (
          <label key={f} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--ink)' }}>
            <input type="radio" name="scan-filter" checked={filter === f} onChange={() => setFilter(f)} /> {label}
          </label>
        ))}
      </div>

      {cameraOn ? (
        <div className="space-y-2">
          <video ref={videoRef} playsInline muted className="w-full rounded-xl" style={{ background: '#000' }} />
          <div className="grid grid-cols-2 gap-2">
            <button onClick={capture} className="btn-primary" style={{ background: '#0d9488' }}>📸 Capture Page</button>
            <button onClick={stopCamera} className="btn-secondary">Stop Camera</button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={startCamera} className="btn-primary" style={{ background: '#0d9488' }}>📷 Start Camera</button>
          <label className="btn-secondary text-center cursor-pointer">
            Upload Photos
            <input type="file" accept="image/*" multiple className="hidden" onChange={e => addFromFiles(e.target.files)} />
          </label>
        </div>
      )}
      {cameraError && <p className="text-xs" style={{ color: '#dc2626' }}>{cameraError}</p>}

      {pages.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--ink-muted)' }}>{pages.length} page{pages.length > 1 ? 's' : ''} captured</p>
          <div className="grid grid-cols-4 gap-2">
            {pages.map((p, i) => (
              <div key={i} className="relative group">
                <img src={p.dataUrl} alt={`Scan page ${i + 1}`} className="w-full rounded-lg" style={{ border: '1px solid var(--border)' }} />
                <button onClick={() => setPages(prev => prev.filter((_, j) => j !== i))}
                        className="absolute top-1 right-1 text-xs w-5 h-5 rounded-full opacity-80"
                        style={{ background: '#dc2626', color: '#fff' }} aria-label={`Remove page ${i + 1}`}>×</button>
                <span className="absolute bottom-1 left-1 text-xs px-1 rounded" style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}>{i + 1}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={build} disabled={pages.length === 0 || building} className="btn-primary w-full" style={{ background: '#0d9488' }}>
        {building ? 'Building…' : `📄 Build PDF (${pages.length} page${pages.length === 1 ? '' : 's'})`}
      </button>
    </div>
  )
}
