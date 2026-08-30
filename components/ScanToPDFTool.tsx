'use client'

// components/ScanToPDFTool.tsx — Stage 7 gap-filler: Scan to PDF
// Camera capture → document filter → multi-page PDF. Fully client-side;
// frames never leave the device (that IS the product promise).

import { useEffect, useRef, useState } from 'react'
import { pdfBlob } from '@/utils/blob'
import { detectDocumentCorners, warpToImageData } from '@/utils/docScan'
import { ensureOpenCV, detectCornersCV } from '@/utils/docScanCV'

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
  const detRef = useRef({ timer: null as any, stable: 0, cooldown: 0, sig: '', armed: true })
  const [cameraOn, setCameraOn] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [pages, setPages] = useState<CapturedPage[]>([])
  const [filter, setFilter] = useState<Filter>('doc')
  const [autoCrop, setAutoCrop] = useState(true)
  const [autoCapture, setAutoCapture] = useState(true)
  const [detectHint, setDetectHint] = useState('')
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const [building, setBuilding] = useState(false)

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCameraOn(false)
  }

  useEffect(() => () => stopCamera(), [])
  useEffect(() => { ensureOpenCV() }, []) // warm up edge-based detector (cached)

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
        video: { facingMode: 'environment', width: { ideal: 2560 }, height: { ideal: 1440 } },
        audio: false,
      })
      streamRef.current = stream
      setCameraOn(true) // renders the <video>; the effect below attaches the stream once it mounts
    } catch (e: any) {
      setCameraError('Camera unavailable: ' + (e.message || 'permission denied') + '. You can still upload photos below.')
    }
  }

  // Prefer OpenCV edge/contour detection (robust on bright backgrounds); fall
  // back to the self-contained brightness detector when OpenCV isn't ready.
  const detectCorners = (canvas: HTMLCanvasElement): { x: number; y: number }[] | null => {
    const viaCV = detectCornersCV(canvas)
    if (viaCV) return viaCV
    const id = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
    return detectDocumentCorners(id.data, canvas.width, canvas.height)
  }

  // Optional page auto-detect + de-warp, then the B/W/grayscale filter, then encode.
  const canvasToPage = (src: HTMLCanvasElement): CapturedPage => {
    let work = src
    if (autoCrop) {
      const corners = detectCorners(src)
      if (corners) {
        const id = src.getContext('2d')!.getImageData(0, 0, src.width, src.height)
        const wd = warpToImageData(id.data, src.width, src.height, corners)
        const c = document.createElement('canvas')
        c.width = wd.width; c.height = wd.height
        const cctx = c.getContext('2d')!
        const im = cctx.createImageData(wd.width, wd.height)
        im.data.set(wd.data)
        cctx.putImageData(im, 0, 0)
        work = c // flattened page; if no page found we keep the full frame
      }
    }
    const wctx = work.getContext('2d')!
    applyFilter(wctx, work.width, work.height, filter)
    return {
      dataUrl: filter === 'color' ? work.toDataURL('image/jpeg', 0.92) : work.toDataURL('image/png'),
      w: work.width, h: work.height,
    }
  }

  const capture = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) { showStatus('Camera still starting — try again in a moment'); return }
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    setPages(prev => [...prev, canvasToPage(canvas)])
    showStatus(`📸 Page ${pages.length + 1} captured`)
  }

  // Always call the freshest capture() from the detection interval.
  const captureRef = useRef(capture)
  captureRef.current = capture

  const drawOverlay = (corners: { x: number; y: number }[] | null, smW: number, smH: number, vw: number, vh: number) => {
    const ov = overlayRef.current
    if (!ov) return
    if (ov.width !== vw) { ov.width = vw; ov.height = vh }
    const g = ov.getContext('2d')
    if (!g) return
    g.clearRect(0, 0, vw, vh)
    if (!corners) return
    const fx = vw / smW, fy = vh / smH
    g.beginPath()
    corners.forEach((pt, i) => { const x = pt.x * fx, y = pt.y * fy; if (i) g.lineTo(x, y); else g.moveTo(x, y) })
    g.closePath()
    g.lineWidth = Math.max(3, vw * 0.006)
    g.strokeStyle = '#22d3ee'
    g.stroke()
    g.fillStyle = 'rgba(34,211,238,0.15)'
    g.fill()
  }

  // Auto-capture: watch the live feed; when a well-framed, steady page is
  // detected, snap it automatically so both hands are free to hold the document.
  // Re-arms only after the page leaves the frame, so it won't shoot duplicates.
  useEffect(() => {
    const ov = overlayRef.current
    if (!cameraOn || !autoCapture) {
      setDetectHint('')
      if (ov) ov.getContext('2d')?.clearRect(0, 0, ov.width, ov.height)
      return
    }
    const st = detRef.current
    st.stable = 0; st.cooldown = 0; st.sig = ''; st.armed = true
    const tick = () => {
      const video = videoRef.current
      if (!video || !video.videoWidth) return
      if (st.cooldown > 0) { st.cooldown--; return }
      const vw = video.videoWidth, vh = video.videoHeight
      const smW = 480, smH = Math.max(1, Math.round(vh * smW / vw))
      const c = document.createElement('canvas'); c.width = smW; c.height = smH
      const cx = c.getContext('2d'); if (!cx) return
      cx.drawImage(video, 0, 0, smW, smH)
      const corners = detectCorners(c)
      drawOverlay(corners, smW, smH, vw, vh)
      if (!corners) { st.stable = 0; st.armed = true; setDetectHint('Line up the document in the frame'); return }
      const xs = corners.map(pt => pt.x), ys = corners.map(pt => pt.y)
      const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys)
      const areaFrac = ((maxx - minx) * (maxy - miny)) / (smW * smH)
      const inView = minx > smW * 0.02 && maxx < smW * 0.98 && miny > smH * 0.02 && maxy < smH * 0.98
      if (areaFrac < 0.30 || !inView) { st.stable = 0; st.armed = true; setDetectHint(areaFrac < 0.30 ? 'Move closer — fill the frame' : 'Fit all 4 corners in view'); return }
      if (!st.armed) { setDetectHint('✓ Captured — present the next page'); return }
      const sig = `${Math.round((minx + maxx) / 20)}-${Math.round((miny + maxy) / 20)}-${Math.round(areaFrac * 20)}`
      if (sig === st.sig) st.stable++; else { st.sig = sig; st.stable = 1 }
      if (st.stable >= 3) {
        captureRef.current()
        st.stable = 0; st.armed = false; st.cooldown = 4
        setDetectHint('✓ Captured — present the next page')
      } else {
        setDetectHint('Hold steady…')
      }
    }
    st.timer = setInterval(tick, 350)
    return () => { clearInterval(st.timer) }
  }, [cameraOn, autoCapture])

  const addFromFiles = async (files: FileList | null) => {
    if (!files) return
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue
      const bmp = await createImageBitmap(f)
      const canvas = document.createElement('canvas')
      canvas.width = bmp.width; canvas.height = bmp.height
      canvas.getContext('2d')!.drawImage(bmp, 0, 0)
      setPages(prev => [...prev, canvasToPage(canvas)])
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
        <label className="flex items-center gap-1.5 text-xs ml-auto" style={{ color: 'var(--ink)' }}>
          <input type="checkbox" checked={autoCapture} onChange={e => setAutoCapture(e.target.checked)} /> Auto-capture
        </label>
        <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--ink)' }}>
          <input type="checkbox" checked={autoCrop} onChange={e => setAutoCrop(e.target.checked)} /> Auto-crop &amp; flatten
        </label>
      </div>

      {cameraOn ? (
        <div className="space-y-2">
          <div className="relative">
            <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-xl" style={{ background: '#000' }} />
            <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none rounded-xl" />
          </div>
          {autoCapture && detectHint && <p className="text-xs text-center font-medium" style={{ color: 'var(--ink-soft)' }}>{detectHint}</p>}
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
