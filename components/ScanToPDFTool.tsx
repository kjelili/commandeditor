'use client'

// components/ScanToPDFTool.tsx — Scan to PDF
// Photo (device's native camera, or upload) → auto-crop/deskew → document
// filter → multi-page PDF. Fully client-side; images never leave the device.
//
// Design note: a live in-browser camera with real-time page detection proved
// unreliable across real backgrounds (white walls, textured floors, cluttered
// rooms). The device's NATIVE camera app produces far better photos, so "Take
// Photo" opens it directly (capture="environment") and the still is processed
// exactly like an upload — the path that works.

import { useEffect, useState } from 'react'
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
  const [pages, setPages] = useState<CapturedPage[]>([])
  const [filter, setFilter] = useState<Filter>('doc')
  const [autoCrop, setAutoCrop] = useState(true)
  const [building, setBuilding] = useState(false)
  const [busy, setBusy] = useState(false)
  // 'capture' on a file input only launches a camera on phones/tablets; on a
  // laptop it is just a file picker — so we only offer 'Take Photo' on mobile.
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const coarse = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches
    const ua = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    setIsMobile(coarse || ua)
  }, [])

  // Warm up the OpenCV edge detector (used only as a fallback for pages on
  // bright/white backgrounds). Cached on-device after first load.
  useEffect(() => { ensureOpenCV() }, [])

  // Brightness detector first — reliable when the page contrasts with its
  // surface (desks, floors) — then OpenCV edge detection for white-on-white.
  const detectCorners = (canvas: HTMLCanvasElement): { x: number; y: number }[] | null => {
    const id = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
    return detectDocumentCorners(id.data, canvas.width, canvas.height) ?? detectCornersCV(canvas)
  }

  // Optional page auto-detect + de-warp, then the filter, then encode.
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
        work = c // flattened page; if no page is found we keep the full photo
      }
    }
    applyFilter(work.getContext('2d')!, work.width, work.height, filter)
    return {
      dataUrl: filter === 'color' ? work.toDataURL('image/jpeg', 0.92) : work.toDataURL('image/png'),
      w: work.width, h: work.height,
    }
  }

  const addFromFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setBusy(true)
    let added = 0
    try {
      for (const f of Array.from(files)) {
        if (!f.type.startsWith('image/')) continue
        // Respect EXIF orientation (phone photos are often stored rotated).
        const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' })
        // Cap very large phone photos to keep processing fast and memory safe.
        const MAX = 2500
        const s = Math.min(1, MAX / Math.max(bmp.width, bmp.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(bmp.width * s); canvas.height = Math.round(bmp.height * s)
        canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
        setPages(prev => [...prev, canvasToPage(canvas)])
        added++
      }
      if (added) showStatus(`📸 ${added} page${added > 1 ? 's' : ''} added`)
    } catch (e: any) {
      showStatus('Could not read image: ' + (e.message || 'unknown'))
    }
    setBusy(false)
  }

  const build = async () => {
    if (pages.length === 0) { showStatus('Take or upload at least one page'); return }
    setBuilding(true)
    try {
      const { PDFDocument } = await import('pdf-lib')
      const doc = await PDFDocument.create()
      for (const p of pages) {
        const img = p.dataUrl.startsWith('data:image/png')
          ? await doc.embedPng(p.dataUrl)
          : await doc.embedJpg(p.dataUrl)
        // Page sized to the scan's own aspect ratio — no letterbox bands.
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
    } catch (e: any) {
      showStatus('Scan build failed: ' + (e.message || 'unknown'))
    }
    setBuilding(false)
  }

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    addFromFiles(files)
    e.target.value = '' // allow re-selecting the same file
  }

  return (
    <div className="card animate-scale-in space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-xl" aria-hidden="true">📸</span>
        <div>
          <p className="font-semibold text-sm">Scan to PDF</p>
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Take a photo or upload images → multi-page PDF. Images never leave this device.</p>
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
          <input type="checkbox" checked={autoCrop} onChange={e => setAutoCrop(e.target.checked)} /> Auto-crop &amp; flatten
        </label>
      </div>

      {isMobile ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="btn-primary text-center cursor-pointer" style={{ background: '#0d9488', opacity: busy ? 0.7 : 1 }}>
            📷 Take Photo
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onPick} disabled={busy} />
          </label>
          <label className="btn-secondary text-center cursor-pointer" style={{ opacity: busy ? 0.7 : 1 }}>
            Upload Photos
            <input type="file" accept="image/*" multiple className="hidden" onChange={onPick} disabled={busy} />
          </label>
        </div>
      ) : (
        <label className="btn-primary w-full text-center cursor-pointer block" style={{ background: '#0d9488', opacity: busy ? 0.7 : 1 }}>
          📁 Upload Photos of the Document
          <input type="file" accept="image/*" multiple className="hidden" onChange={onPick} disabled={busy} />
        </label>
      )}
      <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
        {isMobile
          ? 'Tip: lay the page flat on a contrasting surface, fill the frame, use good light. "Take Photo" opens your camera app.'
          : 'Tip: photograph the page with your phone (flat, contrasting surface, good light), then upload it here — or open commandeditor.com on your phone to use its camera directly.'}
      </p>

      {pages.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--ink-muted)' }}>{pages.length} page{pages.length > 1 ? 's' : ''} ready</p>
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

      <button onClick={build} disabled={building || pages.length === 0} className="btn-primary w-full" style={{ background: '#0d9488', opacity: building || pages.length === 0 ? 0.5 : 1 }}>
        {building ? 'Building…' : `📄 Build PDF (${pages.length} page${pages.length === 1 ? '' : 's'})`}
      </button>
    </div>
  )
}
