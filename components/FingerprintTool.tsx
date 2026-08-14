'use client'

/**
 * Document Fingerprinting — per-recipient traceable copies.
 * Uses lib/fingerprint.js for payload generation; embedding is done here
 * with pdf-lib: the fingerprint ID goes into the PDF Keywords metadata and
 * a faint per-recipient watermark is drawn on each page. The registry lives
 * in localStorage so leaked copies can be attributed with the Verify tab.
 * (The module's invisible word-spacing method needs content-stream rewriting
 * — planned for the desktop build; this metadata+watermark approach is the
 * honest browser-side equivalent.)
 */

import React, { useState, useRef } from 'react'
import { DocumentFingerprinter } from '@/lib/fingerprint'

interface Props {
  file: File
  onClose: () => void
  showStatus: (msg: string, dur?: number) => void
}

const REGISTRY_KEY = 'commandeditor-fingerprints'

export default function FingerprintTool({ file, onClose, showStatus }: Props) {
  const fpRef = useRef(new DocumentFingerprinter())
  const [tab, setTab] = useState<'create' | 'verify'>('create')
  const [recipients, setRecipients] = useState('')
  const [visible, setVisible] = useState(true)
  const [busy, setBusy] = useState(false)
  const [verifyResult, setVerifyResult] = useState<string | null>(null)
  const verifyInputRef = useRef<HTMLInputElement>(null)

  const loadRegistry = (): any[] => { try { return JSON.parse(localStorage.getItem(REGISTRY_KEY) || '[]') } catch { return [] } }

  const create = async () => {
    const names = recipients.split('\n').map(s => s.trim()).filter(Boolean)
    if (names.length === 0) { showStatus('Add at least one recipient'); return }
    setBusy(true)
    try {
      const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib')
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      const registry = loadRegistry()
      const srcBytes = await file.arrayBuffer()

      for (const recipient of names) {
        const fp = fpRef.current.generateFingerprint(file.name, recipient)
        const doc = await PDFDocument.load(srcBytes)
        doc.setKeywords([`ce-fp:${fp.payload}`])
        doc.setProducer('CommandEditor')
        if (visible) {
          const font = await doc.embedFont(StandardFonts.Helvetica)
          const tag = `${recipient} · ${fp.id.slice(3, 11)}`
          doc.getPages().forEach((p: any) => {
            const { width } = p.getSize()
            p.drawText(tag, { x: 24, y: 14, size: 7, font, color: rgb(0.6, 0.6, 0.6), opacity: 0.55 })
            p.drawText(tag, { x: width / 2 - 80, y: 300, size: 28, font, color: rgb(0.5, 0.5, 0.5), opacity: 0.06, rotate: degrees(-35) })
          })
        }
        const outName = file.name.replace(/\.pdf$/i, '') + `_${recipient.replace(/[^a-z0-9]+/gi, '-')}.pdf`
        zip.file(outName, await doc.save())
        registry.push({ id: fp.id, payload: fp.payload, docId: file.name, recipient, createdAt: fp.createdAt })
      }
      localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry))

      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = file.name.replace(/\.pdf$/i, '') + '-fingerprinted.zip'
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      showStatus(`✓ ${names.length} fingerprinted cop${names.length > 1 ? 'ies' : 'y'} created — registry updated`)
    } catch (e: any) { showStatus('Fingerprinting failed: ' + e.message) }
    setBusy(false)
  }

  const verify = async (f: File) => {
    setBusy(true); setVerifyResult(null)
    try {
      const { PDFDocument } = await import('pdf-lib')
      const doc = await PDFDocument.load(await f.arrayBuffer(), { updateMetadata: false })
      const keywords = doc.getKeywords() || ''
      const m = keywords.match(/ce-fp:([^\s,]+)/)
      if (!m) { setVerifyResult('No CommandEditor fingerprint found in this file.'); setBusy(false); return }
      const payload = m[1]
      const hit = loadRegistry().find((r: any) => r.payload === payload)
      setVerifyResult(hit
        ? `✓ Match — issued to "${hit.recipient}" for "${hit.docId}" on ${new Date(hit.createdAt).toLocaleString()}`
        : `Fingerprint present (${payload}) but not in this browser's registry — it was issued elsewhere.`)
    } catch (e: any) { setVerifyResult('Could not read file: ' + e.message) }
    setBusy(false)
  }

  const registry = loadRegistry()

  return (
    <div className="card space-y-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <div><p className="font-semibold text-sm">🫆 Document Fingerprinting</p>
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Traceable per-recipient copies — find out who leaked a document.</p></div>
        <button onClick={onClose} className="btn-ghost text-xs">✕ Close</button>
      </div>

      <div className="flex gap-1">
        {(['create', 'verify'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className="text-xs px-3 py-1.5 rounded-lg font-semibold"
            style={{ background: tab === t ? 'var(--accent)' : 'var(--surface-2)', color: tab === t ? 'white' : 'var(--ink-soft)' }}>
            {t === 'create' ? 'Create copies' : `Verify a copy${registry.length ? ` (${registry.length} issued)` : ''}`}
          </button>
        ))}
      </div>

      {tab === 'create' && (
        <>
          <div>
            <p className="section-label mb-1">Recipients — one per line</p>
            <textarea className="input w-full text-xs font-mono" rows={4} placeholder={'alice@example.com\nbob@example.com'}
              value={recipients} onChange={e => setRecipients(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={visible} onChange={e => setVisible(e.target.checked)} />
            Also draw a faint visible watermark (footer tag + diagonal) — recommended as a deterrent
          </label>
          <button onClick={create} disabled={busy} className="btn-primary text-sm">{busy ? 'Working…' : '🫆 Create fingerprinted copies (ZIP)'}</button>
        </>
      )}

      {tab === 'verify' && (
        <>
          <button onClick={() => verifyInputRef.current?.click()} disabled={busy} className="btn-primary text-sm">Choose a PDF to verify…</button>
          <input ref={verifyInputRef} type="file" accept=".pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) verify(f) }} />
          {verifyResult && <p className="text-xs p-3 rounded-xl" style={{ background: 'var(--surface-2)' }}>{verifyResult}</p>}
        </>
      )}
    </div>
  )
}
