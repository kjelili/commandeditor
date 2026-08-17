"use client"

import { useState } from 'react'
import type { PdfImage } from '@/utils/altText'

// ── AI Alt-Text (v11) ──────────────────────────────────────────────────────
// Captions every embedded image with a vision model running locally, lets
// the user edit the suggestions, then stamps them into the PDF as invisible
// screen-reader text. WCAG/PDF-UA teams currently pay per-page for this.

interface Props {
  file: File
  showStatus: (msg: string, duration?: number) => void
  onClose: () => void
}

export default function AltTextTool({ file, showStatus, onClose }: Props) {
  const [images, setImages] = useState<PdfImage[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')

  const run = async () => {
    setBusy(true)
    try {
      setProgress('Finding images…')
      const at = await import('@/utils/altText')
      const found = await at.extractImages(file)
      if (!found.length) { setImages([]); showStatus('No embedded images found'); return }
      setImages(found)
      setProgress('Loading captioning model (one-time download)…')
      showStatus('🖼 Captioning images on-device…', 60000)
      const captioned = await at.captionImages(found, (done, total) => setProgress(`Captioning ${done}/${total}…`))
      setImages(captioned)
      showStatus('✓ Captions ready — review and edit below')
    } catch (e: any) { showStatus('Alt-text failed: ' + (e?.message || e), 6000) }
    finally { setBusy(false); setProgress('') }
  }

  const stamp = async () => {
    if (!images) return
    setBusy(true)
    try {
      const at = await import('@/utils/altText')
      const bytes = await at.stampAltText(file, images)
      const url = URL.createObjectURL(new Blob([bytes as any], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url; a.download = file.name.replace(/\.pdf$/i, '') + '-alttext.pdf'; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      showStatus('✓ Alt-text stamped into the PDF (invisible to the eye, readable to screen readers)', 6000)
    } catch (e: any) { showStatus('Stamp failed: ' + (e?.message || e), 6000) }
    finally { setBusy(false) }
  }

  const report = async () => {
    if (!images) return
    const at = await import('@/utils/altText')
    const blob = new Blob([at.altTextReportMarkdown(file.name, images)], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = file.name.replace(/\.pdf$/i, '') + '-alttext-report.md'; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 18, color: 'var(--ink)' }}>🖼 AI Alt-Text <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--ink-soft)' }}>on-device image captioning for accessibility</span></h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--ink-soft)' }}>✕</button>
      </div>

      {!images ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>
            Extracts embedded images and captions each with a vision model in your browser
            (first run downloads the model once; it's cached after that). You review every caption before it's stamped in.
          </p>
          <button className="btn-primary" disabled={busy} onClick={run}>{busy ? (progress || 'Working…') : '🖼 Generate alt-text'}</button>
        </div>
      ) : images.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>No embedded images found in this PDF.</p>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {progress && <p style={{ fontSize: 12, color: 'var(--accent, #2563eb)', margin: 0 }}>{progress}</p>}
          <div style={{ maxHeight: 320, overflowY: 'auto', display: 'grid', gap: 8 }}>
            {images.map((img, i) => (
              <div key={img.id} style={{ display: 'flex', gap: 10, padding: 8, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                <img src={img.dataUrl} alt={`Page ${img.page} figure`} style={{ width: 72, height: 72, objectFit: 'contain', borderRadius: 6, background: '#fff' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 4 }}>Page {img.page} · {img.width}×{img.height}px</div>
                  <input value={img.caption} placeholder="Describe this image for screen readers…"
                    onChange={e => setImages(prev => prev!.map((x, j) => j === i ? { ...x, caption: e.target.value } : x))}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 12 }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-primary" disabled={busy} onClick={stamp}>{busy ? 'Stamping…' : '♿ Stamp alt-text into PDF'}</button>
            <button className="btn-secondary" onClick={report}>📝 Export report</button>
          </div>
        </div>
      )}
    </div>
  )
}
