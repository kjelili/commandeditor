'use client'

/**
 * Smart TOC — auto-detects headings via font-size/weight heuristics
 * (lib/toc-generator.js), lets the user edit the outline, then inserts
 * a clickable table-of-contents page into the PDF with pdf-lib.
 */

import React, { useState } from 'react'
import { SmartTOCGenerator } from '@/lib/toc-generator'

interface Heading { text: string; page: number; level: number }

interface Props {
  file: File
  onComplete: (blob: Blob) => void
  onClose: () => void
  showStatus: (msg: string, dur?: number) => void
}

export default function SmartTOCTool({ file, onComplete, onClose, showStatus }: Props) {
  const [headings, setHeadings] = useState<Heading[]>([])
  const [busy, setBusy] = useState(false)
  const [detected, setDetected] = useState(false)

  const detect = async () => {
    setBusy(true)
    try {
      const pdfjsLib = await import('pdfjs-dist')
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
      const doc = await pdfjsLib.getDocument({ standardFontDataUrl: '/pdf-standard-fonts/', data: await file.arrayBuffer() }).promise
      const gen = new SmartTOCGenerator()
      const result = await gen.generate(doc)
      const flat: Heading[] = result.flat.map((h: any) => ({ text: h.text, page: h.page, level: h.level || 1 }))
      setHeadings(flat)
      setDetected(true)
      showStatus(flat.length ? `Detected ${flat.length} headings` : 'No headings detected — you can add rows manually')
    } catch (e: any) { showStatus('Detection failed: ' + e.message) }
    setBusy(false)
  }

  const insertTOCPage = async () => {
    if (headings.length === 0) { showStatus('No headings to insert'); return }
    setBusy(true)
    try {
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
      const doc = await PDFDocument.load(await file.arrayBuffer())
      const font = await doc.embedFont(StandardFonts.Helvetica)
      const bold = await doc.embedFont(StandardFonts.HelveticaBold)
      const ref = doc.getPage(0).getSize()
      const perPage = Math.floor((ref.height - 140) / 22)
      const tocPageCount = Math.ceil(headings.length / perPage)
      for (let t = 0; t < tocPageCount; t++) {
        const page = doc.insertPage(t, [ref.width, ref.height])
        let y = ref.height - 70
        if (t === 0) { page.drawText('Table of Contents', { x: 50, y, size: 22, font: bold }); y -= 40 }
        for (const h of headings.slice(t * perPage, (t + 1) * perPage)) {
          const indent = 50 + (h.level - 1) * 18
          const label = h.text.length > 70 ? h.text.slice(0, 67) + '…' : h.text
          // page numbers shift by the number of inserted TOC pages
          const target = String(h.page + tocPageCount)
          page.drawText(label, { x: indent, y, size: h.level === 1 ? 12 : 10, font: h.level === 1 ? bold : font })
          page.drawText(target, { x: ref.width - 70, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) })
          y -= 22
        }
      }
      onComplete(new Blob([await doc.save() as BlobPart], { type: 'application/pdf' }))
      showStatus(`✓ TOC page${tocPageCount > 1 ? 's' : ''} inserted (page numbers adjusted)`)
    } catch (e: any) { showStatus('Insert failed: ' + e.message) }
    setBusy(false)
  }

  const exportMarkdown = () => {
    const md = headings.map(h => `${'  '.repeat(h.level - 1)}- ${h.text} (p.${h.page})`).join('\n')
    const blob = new Blob([`# Table of Contents\n\n${md}\n`], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = file.name.replace(/\.pdf$/i, '') + '-toc.md'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 3000)
  }

  const update = (i: number, patch: Partial<Heading>) =>
    setHeadings(prev => prev.map((h, j) => j === i ? { ...h, ...patch } : h))

  return (
    <div className="card space-y-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <div><p className="font-semibold text-sm">🧭 Smart Table of Contents</p>
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Headings detected from font size & weight. Edit, then insert a TOC page.</p></div>
        <button onClick={onClose} className="btn-ghost text-xs">✕ Close</button>
      </div>

      {!detected && <button onClick={detect} disabled={busy} className="btn-primary text-sm">{busy ? 'Analysing…' : 'Detect headings'}</button>}

      {detected && (
        <>
          <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
            {headings.map((h, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <select value={h.level} onChange={e => update(i, { level: parseInt(e.target.value) })} className="input" style={{ width: 58, padding: '4px' }}>
                  {[1, 2, 3, 4].map(l => <option key={l} value={l}>H{l}</option>)}
                </select>
                <input className="input flex-1" style={{ padding: '4px 8px' }} value={h.text} onChange={e => update(i, { text: e.target.value })} />
                <input className="input" style={{ width: 58, padding: '4px 8px' }} type="number" min={1} value={h.page}
                  onChange={e => update(i, { page: parseInt(e.target.value) || 1 })} />
                <button onClick={() => setHeadings(prev => prev.filter((_, j) => j !== i))} className="btn-ghost text-xs">✕</button>
              </div>
            ))}
            <button onClick={() => setHeadings(prev => [...prev, { text: 'New heading', page: 1, level: 1 }])}
              className="btn-ghost w-full text-xs" style={{ border: '1px dashed var(--border)' }}>+ Add row</button>
          </div>
          <div className="flex gap-2">
            <button onClick={insertTOCPage} disabled={busy || headings.length === 0} className="btn-primary text-sm">
              {busy ? 'Working…' : '📑 Insert TOC page'}
            </button>
            <button onClick={exportMarkdown} disabled={headings.length === 0} className="btn-ghost text-sm">Export .md</button>
            <button onClick={detect} disabled={busy} className="btn-ghost text-sm">↺ Re-detect</button>
          </div>
        </>
      )}
    </div>
  )
}
