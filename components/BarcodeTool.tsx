'use client'

/**
 * Barcode & QR Suite — generation via bwip-js (13 symbologies),
 * QR reading via jsqr. Generate standalone PNGs, stamp barcodes into
 * the uploaded PDF, or scan PDF pages for QR codes.
 */

import React, { useState, useRef, useEffect } from 'react'
import { BarcodeSuite } from '@/lib/barcode'

interface Props {
  file: File | null            // optional: insert into / scan this PDF
  onComplete: (blob: Blob) => void
  onClose: () => void
  showStatus: (msg: string, dur?: number) => void
}

export default function BarcodeTool({ file, onComplete, onClose, showStatus }: Props) {
  const suiteRef = useRef(new BarcodeSuite())
  const previewRef = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState<'generate' | 'scan'>('generate')
  const [format, setFormat] = useState('qrcode')
  const [data, setData] = useState('')
  const [scale, setScale] = useState(3)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // insertion
  const [insertPage, setInsertPage] = useState(1)
  const [posX, setPosX] = useState(75)
  const [posY, setPosY] = useState(85)
  const [widthPt, setWidthPt] = useState(120)
  // scan
  const [scanResults, setScanResults] = useState<Array<{ page: number; data: string }> | null>(null)

  const generate = async () => {
    setBusy(true)
    try {
      const result = await suiteRef.current.generate({ format, data, scale })
      setPreview(result.dataUrl)
      showStatus('✓ Barcode generated')
    } catch (e: any) { setPreview(null); showStatus(e.message) }
    setBusy(false)
  }

  const downloadPNG = () => {
    if (!preview) return
    const a = document.createElement('a'); a.href = preview; a.download = `${format}.png`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
  }

  const insertIntoPDF = async () => {
    if (!file) { showStatus('Upload a PDF first'); return }
    setBusy(true)
    try {
      const { PDFDocument } = await import('pdf-lib')
      const doc = await PDFDocument.load(await file.arrayBuffer())
      await suiteRef.current.insertIntoPDF(doc, insertPage, { format, data, scale }, { xPct: posX, yPct: posY, widthPt })
      onComplete(new Blob([await doc.save() as BlobPart], { type: 'application/pdf' }))
      showStatus(`✓ ${format} stamped on page ${insertPage}`)
    } catch (e: any) { showStatus('Insert failed: ' + e.message) }
    setBusy(false)
  }

  const scanPDF = async () => {
    if (!file) { showStatus('Upload a PDF first'); return }
    setBusy(true)
    try {
      const pdfjsLib = await import('pdfjs-dist')
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs'
      const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
      const found: Array<{ page: number; data: string }> = []
      for (let i = 1; i <= doc.numPages; i++) {
        const r = await suiteRef.current.scanPDFPage(await doc.getPage(i), i)
        if (r) found.push(r)
      }
      setScanResults(found)
      showStatus(found.length ? `✓ ${found.length} QR code${found.length > 1 ? 's' : ''} found` : 'No QR codes found')
    } catch (e: any) { showStatus('Scan failed: ' + e.message) }
    setBusy(false)
  }

  return (
    <div className="card space-y-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <div><p className="font-semibold text-sm">📊 Barcode & QR Suite</p>
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Generate 13 barcode formats, stamp them into PDFs, or scan pages for QR codes.</p></div>
        <button onClick={onClose} className="btn-ghost text-xs">✕ Close</button>
      </div>

      <div className="flex gap-1">
        {(['generate', 'scan'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className="text-xs px-3 py-1.5 rounded-lg font-semibold"
            style={{ background: tab === t ? 'var(--accent)' : 'var(--surface-2)', color: tab === t ? 'white' : 'var(--ink-soft)' }}>
            {t === 'generate' ? 'Generate' : 'Scan PDF (QR)'}
          </button>
        ))}
      </div>

      {tab === 'generate' && (
        <>
          <div className="flex flex-wrap gap-2 items-end">
            <div><p className="section-label mb-1">Format</p>
              <select value={format} onChange={e => setFormat(e.target.value)} className="input text-sm">
                {suiteRef.current.supportedFormats.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select></div>
            <div className="flex-1 min-w-40"><p className="section-label mb-1">Data</p>
              <input className="input w-full text-sm" value={data} onChange={e => setData(e.target.value)} placeholder="URL, text, or digits…" /></div>
            <div><p className="section-label mb-1">Scale</p>
              <input type="number" min={1} max={8} className="input text-sm" style={{ width: 64 }} value={scale} onChange={e => setScale(parseInt(e.target.value) || 3)} /></div>
            <button onClick={generate} disabled={busy || !data} className="btn-primary text-sm">{busy ? '…' : 'Generate'}</button>
          </div>

          {preview && (
            <div className="space-y-3">
              <div ref={previewRef} className="p-4 rounded-xl flex justify-center" style={{ background: 'white', border: '1px solid var(--border)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Generated barcode" style={{ maxWidth: '100%', maxHeight: 180 }} />
              </div>
              <div className="flex flex-wrap gap-2 items-end">
                <button onClick={downloadPNG} className="btn-ghost text-sm">⬇ PNG</button>
                {file && <>
                  <div><p className="section-label mb-1">Page</p>
                    <input type="number" min={1} className="input text-sm" style={{ width: 60 }} value={insertPage} onChange={e => setInsertPage(parseInt(e.target.value) || 1)} /></div>
                  <div><p className="section-label mb-1">X %</p>
                    <input type="number" min={0} max={100} className="input text-sm" style={{ width: 60 }} value={posX} onChange={e => setPosX(parseInt(e.target.value) || 0)} /></div>
                  <div><p className="section-label mb-1">Y %</p>
                    <input type="number" min={0} max={100} className="input text-sm" style={{ width: 60 }} value={posY} onChange={e => setPosY(parseInt(e.target.value) || 0)} /></div>
                  <div><p className="section-label mb-1">Width pt</p>
                    <input type="number" min={30} max={500} className="input text-sm" style={{ width: 70 }} value={widthPt} onChange={e => setWidthPt(parseInt(e.target.value) || 120)} /></div>
                  <button onClick={insertIntoPDF} disabled={busy} className="btn-primary text-sm">Stamp into PDF</button>
                </>}
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'scan' && (
        <>
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
            Renders each page and decodes QR codes with jsqr. Other symbologies aren’t readable yet — generation supports all 13.
          </p>
          <button onClick={scanPDF} disabled={busy || !file} className="btn-primary text-sm">{busy ? 'Scanning…' : file ? `Scan ${file.name}` : 'Upload a PDF first'}</button>
          {scanResults && scanResults.length > 0 && (
            <div className="space-y-1.5">
              {scanResults.map((r, i) => (
                <div key={i} className="flex items-center gap-3 text-xs py-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
                  <span className="font-semibold">p.{r.page}</span>
                  <span className="font-mono break-all">{r.data}</span>
                  <button onClick={() => { navigator.clipboard.writeText(r.data); showStatus('Copied') }} className="btn-ghost text-xs ml-auto">Copy</button>
                </div>
              ))}
            </div>
          )}
          {scanResults && scanResults.length === 0 && <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>No QR codes detected.</p>}
        </>
      )}
    </div>
  )
}
