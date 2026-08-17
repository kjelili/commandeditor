"use client"

import { useEffect, useRef, useState } from 'react'
import type { DetectedField } from '@/utils/formIntelligence'

// ── Voice-Fill Forms (v11) ─────────────────────────────────────────────────
// Hands-free form completion: CommandEditor detects the fields (reusing the
// Stage-3 form intelligence), then walks you through them one by one — speak
// the answer, it transcribes on-device (Whisper, no cloud), fills the field,
// and moves on. Built for accessibility, field work, and anyone whose hands
// are busy. Typing is always available as a fallback.

interface Props {
  file: File
  showStatus: (msg: string, duration?: number) => void
  onClose: () => void
}

export default function VoiceFillTool({ file, showStatus, onClose }: Props) {
  const [fields, setFields] = useState<DetectedField[] | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [idx, setIdx] = useState(0)
  const [listening, setListening] = useState(false)
  const [busy, setBusy] = useState(false)
  const cancelRef = useRef(false)

  useEffect(() => {
    ;(async () => {
      try {
        const { detectFormFields } = await import('@/utils/formIntelligence')
        const found = await detectFormFields(file)
        setFields(found)
        if (!found.length) showStatus('No fields detected — try Form Intelligence to review detection first', 6000)
      } catch (e: any) { showStatus('Detection failed: ' + (e?.message || e), 6000) }
    })()
    return () => { cancelRef.current = true }
  }, [file])

  const field = fields?.[idx]

  const speakValue = async () => {
    if (!field || listening) return
    setListening(true)
    cancelRef.current = false
    try {
      showStatus(`🎙 Listening for “${field.label || field.name}”… (up to 8s)`, 8500)
      const { recordAudio16k, transcribeOnDevice } = await import('@/utils/onDeviceAI')
      const audio = await recordAudio16k(8000)
      if (cancelRef.current) return
      const text = await transcribeOnDevice(audio)
      if (cancelRef.current) return
      if (text) {
        let v = text.replace(/[.?!]+$/, '')
        if (field.type === 'checkbox') {
          v = /^(yes|yeah|yep|check|true|sure|y)/i.test(v) ? 'yes' : 'no'
        }
        setValues(prev => ({ ...prev, [field.name]: v }))
        showStatus(`✓ “${v}”`)
        if (idx < (fields?.length || 1) - 1) setIdx(i => i + 1)
      } else {
        showStatus('Didn\'t catch that — try again or type it')
      }
    } catch (e: any) {
      showStatus('Mic/transcription failed: ' + (e?.message || e), 6000)
    } finally { setListening(false) }
  }

  const fill = async () => {
    if (!fields) return
    setBusy(true)
    showStatus('🎙 Filling the form…')
    try {
      const { fillFormValues } = await import('@/utils/formIntelligence')
      const bytes = await fillFormValues(file, fields, values)
      const url = URL.createObjectURL(new Blob([bytes as any], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url; a.download = file.name.replace(/\.pdf$/i, '') + '-filled.pdf'; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      showStatus(`✓ Filled PDF exported (${Object.values(values).filter(Boolean).length} fields)`)
    } catch (e: any) { showStatus('Fill failed: ' + (e?.message || e), 6000) }
    finally { setBusy(false) }
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 18, color: 'var(--ink)' }}>🎙 Voice-Fill <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--ink-soft)' }}>hands-free form completion, on-device Whisper</span></h3>
        <button onClick={() => { cancelRef.current = true; onClose() }} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--ink-soft)' }}>✕</button>
      </div>

      {!fields ? (
        <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Detecting form fields…</p>
      ) : fields.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>No fields detected. If the PDF is a scan, run OCR first.</p>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
            Field {idx + 1} of {fields.length}
            <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', marginTop: 6 }}>
              <div style={{ height: 4, borderRadius: 2, width: `${((idx + 1) / fields.length) * 100}%`, background: 'var(--accent, #2563eb)', transition: 'width .3s' }} />
            </div>
          </div>

          {field && (
            <div style={{ padding: 14, borderRadius: 10, border: '2px solid var(--accent, #2563eb)', background: 'var(--surface)' }}>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 6 }}>
                {field.type === 'checkbox' ? '☑ Checkbox — say “yes” or “no”' : '✎ Text field'} · page {field.page}
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>
                {field.label || field.name}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={values[field.name] || ''} placeholder="…or type the answer"
                  onChange={e => setValues(prev => ({ ...prev, [field.name]: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter' && idx < fields.length - 1) setIdx(i => i + 1) }}
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)' }} />
                <button className="btn-primary" disabled={listening} onClick={speakValue}
                  style={{ minWidth: 110, background: listening ? '#ef4444' : undefined }}>
                  {listening ? '● Listening…' : '🎙 Speak'}
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-secondary" disabled={idx === 0} onClick={() => setIdx(i => i - 1)}>← Prev</button>
            <button className="btn-secondary" disabled={idx >= fields.length - 1} onClick={() => setIdx(i => i + 1)}>Next →</button>
            <span style={{ flex: 1 }} />
            <button className="btn-primary" disabled={busy} onClick={fill}>{busy ? 'Filling…' : '✓ Export filled PDF'}</button>
          </div>

          {Object.keys(values).length > 0 && (
            <details>
              <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--ink-soft)' }}>
                All answers ({Object.values(values).filter(Boolean).length})
              </summary>
              <div style={{ marginTop: 6, display: 'grid', gap: 4, fontSize: 12 }}>
                {fields.filter(f => values[f.name]).map(f => (
                  <div key={f.id} style={{ display: 'flex', gap: 8 }}>
                    <span style={{ color: 'var(--ink-soft)', minWidth: 140 }}>{f.label || f.name}</span>
                    <span style={{ color: 'var(--ink)' }}>{values[f.name]}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
