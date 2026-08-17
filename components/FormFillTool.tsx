"use client"

import { useState } from 'react'
import type { DetectedField } from '@/utils/formIntelligence'

// ── Form Intelligence + CSV Mail Merge (v11) ──────────────────────────────
// Turn any flat PDF (scanned government form, printed contract, faxed
// intake sheet) into a real fillable AcroForm — then merge a whole CSV of
// respondents into individual filled PDFs. 100% on-device.

interface Props {
  file: File
  showStatus: (msg: string, duration?: number) => void
  onClose: () => void
}

export default function FormFillTool({ file, showStatus, onClose }: Props) {
  const [fields, setFields] = useState<DetectedField[] | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [nameColumn, setNameColumn] = useState('')
  const [busy, setBusy] = useState(false)

  const download = (data: Uint8Array | Blob, name: string, type = 'application/pdf') => {
    const blob = data instanceof Blob ? data : new Blob([data as any], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = name; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  const detect = async () => {
    setDetecting(true)
    showStatus('🔍 Scanning for lines, boxes and blanks…')
    try {
      const { detectFormFields } = await import('@/utils/formIntelligence')
      const found = await detectFormFields(file)
      setFields(found)
      // auto-map CSV columns with the same name
      showStatus(found.length
        ? `🧩 Found ${found.length} candidate fields — rename any, then make it fillable`
        : 'No obvious fields found — this PDF may already be fillable, or fully scanned (try OCR first)', 6000)
    } catch (e: any) {
      showStatus('Detection failed: ' + (e?.message || e), 6000)
    } finally { setDetecting(false) }
  }

  const makeFillable = async () => {
    if (!fields) return
    setBusy(true)
    try {
      const { createFillablePdf } = await import('@/utils/formIntelligence')
      const bytes = await createFillablePdf(file, fields)
      download(bytes, file.name.replace(/\.pdf$/i, '') + '-fillable.pdf')
      showStatus(`✓ Fillable PDF created with ${fields.length} fields`)
    } catch (e: any) { showStatus('Failed: ' + (e?.message || e), 6000) }
    finally { setBusy(false) }
  }

  const onCsvFile = async (f: File) => {
    const text = await f.text()
    setCsvText(text)
    const { parseCsv } = await import('@/utils/formIntelligence')
    const { headers } = parseCsv(text)
    setCsvHeaders(headers)
    // auto-map exact matches
    if (fields) {
      const auto: Record<string, string> = {}
      for (const fld of fields) {
        const hit = headers.find(h => h.toLowerCase().replace(/[^a-z0-9]+/g, '_') === fld.name)
        if (hit) auto[fld.name] = hit
      }
      setMapping(auto)
    }
    showStatus(`📄 CSV loaded — ${headers.length} columns`)
  }

  const runMerge = async () => {
    if (!fields || !csvText) return
    setBusy(true)
    showStatus('🧬 Merging rows into individual PDFs…')
    try {
      const { csvMailMerge, zipResults } = await import('@/utils/formIntelligence')
      const results = await csvMailMerge(file, fields, csvText, mapping, nameColumn)
      const zip = await zipResults(results)
      download(zip, file.name.replace(/\.pdf$/i, '') + '-merged.zip', 'application/zip')
      showStatus(`✓ ${results.length} filled PDFs zipped`)
    } catch (e: any) { showStatus('Merge failed: ' + (e?.message || e), 6000) }
    finally { setBusy(false) }
  }

  const inputStyle: React.CSSProperties = { padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 12, width: '100%' }

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 18, color: 'var(--ink)' }}>📋 Form Intelligence <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--ink-soft)' }}>detect → fillable → mail-merge</span></h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--ink-soft)' }}>✕</button>
      </div>

      {!fields && (
        <div style={{ display: 'grid', gap: 10 }}>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>
            Scans the PDF's vector graphics for ruled lines, boxes, checkbox squares and “____” blanks,
            then synthesizes real fillable fields. Nothing leaves your device.
          </p>
          <button className="btn-primary" disabled={detecting} onClick={detect}>
            {detecting ? 'Scanning…' : '🔍 Detect form fields'}
          </button>
        </div>
      )}

      {fields && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--blue-pale, #dbeafe)' }}>
                  <th style={{ padding: 6, textAlign: 'left' }}>p.</th>
                  <th style={{ padding: 6, textAlign: 'left' }}>type</th>
                  <th style={{ padding: 6, textAlign: 'left' }}>label</th>
                  <th style={{ padding: 6, textAlign: 'left' }}>field name</th>
                  <th style={{ padding: 6 }}></th>
                </tr>
              </thead>
              <tbody>
                {fields.map((f, i) => (
                  <tr key={f.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: 6, color: 'var(--ink-soft)' }}>{f.page}</td>
                    <td style={{ padding: 6 }}>{f.type === 'checkbox' ? '☑' : '✎'}</td>
                    <td style={{ padding: 6, color: 'var(--ink-soft)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.label || '—'}</td>
                    <td style={{ padding: 4 }}>
                      <input value={f.name} style={inputStyle}
                        onChange={e => setFields(prev => prev!.map((x, j) => j === i ? { ...x, name: e.target.value.replace(/[^\w.-]/g, '_') } : x))} />
                    </td>
                    <td style={{ padding: 4 }}>
                      <button onClick={() => setFields(prev => prev!.filter((_, j) => j !== i))}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444' }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-primary" disabled={busy || fields.length === 0} onClick={makeFillable}>
              {busy ? 'Working…' : `✨ Make fillable (${fields.length} fields)`}
            </button>
            <button className="btn-secondary" onClick={() => setFields(null)}>Re-scan</button>
          </div>

          <details style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>🧬 CSV mail-merge → one filled PDF per row</summary>
            <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
              <input type="file" accept=".csv,text/csv" onChange={e => e.target.files?.[0] && onCsvFile(e.target.files[0])} style={{ fontSize: 12 }} />
              {csvHeaders.length > 0 && (
                <>
                  <div style={{ maxHeight: 180, overflowY: 'auto', display: 'grid', gap: 6 }}>
                    {fields.filter(f => f.type === 'text').map(f => (
                      <div key={f.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
                        <span style={{ width: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink)' }}>{f.name}</span>
                        <span style={{ color: 'var(--ink-soft)' }}>←</span>
                        <select value={mapping[f.name] || ''} onChange={e => setMapping(m => ({ ...m, [f.name]: e.target.value }))}
                          style={{ ...inputStyle, flex: 1 }}>
                          <option value="">(skip)</option>
                          {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
                    <span style={{ color: 'var(--ink-soft)' }}>File name column:</span>
                    <select value={nameColumn} onChange={e => setNameColumn(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                      <option value="">(row number)</option>
                      {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                    <button className="btn-primary" disabled={busy} onClick={runMerge}>{busy ? 'Merging…' : 'Merge → ZIP'}</button>
                  </div>
                </>
              )}
            </div>
          </details>
        </div>
      )}
    </div>
  )
}
