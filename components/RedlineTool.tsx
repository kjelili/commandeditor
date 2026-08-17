"use client"

import { useState } from 'react'
import type { RedlineChange } from '@/utils/redline'

// ── Negotiation Redline Mode (v11) ─────────────────────────────────────────
// Track-changes for PDF: propose edits, accept/reject, export a clean copy
// or a redlined copy. Built for contract negotiation where Word's Track
// Changes ends the moment the file becomes a PDF.

interface Props {
  file: File
  showStatus: (msg: string, duration?: number) => void
  onClose: () => void
}

export default function RedlineTool({ file, showStatus, onClose }: Props) {
  const [changes, setChanges] = useState<RedlineChange[]>([])
  const [original, setOriginal] = useState('')
  const [proposed, setProposed] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const download = (bytes: Uint8Array | string, name: string, type = 'application/pdf') => {
    const blob = typeof bytes === 'string' ? new Blob([bytes], { type: 'text/markdown' }) : new Blob([bytes as any], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = name; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  const addChange = async () => {
    if (!original.trim() || !proposed.trim()) { showStatus('Enter both the original and proposed text'); return }
    setBusy(true)
    try {
      const { findText } = await import('@/utils/redline')
      const hit = await findText(file, original.trim())
      if (!hit) { showStatus('⚠ That text was not found in the PDF — check spelling/spacing', 6000); return }
      setChanges(prev => [...prev, {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        page: hit.page, original: original.trim(), proposed: proposed.trim(),
        note: note.trim() || undefined, state: 'proposed',
      }])
      setOriginal(''); setProposed(''); setNote('')
      showStatus(`✏ Change proposed on page ${hit.page}`)
    } finally { setBusy(false) }
  }

  const setState = (id: string, state: RedlineChange['state']) =>
    setChanges(prev => prev.map(c => c.id === id ? { ...c, state } : c))

  const exportPdf = async (mode: 'clean' | 'redline') => {
    setBusy(true)
    showStatus(mode === 'clean' ? 'Applying accepted changes…' : 'Drawing redline markup…')
    try {
      const { applyRedlines } = await import('@/utils/redline')
      const bytes = await applyRedlines(file, changes, mode)
      download(bytes, file.name.replace(/\.pdf$/i, '') + (mode === 'clean' ? '-clean.pdf' : '-redline.pdf'))
      showStatus(mode === 'clean' ? '✓ Clean copy exported' : '✓ Redline copy exported')
    } catch (e: any) { showStatus('Export failed: ' + (e?.message || e), 6000) }
    finally { setBusy(false) }
  }

  const exportTrail = async () => {
    const { redlineTrailMarkdown } = await import('@/utils/redline')
    download(redlineTrailMarkdown(file.name, changes), file.name.replace(/\.pdf$/i, '') + '-redline-record.md')
    showStatus('📝 Negotiation record exported')
  }

  const counts = {
    proposed: changes.filter(c => c.state === 'proposed').length,
    accepted: changes.filter(c => c.state === 'accepted').length,
    rejected: changes.filter(c => c.state === 'rejected').length,
  }

  const inputStyle: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 13, width: '100%' }

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 18, color: 'var(--ink)' }}>✒️ Redline Mode <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--ink-soft)' }}>track-changes for PDF negotiation</span></h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--ink-soft)' }}>✕</button>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <input placeholder='Original text in the PDF (e.g. "payment within 30 days")' value={original} onChange={e => setOriginal(e.target.value)} style={inputStyle} />
        <input placeholder='Proposed replacement (e.g. "payment within 14 days")' value={proposed} onChange={e => setProposed(e.target.value)} style={inputStyle} />
        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          <button className="btn-primary" disabled={busy} onClick={addChange}>{busy ? 'Locating…' : '+ Propose change'}</button>
        </div>
      </div>

      {changes.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 12, margin: '12px 0 8px', fontSize: 12, color: 'var(--ink-soft)' }}>
            <span>🔵 {counts.proposed} proposed</span><span>🟢 {counts.accepted} accepted</span><span>🔴 {counts.rejected} rejected</span>
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto', display: 'grid', gap: 6 }}>
            {changes.map(c => (
              <div key={c.id} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 13 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                    color: c.state === 'accepted' ? '#059669' : c.state === 'rejected' ? '#ef4444' : 'var(--accent, #2563eb)' }}>{c.state}</span>
                  <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>p.{c.page}</span>
                  <span style={{ flex: 1 }} />
                  <button onClick={() => setState(c.id, 'accepted')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#059669' }}>✓ accept</button>
                  <button onClick={() => setState(c.id, 'rejected')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444' }}>✗ reject</button>
                  <button onClick={() => setState(c.id, 'proposed')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink-soft)' }}>↺</button>
                </div>
                <div style={{ marginTop: 4, color: 'var(--ink)' }}>
                  <s style={{ color: '#b91c1c' }}>{c.original}</s> → <strong style={{ color: '#047857' }}>{c.proposed}</strong>
                </div>
                {c.note && <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>💬 {c.note}</div>}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <button className="btn-primary" disabled={busy} onClick={() => exportPdf('redline')}>✒️ Export redline copy</button>
            <button className="btn-primary" disabled={busy} onClick={() => exportPdf('clean')}>✨ Export clean copy</button>
            <button className="btn-secondary" onClick={exportTrail}>📝 Negotiation record</button>
          </div>
        </>
      )}
    </div>
  )
}
