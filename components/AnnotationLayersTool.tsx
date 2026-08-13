'use client'

/**
 * Annotation Layers — multiple independent annotation sets per document
 * (lib/annotation-layers.js). Layers can be created, hidden, locked,
 * exported/imported as JSON, and flattened into the PDF via pdf-lib.
 */

import React, { useState, useRef } from 'react'
import { AnnotationLayerManager } from '@/lib/annotation-layers'

interface Props {
  file: File
  onComplete: (blob: Blob) => void
  onClose: () => void
  showStatus: (msg: string, dur?: number) => void
}

export default function AnnotationLayersTool({ file, onComplete, onClose, showStatus }: Props) {
  const mgrRef = useRef<any>(null)
  if (!mgrRef.current) mgrRef.current = new AnnotationLayerManager(file.name)
  const mgr = mgrRef.current
  const [, force] = useState(0)
  const rerender = () => force(n => n + 1)
  const [newLayerName, setNewLayerName] = useState('')
  const [annotText, setAnnotText] = useState('')
  const [annotPage, setAnnotPage] = useState(1)
  const [annotX, setAnnotX] = useState(10)
  const [annotY, setAnnotY] = useState(10)
  const [busy, setBusy] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  const layers: any[] = Array.from(mgr.layers.values())

  const addAnnotation = () => {
    if (!annotText.trim()) { showStatus('Write a note first'); return }
    try {
      mgr.addAnnotation({ type: 'note', page: annotPage, x: annotX, y: annotY, text: annotText.trim(), author: 'Me' })
      setAnnotText(''); rerender()
    } catch (e: any) { showStatus(e.message) } // e.g. active layer locked
  }

  const flattenToPDF = async () => {
    setBusy(true)
    try {
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
      const doc = await PDFDocument.load(await file.arrayBuffer())
      const font = await doc.embedFont(StandardFonts.Helvetica)
      const pages = doc.getPages()
      let count = 0
      for (const layer of layers) {
        if (!layer.visible) continue
        const color = hexToRgb(layer.color || '#3b82f6')
        for (const a of layer.annotations) {
          const page = pages[Math.min((a.page || 1) - 1, pages.length - 1)]
          const { width, height } = page.getSize()
          const x = (a.x / 100) * width
          const y = height - (a.y / 100) * height
          const text = `${a.text}`
          const w = Math.min(font.widthOfTextAtSize(text, 9) + 16, width - x - 10)
          page.drawRectangle({ x, y: y - 18, width: w, height: 18, color: rgb(1, 1, 0.75), borderColor: rgb(color.r, color.g, color.b), borderWidth: 1, opacity: 0.9 })
          page.drawText(text.length > 90 ? text.slice(0, 87) + '…' : text, { x: x + 6, y: y - 13, size: 9, font, maxWidth: w - 12 })
          count++
        }
      }
      if (count === 0) { showStatus('No visible annotations to flatten'); setBusy(false); return }
      onComplete(new Blob([await doc.save() as BlobPart], { type: 'application/pdf' }))
      showStatus(`✓ ${count} annotation${count > 1 ? 's' : ''} flattened into PDF`)
    } catch (e: any) { showStatus('Flatten failed: ' + e.message) }
    setBusy(false)
  }

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(mgr.serialize(), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = file.name.replace(/\.pdf$/i, '') + '-annotations.json'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 3000)
  }

  const importJSON = async (f: File) => {
    try {
      const data = JSON.parse(await f.text())
      mgrRef.current = AnnotationLayerManager.deserialize(data)
      rerender(); showStatus('✓ Annotations imported')
    } catch (e: any) { showStatus('Import failed: ' + e.message) }
  }

  return (
    <div className="card space-y-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <div><p className="font-semibold text-sm">🗂 Annotation Layers</p>
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Independent note sets — review rounds, departments, versions. Flatten visible layers when done.</p></div>
        <button onClick={onClose} className="btn-ghost text-xs">✕ Close</button>
      </div>

      {/* Layer list */}
      <div className="space-y-1.5">
        <p className="section-label">Layers</p>
        {layers.map(l => (
          <div key={l.id} className="flex items-center gap-2 text-xs py-1 border-b" style={{ borderColor: 'var(--border)', opacity: l.visible ? 1 : 0.5 }}>
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: l.color }} />
            <button onClick={() => { mgr.setActiveLayer(l.id); rerender() }} className="font-semibold"
              style={{ color: mgr.activeLayerId === l.id ? 'var(--accent)' : 'var(--ink)' }}>
              {l.name}{mgr.activeLayerId === l.id ? ' ●' : ''}
            </button>
            <span style={{ color: 'var(--ink-muted)' }}>{l.annotations.length} note{l.annotations.length === 1 ? '' : 's'}</span>
            <span className="ml-auto flex gap-1">
              <button title="Toggle visibility" onClick={() => { mgr.toggleVisibility(l.id); rerender() }} className="btn-ghost text-xs">{l.visible ? '👁' : '🚫'}</button>
              <button title="Toggle lock" onClick={() => { mgr.toggleLock(l.id); rerender() }} className="btn-ghost text-xs">{l.locked ? '🔒' : '🔓'}</button>
              {layers.length > 1 && <button title="Delete layer" onClick={() => { try { mgr.deleteLayer(l.id) } catch (e: any) { showStatus(e.message) }; rerender() }} className="btn-ghost text-xs">✕</button>}
            </span>
          </div>
        ))}
        <div className="flex gap-2">
          <input className="input flex-1 text-xs" placeholder="New layer name…" value={newLayerName} onChange={e => setNewLayerName(e.target.value)} />
          <button onClick={() => { if (newLayerName.trim()) { mgr.createLayer(newLayerName.trim()); setNewLayerName(''); rerender() } }} className="btn-ghost text-xs">+ Add layer</button>
        </div>
      </div>

      {/* Add annotation to active layer */}
      <div className="space-y-2">
        <p className="section-label">Add note to active layer</p>
        <div className="flex flex-wrap gap-2 items-end">
          <input className="input flex-1 min-w-40 text-xs" placeholder="Note text…" value={annotText} onChange={e => setAnnotText(e.target.value)} />
          <div><p className="section-label mb-1">Page</p><input type="number" min={1} className="input text-xs" style={{ width: 56 }} value={annotPage} onChange={e => setAnnotPage(parseInt(e.target.value) || 1)} /></div>
          <div><p className="section-label mb-1">X %</p><input type="number" min={0} max={100} className="input text-xs" style={{ width: 56 }} value={annotX} onChange={e => setAnnotX(parseInt(e.target.value) || 0)} /></div>
          <div><p className="section-label mb-1">Y %</p><input type="number" min={0} max={100} className="input text-xs" style={{ width: 56 }} value={annotY} onChange={e => setAnnotY(parseInt(e.target.value) || 0)} /></div>
          <button onClick={addAnnotation} className="btn-primary text-xs">+ Note</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={flattenToPDF} disabled={busy} className="btn-primary text-sm">{busy ? 'Working…' : '⊟ Flatten visible layers to PDF'}</button>
        <button onClick={exportJSON} className="btn-ghost text-sm">Export JSON</button>
        <button onClick={() => importInputRef.current?.click()} className="btn-ghost text-sm">Import JSON</button>
        <input ref={importInputRef} type="file" accept=".json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importJSON(f) }} />
      </div>
    </div>
  )
}

function hexToRgb(hex: string) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return m ? { r: parseInt(m[1], 16) / 255, g: parseInt(m[2], 16) / 255, b: parseInt(m[3], 16) / 255 } : { r: 0.23, g: 0.51, b: 0.96 }
}
