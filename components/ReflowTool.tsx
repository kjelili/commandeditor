"use client"

import { useEffect, useRef, useState } from 'react'
import { DEFAULT_REFLOW, type ReflowOptions } from '@/utils/reflow'

// ── Dyslexia / Low-Vision Reflow (v11) ─────────────────────────────────────
// Rebuilds the document under the reader's own rules and previews it live:
// large type, wide spacing, short measure, tinted paper, focus ruler, and
// read-aloud. Exports a fresh accessible PDF with the same settings.

interface Props {
  file: File
  showStatus: (msg: string, duration?: number) => void
  onClose: () => void
}

const PAPERS = [
  { id: 'cream', label: 'Cream', bg: '#fdf6e3', ink: '#3b3b2f' },
  { id: 'white', label: 'White', bg: '#ffffff', ink: '#1a1a1a' },
  { id: 'blue', label: 'Blue tint', bg: '#e8f1fb', ink: '#16324f' },
  { id: 'dark', label: 'Dark', bg: '#141821', ink: '#e8e6df' },
] as const

const FONTS = [
  { id: 'verdana', label: 'Verdana', css: 'Verdana, sans-serif' },
  { id: 'comic', label: 'Comic Sans', css: "'Comic Sans MS', 'Comic Neue', cursive" },
  { id: 'arial', label: 'Arial', css: 'Arial, sans-serif' },
  { id: 'georgia', label: 'Georgia', css: 'Georgia, serif' },
] as const

export default function ReflowTool({ file, showStatus, onClose }: Props) {
  const [pages, setPages] = useState<string[] | null>(null)
  const [opts, setOpts] = useState<ReflowOptions>(DEFAULT_REFLOW)
  const [paper, setPaper] = useState<typeof PAPERS[number]>(PAPERS[0])
  const [fontCss, setFontCss] = useState<string>(FONTS[0].css)
  const [letterSpacing, setLetterSpacing] = useState(0.5)
  const [ruler, setRuler] = useState(true)
  const [rulerY, setRulerY] = useState(120)
  const [speaking, setSpeaking] = useState(false)
  const [busy, setBusy] = useState(false)
  const paneRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const { extractPagesText } = await import('@/utils/reflow')
        setPages(await extractPagesText(file))
      } catch (e: any) { showStatus('Could not extract text: ' + (e?.message || e), 6000) }
    })()
    return () => { try { speechSynthesis.cancel() } catch {} }
  }, [file])

  const read = () => {
    if (speaking) { speechSynthesis.cancel(); setSpeaking(false); return }
    if (!pages) return
    const u = new SpeechSynthesisUtterance(pages.join('\n\n'))
    u.rate = 0.95
    u.onend = () => setSpeaking(false)
    speechSynthesis.speak(u)
    setSpeaking(true)
  }

  const exportPdf = async () => {
    if (!pages) return
    setBusy(true)
    try {
      const { buildReflowedPdf } = await import('@/utils/reflow')
      const bytes = await buildReflowedPdf(pages, opts)
      const url = URL.createObjectURL(new Blob([bytes as any], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url; a.download = file.name.replace(/\.pdf$/i, '') + '-reflowed.pdf'; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      showStatus('✓ Reflowed PDF exported')
    } catch (e: any) { showStatus('Export failed: ' + (e?.message || e), 6000) }
    finally { setBusy(false) }
  }

  const ctl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: 'var(--ink-soft)' }

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 18, color: 'var(--ink)' }}>👁 Reflow Mode <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--ink-soft)' }}>dyslexia &amp; low-vision friendly reading</span></h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--ink-soft)' }}>✕</button>
      </div>

      {!pages ? (
        <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Extracting text…</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12, padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}>
            <label style={ctl}>Font
              <select value={fontCss} onChange={e => setFontCss(e.target.value)} style={{ padding: 4 }}>
                {FONTS.map(f => <option key={f.id} value={f.css}>{f.label}</option>)}
              </select>
            </label>
            <label style={ctl}>Size {opts.fontSize}pt
              <input type="range" min={12} max={32} value={opts.fontSize} onChange={e => setOpts(o => ({ ...o, fontSize: +e.target.value }))} />
            </label>
            <label style={ctl}>Line ×{opts.lineHeight.toFixed(1)}
              <input type="range" min={1.2} max={2.6} step={0.1} value={opts.lineHeight} onChange={e => setOpts(o => ({ ...o, lineHeight: +e.target.value }))} />
            </label>
            <label style={ctl}>Letter +{letterSpacing.toFixed(1)}
              <input type="range" min={0} max={3} step={0.1} value={letterSpacing} onChange={e => setLetterSpacing(+e.target.value)} />
            </label>
            <label style={ctl}>Word +{opts.wordSpacing}
              <input type="range" min={0} max={8} value={opts.wordSpacing} onChange={e => setOpts(o => ({ ...o, wordSpacing: +e.target.value }))} />
            </label>
            <label style={ctl}>Paper
              <select value={paper.id} onChange={e => setPaper(PAPERS.find(p => p.id === e.target.value)!)} style={{ padding: 4 }}>
                {PAPERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
            <label style={{ ...ctl, justifyContent: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={ruler} onChange={e => setRuler(e.target.checked)} /> Focus ruler
            </label>
          </div>

          <div ref={paneRef}
            onMouseMove={e => {
              if (!paneRef.current) return
              const r = paneRef.current.getBoundingClientRect()
              setRulerY(e.clientY - r.top + paneRef.current.scrollTop)
            }}
            style={{ position: 'relative', maxHeight: 380, overflowY: 'auto', borderRadius: 10, padding: '32px 40px', background: paper.bg, color: paper.ink }}>
            {ruler && (
              <div style={{ position: 'absolute', left: 0, right: 0, top: rulerY - 6, height: opts.fontSize * opts.lineHeight + 12, background: 'rgba(37,99,235,0.12)', borderTop: '2px solid rgba(37,99,235,0.5)', borderBottom: '2px solid rgba(37,99,235,0.5)', pointerEvents: 'none' }} />
            )}
            <div style={{
              maxWidth: 620, margin: '0 auto', fontFamily: fontCss, fontSize: opts.fontSize,
              lineHeight: opts.lineHeight, letterSpacing: `${letterSpacing}px`, wordSpacing: `${opts.wordSpacing}px`,
            }}>
              {pages.map((p, i) => (
                <div key={i} style={{ marginBottom: opts.fontSize }}>
                  {p.split('\n').map((line, j) => <p key={j} style={{ margin: `0 0 ${opts.fontSize * 0.4}px` }}>{line}</p>)}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={read}>{speaking ? '⏹ Stop reading' : '🔊 Read aloud'}</button>
            <button className="btn-primary" disabled={busy} onClick={exportPdf}>{busy ? 'Building…' : '📄 Export reflowed PDF'}</button>
          </div>
        </>
      )}
    </div>
  )
}
