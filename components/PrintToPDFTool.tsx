'use client'

/**
 * Print to PDF — lib/print-driver.js. Renders HTML or plain text through
 * the system print dialog with @page templates (A4, receipt roll, label),
 * where "Save as PDF" produces the file. Nothing leaves the browser.
 */

import React, { useState, useRef } from 'react'
import { PrintToPDF } from '@/lib/print-driver'

interface Props {
  onClose: () => void
  showStatus: (msg: string, dur?: number) => void
}

export default function PrintToPDFTool({ onClose, showStatus }: Props) {
  const driverRef = useRef(new PrintToPDF())
  const [content, setContent] = useState('')
  const [mode, setMode] = useState<'text' | 'html'>('text')
  const [template, setTemplate] = useState('default')
  const [title, setTitle] = useState('Document')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const print = async () => {
    if (!content.trim()) { showStatus('Add some content first'); return }
    try {
      const html = mode === 'html' ? content
        : `<pre style="white-space:pre-wrap;font-family:inherit;margin:0">${content.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`
      const result = await driverRef.current.fromHTML(html, { template, title })
      if (result) showStatus('Print dialog opened — choose "Save as PDF"')
    } catch (e: any) { showStatus('Print failed (popup blocked?): ' + e.message) }
  }

  const loadFile = async (f: File) => {
    setContent(await f.text())
    setMode(f.name.match(/\.html?$/i) ? 'html' : 'text')
    showStatus(`Loaded ${f.name}`)
  }

  return (
    <div className="card space-y-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <div><p className="font-semibold text-sm">🖨 Print to PDF</p>
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Text or HTML → system print dialog → Save as PDF. Includes receipt-roll and label page templates.</p></div>
        <button onClick={onClose} className="btn-ghost text-xs">✕ Close</button>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <div><p className="section-label mb-1">Content type</p>
          <select className="input text-sm" value={mode} onChange={e => setMode(e.target.value as any)}>
            <option value="text">Plain text</option><option value="html">HTML</option>
          </select></div>
        <div><p className="section-label mb-1">Page template</p>
          <select className="input text-sm" value={template} onChange={e => setTemplate(e.target.value)}>
            <option value="default">A4 document</option>
            <option value="receipt">Receipt (80mm roll)</option>
            <option value="label">Label (70×100mm)</option>
          </select></div>
        <div className="flex-1 min-w-32"><p className="section-label mb-1">Title</p>
          <input className="input w-full text-sm" value={title} onChange={e => setTitle(e.target.value)} /></div>
        <button onClick={() => fileInputRef.current?.click()} className="btn-ghost text-sm">Load .txt/.html…</button>
        <input ref={fileInputRef} type="file" accept=".txt,.md,.html,.htm" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f) }} />
      </div>

      <textarea className="input w-full text-xs font-mono" rows={10}
        placeholder={mode === 'html' ? '<h1>Hello</h1>\n<p>Your HTML here…</p>' : 'Type or paste your text here…'}
        value={content} onChange={e => setContent(e.target.value)} />

      <button onClick={print} className="btn-primary text-sm">🖨 Open print dialog</button>
    </div>
  )
}
