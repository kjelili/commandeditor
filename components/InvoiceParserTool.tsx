'use client'

/**
 * Invoice / Receipt Parser — lib/invoice.js. Extracts vendor, invoice number,
 * dates, line items, totals and tax without any cloud API.
 */

import React, { useState } from 'react'
import { InvoiceParser } from '@/lib/invoice'

interface Props {
  file: File
  onClose: () => void
  showStatus: (msg: string, dur?: number) => void
}

export default function InvoiceParserTool({ file, onClose, showStatus }: Props) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<any | null>(null)
  const parserRef = React.useRef(new InvoiceParser())

  const parse = async () => {
    setBusy(true)
    try {
      const pdfjsLib = await import('pdfjs-dist')
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs'
      const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
      const r = await parserRef.current.parse(doc)
      setResult(r)
      showStatus(`✓ Parsed as ${r.documentType} (${(r.confidence * 100).toFixed(0)}% confidence)`)
    } catch (e: any) { showStatus('Parse failed: ' + e.message) }
    setBusy(false)
  }

  const download = (content: string, ext: string, mime: string) => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = file.name.replace(/\.pdf$/i, '') + '-parsed.' + ext
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 3000)
  }

  return (
    <div className="card space-y-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <div><p className="font-semibold text-sm">🧾 Invoice / Receipt Parser</p>
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Vendor, totals, dates and line items — parsed in your browser.</p></div>
        <button onClick={onClose} className="btn-ghost text-xs">✕ Close</button>
      </div>

      {!result && <button onClick={parse} disabled={busy} className="btn-primary text-sm">{busy ? 'Parsing…' : `Parse ${file.name}`}</button>}

      {result && (
        <>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
            {[
              ['Type', result.documentType],
              ['Vendor', result.vendor?.name || '—'],
              ['Invoice #', result.invoiceNumber || '—'],
              ['Dates', (result.dates || []).slice(0, 2).join(', ') || '—'],
              ['Total', result.totals?.total || result.totals?.grandTotal || '—'],
              ['Tax', result.tax?.amount || result.tax || '—'],
            ].map(([k, v]) => (
              <div key={k as string} className="p-2.5 rounded-xl" style={{ background: 'var(--surface-2)' }}>
                <p className="section-label">{k}</p><p className="font-semibold truncate" title={String(v)}>{String(v)}</p>
              </div>
            ))}
          </div>

          {result.lineItems?.length > 0 && (
            <div className="max-h-56 overflow-y-auto">
              <p className="section-label mb-1">Line items ({result.lineItems.length})</p>
              {result.lineItems.map((li: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs py-1 border-b" style={{ borderColor: 'var(--border)' }}>
                  <span className="flex-1 truncate">{li.description || li.text || JSON.stringify(li)}</span>
                  {li.amount != null && <span className="font-mono font-semibold">{li.amount}</span>}
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => download(parserRef.current.exportToJSON(result), 'json', 'application/json')} className="btn-primary text-sm">⬇ JSON</button>
            <button onClick={() => download(parserRef.current.exportToCSV(result), 'csv', 'text/csv')} className="btn-ghost text-sm">⬇ CSV</button>
            <button onClick={parse} disabled={busy} className="btn-ghost text-sm">↺ Re-parse</button>
          </div>
        </>
      )}
    </div>
  )
}
