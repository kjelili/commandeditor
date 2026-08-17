"use client"

import { useState } from 'react'
import type { DeadlineEvent } from '@/utils/deadlineIcs'

// ── Deadline → Calendar (v11) ──────────────────────────────────────────────
// Finds every date in the document, lets you curate the real deadlines, and
// exports a .ics that drops into any calendar app with a 1-day reminder.

interface Props {
  file: File
  showStatus: (msg: string, duration?: number) => void
  onClose: () => void
}

export default function DeadlineTool({ file, showStatus, onClose }: Props) {
  const [events, setEvents] = useState<DeadlineEvent[] | null>(null)
  const [busy, setBusy] = useState(false)

  const scan = async () => {
    setBusy(true)
    showStatus('📅 Scanning for dates…')
    try {
      const { extractDeadlines } = await import('@/utils/deadlineIcs')
      const found = await extractDeadlines(file)
      setEvents(found)
      showStatus(found.length ? `📅 Found ${found.length} dates — uncheck any that aren't deadlines` : 'No dates found in this document', 5000)
    } catch (e: any) { showStatus('Scan failed: ' + (e?.message || e), 6000) }
    finally { setBusy(false) }
  }

  const exportIcs = async () => {
    if (!events) return
    const chosen = events.filter(e => e.selected)
    if (!chosen.length) { showStatus('Select at least one date'); return }
    const { buildIcs } = await import('@/utils/deadlineIcs')
    const ics = buildIcs(chosen, file.name.replace(/\.pdf$/i, ''))
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }))
    const a = document.createElement('a')
    a.href = url
    a.download = file.name.replace(/\.pdf$/i, '') + '-deadlines.ics'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
    showStatus(`✓ ${chosen.length} events exported — open the .ics to add them to your calendar`)
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 18, color: 'var(--ink)' }}>📅 Deadlines → Calendar <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--ink-soft)' }}>.ics export with reminders</span></h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--ink-soft)' }}>✕</button>
      </div>

      {!events ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>
            Extracts every date it can find — court deadlines, payment due dates, submission windows —
            and turns the ones you keep into calendar events.
          </p>
          <button className="btn-primary" disabled={busy} onClick={scan}>{busy ? 'Scanning…' : '📅 Find dates in this PDF'}</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ maxHeight: 300, overflowY: 'auto', display: 'grid', gap: 6 }}>
            {events.map(e => (
              <label key={e.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer' }}>
                <input type="checkbox" checked={e.selected}
                  onChange={() => setEvents(prev => prev!.map(x => x.id === e.id ? { ...x, selected: !x.selected } : x))} />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent, #2563eb)', whiteSpace: 'nowrap' }}>
                  {e.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                <input value={e.title}
                  onChange={ev => setEvents(prev => prev!.map(x => x.id === e.id ? { ...x, title: ev.target.value } : x))}
                  style={{ flex: 1, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 12 }} />
                <span style={{ fontSize: 11, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>p.{e.page}</span>
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={exportIcs}>📥 Export .ics ({events.filter(e => e.selected).length})</button>
            <button className="btn-secondary" onClick={() => setEvents(null)}>Re-scan</button>
          </div>
        </div>
      )}
    </div>
  )
}
