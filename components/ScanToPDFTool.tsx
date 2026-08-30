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
  const n = w * h

  // Luminance (grayscale) for every pixel.
  const gray = new Float32Array(n)
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    gray[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
  }

  if (filter === 'gray') {
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      d[i] = d[i + 1] = d[i + 2] = gray[p]
    }
    ctx.putImageData(img, 0, 0)
    return
  }

  // filter === 'doc': adaptive (local) thresholding — Bradley & Roth.
  // A fixed global threshold blanked bright/unevenly-lit captures to white;
  // here each pixel is compared to the mean of its local window (via an
  // integral image, so it is fast), which survives glare and shadow.
  const stride = w + 1
  const integral = new Float64Array(stride * (h + 1)) // Float64: sums exceed 2^24
  for (let y = 0; y < h; y++) {
    let rowSum = 0
    const rowBase = y * w
    const iRow = (y + 1) * stride
    const iPrev = y * stride
    for (let x = 0; x < w; x++) {
      rowSum += gray[rowBase + x]
      integral[iRow + x + 1] = integral[iPrev + x + 1] + rowSum
    }
  }

  const S = Math.max(16, Math.floor(w / 8)) // local window size
  const half = Math.floor(S / 2)
  const T = 10 // % below local mean counts as ink (lower = catches fainter print)

  for (let y = 0; y < h; y++) {
    const y1 = Math.max(0, y - half)
    const y2 = Math.min(h - 1, y + half)
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - half)
      const x2 = Math.min(w - 1, x + half)
      const count = (x2 - x1 + 1) * (y2 - y1 + 1)
      const sum =
        integral[(y2 + 1) * stride + (x2 + 1)] -
        integral[y1 * stride + (x2 + 1)] -
        integral[(y2 + 1) * stride + x1] +
        integral[y1 * stride + x1]
      const p = y * w + x
      const idx = p * 4
      const isInk = gray[p] * count <= sum * ((100 - T) / 100)
      d[idx] = d[idx + 1] = d[idx + 2] = isInk ? 0 : 255
    }
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

  // The <video> is only rendered when cameraOn is true, so attach the stream
  // here — after it has mounted. Setting srcObject inside startCamera hit a null
  // ref, leaving the preview black and videoWidth 0 (Capture did nothing).
  useEffect(() => {
    const v = videoRef.current
    if (cameraOn && v && streamRef.current) {
      v.srcObject = streamRef.current
      v.play().catch(() => {})
    }
  }, [cameraOn])

  const startCamera = async () => {
    setCameraError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      streamRef.current = stream
      setCameraOn(true) // renders the <video>; the effect below attaches the stream once it mounts
    } catch (e: any) {
      setCameraError('Camera unavailable: ' + (e.message || 'permission denied') + '. You can still upload photos below.')
    }
  }

  const capture = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) { showStatus('Camera still starting — try again in a moment'); return }
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(video, 0, 0)
    applyFilter(ctx, canvas.width, canvas.height, filter)
    setPages(prev => [...prev, { dataUrl: (filter === 'color' ? canvas.toDataURL('image/jpeg', 0.92) : canvas.toDataURL('image/png')), w: canvas.width, h: canvas.height }])
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
      setPages(prev => [...prev, { dataUrl: (filter === 'color' ? canvas.toDataURL('image/jpeg', 0.92) : canvas.toDataURL('image/png')), w: canvas.width, h: canvas.height }])
    }
  }

  const build = async () => {
    if (pages.length === 0) { showStatus('Capture or upload at least one page'); return }
    setBuilding(true)
    try {
      const { PDFDocument } = await import('pdf-lib')
      const doc = await PDFDocument.create()
      for (const p of pages) {
        const img = p.dataUrl.startsWith('data:image/png')
          ? await doc.embedPng(p.dataUrl)
          : await doc.embedJpg(p.dataUrl)
        // Size the PDF page to the scan's own aspect ratio so the image fills it
        // edge to edge — no white letterbox bands above/below a landscape scan.
        // Cap the long edge to keep the file a sensible size.
        const MAX = 1400
        const s = Math.min(1, MAX / Math.max(p.w, p.h))
        const pw = p.w * s, ph = p.h * s
        const page = doc.addPage([pw, ph])
        page.drawImage(img, { x: 0, y: 0, width: pw, height: ph })
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
          <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-xl" style={{ background: '#000' }} />
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
