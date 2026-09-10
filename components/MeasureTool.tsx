'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjs from 'pdfjs-dist'
import {
  Pt, LinearUnit, LINEAR_UNITS,
  polylineLength, polygonArea, polygonPerimeter,
  unitsPerPoint, pixelsToUnits, pixelAreaToUnits,
  areaUnitLabel, pretty,
} from '@/utils/measure'

if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
}

interface Props {
  file: File
  onClose: () => void
  showStatus: (msg: string, dur?: number) => void
}

type Mode = 'calibrate' | 'distance' | 'area'

/**
 * Measure / Scale — set a scale by drawing a reference of known length on the
 * page, then measure real-world distances and areas. All on-device: the PDF is
 * rendered locally with pdf.js and nothing is uploaded. Aimed at surveyors and
 * project managers reading scaled site plans and drawings.
 */
export default function MeasureTool({ file, onClose, showStatus }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const overlayRef = useRef<HTMLCanvasElement | null>(null)
  const pdfRef = useRef<any>(null)
  const renderTaskRef = useRef<any>(null)

  const [numPages, setNumPages] = useState(1)
  const [pageNum, setPageNum] = useState(1)
  const [zoom, setZoom] = useState(1.3)
  const [renderScale, setRenderScale] = useState(1.3) // canvas px per PDF point
  const [loading, setLoading] = useState(true)

  const [mode, setMode] = useState<Mode>('calibrate')
  const [unit, setUnit] = useState<LinearUnit>('m')
  const [knownLength, setKnownLength] = useState('10')
  const [unitsPerPt, setUnitsPerPt] = useState<number | null>(null)

  // points collected for the current in-progress measurement (canvas px)
  const [points, setPoints] = useState<Pt[]>([])

  // ── Load PDF once ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const buf = await file.arrayBuffer()
        const pdf = await pdfjs.getDocument({ standardFontDataUrl: '/pdf-standard-fonts/', data: buf }).promise
        if (cancelled) return
        pdfRef.current = pdf
        setNumPages(pdf.numPages)
        setLoading(false)
      } catch (e: any) {
        showStatus('Could not open PDF: ' + e.message)
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [file, showStatus])

  // ── Render current page ────────────────────────────────────────────────
  const renderPage = useCallback(async () => {
    const pdf = pdfRef.current
    const canvas = canvasRef.current
    const overlay = overlayRef.current
    if (!pdf || !canvas || !overlay) return
    try {
      if (renderTaskRef.current) { try { renderTaskRef.current.cancel() } catch {} }
      const page = await pdf.getPage(pageNum)
      const viewport = page.getViewport({ scale: zoom })
      canvas.width = viewport.width
      canvas.height = viewport.height
      overlay.width = viewport.width
      overlay.height = viewport.height
      setRenderScale(viewport.scale) // px per point
      const task = page.render({ canvasContext: canvas.getContext('2d')!, viewport })
      renderTaskRef.current = task
      await task.promise
      drawOverlay([])
    } catch (e: any) {
      if (e?.name !== 'RenderingCancelledException') showStatus('Render failed: ' + e.message)
    }
  }, [pageNum, zoom, showStatus])

  useEffect(() => { if (!loading) renderPage() }, [loading, renderPage])

  // ── Overlay drawing ────────────────────────────────────────────────────
  const drawOverlay = useCallback((pts: Pt[]) => {
    const overlay = overlayRef.current
    if (!overlay) return
    const ctx = overlay.getContext('2d')!
    ctx.clearRect(0, 0, overlay.width, overlay.height)
    if (pts.length === 0) return
    const color = mode === 'calibrate' ? '#dc2626' : mode === 'area' ? '#7c3aed' : '#2563eb'
    ctx.strokeStyle = color
    ctx.fillStyle = color + '22'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    if (mode === 'area' && pts.length >= 3) { ctx.closePath(); ctx.fill() }
    ctx.stroke()
    // vertices
    for (const p of pts) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
    }
  }, [mode])

  useEffect(() => { drawOverlay(points) }, [points, drawOverlay])

  // ── Interaction ────────────────────────────────────────────────────────
  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const overlay = overlayRef.current
    if (!overlay) return
    const rect = overlay.getBoundingClientRect()
    const scaleX = overlay.width / rect.width
    const scaleY = overlay.height / rect.height
    const p: Pt = { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }

    if (mode === 'calibrate') {
      const next = points.length >= 2 ? [p] : [...points, p]
      setPoints(next)
      if (next.length === 2) finishCalibration(next)
    } else {
      setPoints(prev => [...prev, p])
    }
  }

  const finishCalibration = (pts: Pt[]) => {
    const real = parseFloat(knownLength)
    if (!(real > 0)) { showStatus('Enter the real length of the reference line first (must be > 0)'); return }
    const px = polylineLength(pts)
    if (px < 3) { showStatus('Reference line too short — draw a longer known distance'); return }
    try {
      const upp = unitsPerPoint(px, renderScale, real)
      setUnitsPerPt(upp)
      setMode('distance')
      setPoints([])
      showStatus(`Scale set: 1 pt = ${pretty(upp)} ${unit}. Now measure distances or areas.`, 6000)
    } catch (e: any) { showStatus(e.message) }
  }

  const reset = () => setPoints([])
  const undo = () => setPoints(prev => prev.slice(0, -1))

  // ── Live readout ───────────────────────────────────────────────────────
  let readout = ''
  if (mode === 'calibrate') {
    readout = points.length < 2
      ? 'Click two points along a feature of known length (e.g. a scale bar or a known wall).'
      : 'Reference captured.'
  } else if (unitsPerPt != null) {
    if (mode === 'distance' && points.length >= 2) {
      const px = polylineLength(points)
      const len = pixelsToUnits(px, renderScale, unitsPerPt)
      readout = `Length: ${pretty(len)} ${unit}` + (points.length > 2 ? ` (${points.length - 1} segments)` : '')
    } else if (mode === 'area' && points.length >= 3) {
      const pxA = polygonArea(points)
      const area = pixelAreaToUnits(pxA, renderScale, unitsPerPt)
      const perimPx = polygonPerimeter(points)
      const perim = pixelsToUnits(perimPx, renderScale, unitsPerPt)
      readout = `Area: ${pretty(area)} ${areaUnitLabel(unit)} · Perimeter: ${pretty(perim)} ${unit}`
    } else {
      readout = mode === 'distance'
        ? 'Click points along what you want to measure. Multiple clicks measure a path.'
        : 'Click at least 3 corners to enclose an area.'
    }
  }

  const needsScale = unitsPerPt == null

  return (
    <div className="card animate-scale-in space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl" aria-hidden="true">📐</span>
          <div>
            <p className="font-semibold text-sm">Measure &amp; Scale</p>
            <p className="text-xs" style={{ color: 'rgba(10,10,15,0.4)' }}>Distances and areas on scaled drawings — on-device</p>
          </div>
        </div>
        <button onClick={onClose} className="text-xs px-2 py-1 rounded-lg" style={{ color: 'var(--ink-muted)', border: '1px solid var(--border)' }}>Close</button>
      </div>

      {/* Scale setup */}
      <div className="rounded-xl p-3 space-y-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold" style={{ color: 'var(--ink-muted)' }}>
            {needsScale ? '① Set the scale' : `Scale set (1 pt = ${pretty(unitsPerPt!)} ${unit})`}
          </span>
          {!needsScale && (
            <button onClick={() => { setUnitsPerPt(null); setMode('calibrate'); setPoints([]) }}
                    className="text-xs px-2 py-0.5 rounded-lg" style={{ color: '#dc2626', background: '#fee2e2' }}>Recalibrate</button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <label className="block mb-0.5 font-medium" style={{ color: 'var(--ink-muted)' }}>Known length</label>
            <input type="number" min={0} step="any" value={knownLength}
                   onChange={e => setKnownLength(e.target.value)} className="input" style={{ padding: '4px 8px', fontSize: '11px' }} />
          </div>
          <div>
            <label className="block mb-0.5 font-medium" style={{ color: 'var(--ink-muted)' }}>Unit</label>
            <select value={unit} onChange={e => setUnit(e.target.value as LinearUnit)} className="input" style={{ padding: '4px 8px', fontSize: '11px' }}>
              {LINEAR_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Mode buttons (after scale) */}
      {!needsScale && (
        <div className="flex gap-2">
          {(['distance', 'area'] as Mode[]).map(m => (
            <button key={m} onClick={() => { setMode(m); setPoints([]) }}
                    className="flex-1 text-xs py-2 rounded-lg font-semibold transition-all"
                    style={mode === m
                      ? { background: '#2563eb', color: '#fff' }
                      : { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--ink)' }}>
              {m === 'distance' ? '📏 Distance' : '⬟ Area'}
            </button>
          ))}
        </div>
      )}

      {/* Readout */}
      <div className="px-4 py-3 rounded-xl text-xs" role="status" aria-live="polite"
           style={{ background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.2)', color: '#1e3a8a', minHeight: 40 }}>
        {readout || 'Loading…'}
      </div>

      {/* Page controls */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <button onClick={() => { setPageNum(p => Math.max(1, p - 1)); setPoints([]) }} disabled={pageNum <= 1}
                  className="px-2 py-1 rounded-lg" style={{ border: '1px solid var(--border)', opacity: pageNum <= 1 ? 0.4 : 1 }}>◀</button>
          <span style={{ color: 'var(--ink-muted)' }}>Page {pageNum}/{numPages}</span>
          <button onClick={() => { setPageNum(p => Math.min(numPages, p + 1)); setPoints([]) }} disabled={pageNum >= numPages}
                  className="px-2 py-1 rounded-lg" style={{ border: '1px solid var(--border)', opacity: pageNum >= numPages ? 0.4 : 1 }}>▶</button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))} className="px-2 py-1 rounded-lg" style={{ border: '1px solid var(--border)' }}>−</button>
          <span style={{ color: 'var(--ink-muted)' }}>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))} className="px-2 py-1 rounded-lg" style={{ border: '1px solid var(--border)' }}>+</button>
          <button onClick={undo} disabled={points.length === 0} className="px-2 py-1 rounded-lg" style={{ border: '1px solid var(--border)', opacity: points.length === 0 ? 0.4 : 1 }}>Undo</button>
          <button onClick={reset} disabled={points.length === 0} className="px-2 py-1 rounded-lg" style={{ border: '1px solid var(--border)', opacity: points.length === 0 ? 0.4 : 1 }}>Clear</button>
        </div>
      </div>

      {/* Canvas stack */}
      <div style={{ position: 'relative', overflow: 'auto', maxHeight: 560, border: '1px solid var(--border)', borderRadius: 12, background: '#fff' }}>
        {loading && <p className="text-xs text-center py-8" style={{ color: 'var(--ink-muted)' }}>Rendering page…</p>}
        <canvas ref={canvasRef} style={{ display: loading ? 'none' : 'block' }} />
        <canvas ref={overlayRef} onClick={onCanvasClick}
                style={{ position: 'absolute', left: 0, top: 0, cursor: 'crosshair', display: loading ? 'none' : 'block' }} />
      </div>

      <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
        Tip: calibrate against the drawing&rsquo;s printed scale bar for best accuracy. Re-measure if you change zoom mid-measurement.
      </p>
    </div>
  )
}
