'use client'

/**
 * Legal & Academic Citations — lib/citations.js. Finds US case law, USC,
 * CFR, Federal Register, EU cases, DOIs and URLs; grouped review + export.
 */

import React, { useState } from 'react'
import { CitationExtractor } from '@/lib/citations'

interface Props {
  file: File
  onClose: () => void
  showStatus: (msg: string, dur?: number) => void
}

const TYPE_LABELS: Record<string, string> = {
  us_case: 'US Case Law', statute: 'US Code', regulation: 'CFR',
  federal_register: 'Federal Register', eu_case: 'EU Cases', doi: 'DOIs', url: 'URLs',
}

export default function CitationExtractorTool({ file, onClose, showStatus }: Props) {
  const [busy, setBusy] = useState(false)
  const [cites, setCites] = useState<any[] | null>(null)

  const extract = async () => {
    setBusy(true)
    try {
      const pdfjsLib = await import('pdfjs-dist')
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
      const doc = await pdfjsLib.getDocument({ standardFontDataUrl: '/pdf-standard-fonts/', data: await file.arrayBuffer() }).promise
      const results = await new CitationExtractor().extract(doc)
      setCites(results)
      showStatus(results.length ? `✓ ${results.length} citation${results.length > 1 ? 's' : ''} found` : 'No citations found')
    } catch (e: any) { showStatus('Extraction failed: ' + e.message) }
    setBusy(false)
  }

  const exportText = () => {
    if (!cites) return
    const byType: Record<string, any[]> = {}
    cites.forEach(c => { (byType[c.type] = byType[c.type] || []).push(c) })
    const lines: string[] = [`Citations — ${file.name}`, '']
    for (const [type, items] of Object.entries(byType)) {
      lines.push(`## ${TYPE_LABELS[type] || type} (${items.length})`)
      items.forEach(c => lines.push(`- ${c.normalized || c.raw}  (p.${c.page})`))
      lines.push('')
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = file.name.replace(/\.pdf$/i, '') + '-citations.txt'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 3000)
  }

  const byType: Record<string, any[]> = {}
  cites?.forEach(c => { (byType[c.type] = byType[c.type] || []).push(c) })

  return (
    <div className="card space-y-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <div><p className="font-semibold text-sm">⚖️ Legal & Academic Citations</p>
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>US case law, USC, CFR, Fed. Reg., EU cases, DOIs and URLs — extracted locally.</p></div>
        <button onClick={onClose} className="btn-ghost text-xs">✕ Close</button>
      </div>

      {!cites && <button onClick={extract} disabled={busy} className="btn-primary text-sm">{busy ? 'Extracting…' : 'Extract citations'}</button>}

      {cites && cites.length > 0 && (
        <>
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {Object.entries(byType).map(([type, items]) => (
              <div key={type}>
                <p className="section-label mb-1">{TYPE_LABELS[type] || type} ({items.length})</p>
                {items.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs py-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
                    <span className="font-mono">{c.normalized || c.raw}</span>
                    <span style={{ color: 'var(--ink-muted)' }}>p.{c.page}</span>
                    <button onClick={() => { navigator.clipboard.writeText(c.normalized || c.raw); showStatus('Copied') }} className="btn-ghost text-xs ml-auto">Copy</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={exportText} className="btn-primary text-sm">⬇ Export .txt</button>
            <button onClick={extract} disabled={busy} className="btn-ghost text-sm">↺ Re-run</button>
          </div>
        </>
      )}
      {cites && cites.length === 0 && <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>No citations detected in this document.</p>}
    </div>
  )
}
