"use client"

import { useCallback, useEffect, useState } from 'react'
import type { VersionSnapshot, DiffLine } from '@/utils/versionHistory'

// ── Version Time-Travel (v11) ──────────────────────────────────────────────
// Every operation auto-snapshots its output (see page.tsx). This panel is the
// timeline: restore any earlier state as the current output, download it, or
// diff its text against the latest result. Perfect for "wait — go back to
// before I compressed it" moments.

interface Props {
  file: File
  current: Blob | null
  onRestore: (blob: Blob, label: string) => void
  showStatus: (msg: string, duration?: number) => void
  onClose: () => void
}

export default function VersionTravelTool({ file, current, onRestore, showStatus, onClose }: Props) {
  const [docKey, setDocKey] = useState('')
  const [snaps, setSnaps] = useState<VersionSnapshot[]>([])
  const [diff, setDiff] = useState<{ label: string; lines: DiffLine[] } | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const vh = await import('@/utils/versionHistory')
    const key = await vh.docFingerprint(file)
    setDocKey(key)
    setSnaps((await vh.listSnapshots(key)).slice().reverse()) // newest first
  }, [file])

  useEffect(() => { refresh() }, [refresh])

  const restore = (s: VersionSnapshot) => {
    onRestore(new Blob([s.bytes], { type: 'application/pdf' }), `restore:${s.label}`)
    showStatus(`⏪ Restored version from ${new Date(s.ts).toLocaleTimeString()}`)
  }

  const downloadSnap = (s: VersionSnapshot) => {
    const url = URL.createObjectURL(new Blob([s.bytes], { type: 'application/pdf' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${file.name.replace(/\.pdf$/i, '')}-${s.label}-${new Date(s.ts).toISOString().slice(11, 19).replace(/:/g, '')}.pdf`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  const diffSnap = async (s: VersionSnapshot) => {
    if (!current) { showStatus('No current output to diff against'); return }
    setBusy(true)
    try {
      const vh = await import('@/utils/versionHistory')
      const cur = await current.arrayBuffer()
      const lines = await vh.diffSnapshotsText(s.bytes, cur)
      setDiff({ label: s.label, lines })
    } catch (e: any) { showStatus('Diff failed: ' + (e?.message || e), 6000) }
    finally { setBusy(false) }
  }

  const remove = async (id: string) => {
    const vh = await import('@/utils/versionHistory')
    await vh.deleteSnapshot(id)
    refresh()
  }

  const clearAll = async () => {
    const vh = await import('@/utils/versionHistory')
    await vh.clearSnapshots(docKey)
    refresh()
    showStatus('🗑 Version history cleared for this document')
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 18, color: 'var(--ink)' }}>⏳ Version Time-Travel <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--ink-soft)' }}>every operation, snapshot locally</span></h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--ink-soft)' }}>✕</button>
      </div>

      {snaps.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
          No versions yet — run any tool (compress, watermark, sign…) and each result is snapshotted here automatically.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ maxHeight: 300, overflowY: 'auto', display: 'grid', gap: 6 }}>
            {snaps.map(s => (
              <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{s.label}</span>
                <span style={{ color: 'var(--ink-soft)', fontSize: 12 }}>{new Date(s.ts).toLocaleTimeString()} · {s.sizeKB} KB</span>
                <span style={{ flex: 1 }} />
                <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => restore(s)}>⏪ Restore</button>
                <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: 12 }} disabled={busy || !current} onClick={() => diffSnap(s)}>Diff</button>
                <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => downloadSnap(s)}>⬇</button>
                <button onClick={() => remove(s.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444' }}>✕</button>
              </div>
            ))}
          </div>
          <button className="btn-secondary" onClick={clearAll} style={{ justifySelf: 'start' }}>🗑 Clear history for this document</button>
        </div>
      )}

      {diff && (
        <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', background: 'var(--blue-pale, #dbeafe)', fontSize: 13, fontWeight: 600, color: 'var(--ink)', display: 'flex', justifyContent: 'space-between' }}>
            <span>Diff: “{diff.label}” → current output</span>
            <button onClick={() => setDiff(null)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto', padding: 10, fontFamily: 'monospace', fontSize: 12 }}>
            {diff.lines.filter(l => l.kind !== 'same').length === 0 && (
              <p style={{ color: 'var(--ink-soft)' }}>No text differences.</p>
            )}
            {diff.lines.filter(l => l.kind !== 'same').slice(0, 200).map((l, i) => (
              <div key={i} style={{
                padding: '1px 6px', borderRadius: 4, whiteSpace: 'pre-wrap',
                background: l.kind === 'added' ? 'rgba(16,185,129,.15)' : 'rgba(239,68,68,.15)',
                color: l.kind === 'added' ? '#047857' : '#b91c1c',
              }}>
                {l.kind === 'added' ? '+ ' : '− '}{l.text}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
