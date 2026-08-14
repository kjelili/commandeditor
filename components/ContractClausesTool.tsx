'use client'

/**
 * Contract Clause Extractor — lib/clauses.js. Finds termination,
 * indemnification, liability, governing-law and confidentiality provisions,
 * flags risks, and exports a review report. Not legal advice.
 */

import React, { useState, useRef } from 'react'
import { ContractClauseExtractor } from '@/lib/clauses'

interface Props {
  file: File
  onClose: () => void
  showStatus: (msg: string, dur?: number) => void
}

const IMPORTANCE_COLOR: Record<string, string> = { critical: '#dc2626', high: '#ea580c', medium: '#b45309', low: '#059669' }

export default function ContractClausesTool({ file, onClose, showStatus }: Props) {
  const extractorRef = useRef(new ContractClauseExtractor())
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<any | null>(null)

  const extract = async () => {
    setBusy(true)
    try {
      const pdfjsLib = await import('pdfjs-dist')
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs'
      const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
      const r = await extractorRef.current.extract(doc)
      setResult(r)
      const n = r.clauses?.length ?? 0
      showStatus(n ? `✓ ${n} clause${n > 1 ? 's' : ''} identified` : 'No standard clauses matched')
    } catch (e: any) { showStatus('Extraction failed: ' + e.message) }
    setBusy(false)
  }

  const exportReport = () => {
    if (!result) return
    let report: any
    try { report = extractorRef.current.exportToReport(result) } catch { report = result }
    const text = typeof report === 'string' ? report : JSON.stringify(report, null, 2)
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = file.name.replace(/\.pdf$/i, '') + '-clauses.txt'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 3000)
  }

  return (
    <div className="card space-y-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <div><p className="font-semibold text-sm">📜 Contract Clause Extractor</p>
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Pattern-based provision finder — a review aid, not legal advice.</p></div>
        <button onClick={onClose} className="btn-ghost text-xs">✕ Close</button>
      </div>

      {!result && <button onClick={extract} disabled={busy} className="btn-primary text-sm">{busy ? 'Analysing…' : 'Extract clauses'}</button>}

      {result && (
        <>
          {result.summary && <p className="text-xs p-3 rounded-xl" style={{ background: 'var(--surface-2)' }}>{typeof result.summary === 'string' ? result.summary : JSON.stringify(result.summary)}</p>}

          {result.risks?.length > 0 && (
            <div>
              <p className="section-label mb-1">⚠ Risks flagged ({result.risks.length})</p>
              {result.risks.map((r: any, i: number) => (
                <p key={i} className="text-xs py-1" style={{ color: '#dc2626' }}>• {r.message || r.description || JSON.stringify(r)}</p>
              ))}
            </div>
          )}

          {result.clauses?.length > 0 && (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {result.clauses.map((c: any, i: number) => (
                <div key={i} className="p-3 rounded-xl space-y-1" style={{ background: 'var(--surface-2)' }}>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold">{c.title || c.type}</span>
                    <span className="px-1.5 py-0.5 rounded font-semibold" style={{ background: (IMPORTANCE_COLOR[c.importance] || '#6b7280') + '22', color: IMPORTANCE_COLOR[c.importance] || '#6b7280' }}>{c.importance}</span>
                    {c.page && <span style={{ color: 'var(--ink-muted)' }}>p.{c.page}</span>}
                  </div>
                  {c.excerpt && <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>{String(c.excerpt).slice(0, 240)}{String(c.excerpt).length > 240 ? '…' : ''}</p>}
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={exportReport} className="btn-primary text-sm">⬇ Export report</button>
            <button onClick={extract} disabled={busy} className="btn-ghost text-sm">↺ Re-run</button>
          </div>
        </>
      )}
    </div>
  )
}
