'use client'

/**
 * Auto-Redact — pattern-based redaction powered by lib/redaction.js.
 * Scans the text layer for sensitive data (SSNs, cards, emails, …),
 * lets the user review findings, then draws opaque boxes with pdf-lib.
 * Optional flatten pass rasterizes pages so text is truly unrecoverable.
 */

import React, { useState, useEffect, useRef } from 'react'
import { RedactionSuite } from '@/lib/redaction'

interface Finding {
  id: string; pattern: string; patternName: string; category: string
  text: string; page: number; confidence: number
  positions: Array<{ x: number; y: number; width: number; height: number }>
  context: any
}

interface Props {
  file: File
  onComplete: (blob: Blob) => void
  onClose: () => void
  showStatus: (msg: string, dur?: number) => void
}

export default function AutoRedactTool({ file, onComplete, onClose, showStatus }: Props) {
  const suiteRef = useRef(new RedactionSuite())
  const [scanning, setScanning] = useState(false)
  const [applying, setApplying] = useState(false)
  const [findings, setFindings] = useState<Finding[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [scanned, setScanned] = useState(false)
  const [flatten, setFlatten] = useState(true)
  const patterns: any = suiteRef.current.patterns
  const allPatterns: string[] = Object.keys(patterns)
  const [activePatterns, setActivePatterns] = useState<Set<string>>(new Set(allPatterns))

  const scan = async () => {
    setScanning(true)
    try {
      const pdfjsLib = await import('pdfjs-dist')
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
      const doc = await pdfjsLib.getDocument({ standardFontDataUrl: '/pdf-standard-fonts/', data: await file.arrayBuffer() }).promise
      const results: Finding[] = await suiteRef.current.scan(doc, { patterns: Array.from(activePatterns) })
      setFindings(results)
      setSelected(new Set(results.map(f => f.id)))
      setScanned(true)
      showStatus(results.length ? `Found ${results.length} potential item${results.length > 1 ? 's' : ''}` : 'No sensitive data patterns found')
    } catch (e: any) { showStatus('Scan failed: ' + e.message) }
    setScanning(false)
  }

  const apply = async () => {
    const chosen = findings.filter(f => selected.has(f.id))
    if (chosen.length === 0) { showStatus('Nothing selected'); return }
    setApplying(true)
    try {
      const { PDFDocument, rgb } = await import('pdf-lib')
      const doc = await PDFDocument.load(await file.arrayBuffer())
      const pages = doc.getPages()
      const PAD = 1.5
      for (const f of chosen) {
        const page = pages[f.page - 1]
        if (!page) continue
        for (const pos of f.positions) {
          page.drawRectangle({
            x: pos.x - PAD, y: pos.y - PAD,
            width: pos.width + PAD * 2, height: (pos.height || 12) + PAD * 2,
            color: rgb(0, 0, 0),
          })
        }
      }
      let blob = new Blob([await doc.save() as BlobPart], { type: 'application/pdf' })
      if (flatten) {
        // Rasterize so the text layer beneath the boxes is destroyed
        const { flattenPDF } = await import('@/utils/pdfOperations')
        blob = await flattenPDF(new File([blob], file.name, { type: 'application/pdf' }))
      }
      onComplete(blob)
      showStatus(`✓ ${chosen.length} item${chosen.length > 1 ? 's' : ''} redacted${flatten ? ' and flattened' : ''}`)
    } catch (e: any) { showStatus('Redaction failed: ' + e.message) }
    setApplying(false)
  }

  const byCategory: Record<string, Finding[]> = {}
  findings.forEach(f => { (byCategory[f.category] = byCategory[f.category] || []).push(f) })

  return (
    <div className="card space-y-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <div><p className="font-semibold text-sm">🕵️ Auto-Redact Sensitive Data</p>
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Pattern scan → review → permanent redaction. Runs entirely in your browser.</p></div>
        <button onClick={onClose} className="btn-ghost text-xs">✕ Close</button>
      </div>

      {!scanned && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {allPatterns.map(p => (
              <button key={p} onClick={() => setActivePatterns(prev => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n })}
                className="text-xs px-2.5 py-1 rounded-lg font-medium transition-colors"
                style={{ background: activePatterns.has(p) ? 'var(--accent)' : 'var(--surface-2)', color: activePatterns.has(p) ? 'white' : 'var(--ink-soft)' }}>
                {patterns[p].name}
              </button>
            ))}
          </div>
          <button onClick={scan} disabled={scanning || activePatterns.size === 0} className="btn-primary text-sm">
            {scanning ? 'Scanning…' : 'Scan document'}
          </button>
        </>
      )}

      {scanned && findings.length > 0 && (
        <>
          <div className="flex gap-2 text-xs">
            <button onClick={() => setSelected(new Set(findings.map(f => f.id)))} className="btn-ghost">Select all</button>
            <button onClick={() => setSelected(new Set())} className="btn-ghost">Select none</button>
            <button onClick={() => { setScanned(false); setFindings([]) }} className="btn-ghost">↺ Re-scan</button>
          </div>
          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {Object.entries(byCategory).map(([cat, items]) => (
              <div key={cat}>
                <p className="section-label mb-1">{cat} ({items.length})</p>
                {items.map(f => (
                  <label key={f.id} className="flex items-start gap-2 py-1.5 border-b text-xs cursor-pointer" style={{ borderColor: 'var(--border)' }}>
                    <input type="checkbox" checked={selected.has(f.id)}
                      onChange={() => setSelected(prev => { const n = new Set(prev); n.has(f.id) ? n.delete(f.id) : n.add(f.id); return n })} />
                    <span className="font-mono font-semibold">{suiteRef.current.maskText(f.text)}</span>
                    <span style={{ color: 'var(--ink-muted)' }}>{f.patternName} · p.{f.page} · {(f.confidence * 100).toFixed(0)}%</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={flatten} onChange={e => setFlatten(e.target.checked)} />
            Flatten pages after redacting (rasterizes — guarantees text can’t be recovered)
          </label>
          <button onClick={apply} disabled={applying || selected.size === 0} className="btn-primary text-sm" style={{ background: '#1c1917' }}>
            {applying ? 'Redacting…' : `⬛ Redact ${selected.size} selected item${selected.size === 1 ? '' : 's'}`}
          </button>
        </>
      )}
      {scanned && findings.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--green)' }}>✓ No sensitive data patterns detected. <button className="btn-ghost text-xs" onClick={() => setScanned(false)}>Scan again</button></p>
      )}
    </div>
  )
}
