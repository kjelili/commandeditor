'use client'

/**
 * Batch Engine v2 — conditional rules over multiple files
 * (lib/batch-engine.js). The engine's condition/rule logic is used as-is;
 * its action stubs are overridden here with the app's real PDF operations.
 * Results download as a ZIP.
 */

import React, { useState, useRef } from 'react'
import { BatchEngine } from '@/lib/batch-engine'

type Condition = { field: string; operator: string; value: string }
type Action = { type: string; params: Record<string, any> }
interface Rule { id?: string; name: string; conditions: Condition[]; actions: Action[] }

const FIELDS = [
  { id: 'name', label: 'File name' },
  { id: 'extension', label: 'Extension' },
  { id: 'size', label: 'Size (KB)' },
  { id: 'pageCount', label: 'Page count' },
]
const OPERATORS = ['contains', 'equals', 'greater_than', 'less_than']
// Only actions with real implementations below are offered:
const ACTIONS = [
  { id: 'compress', label: 'Compress' },
  { id: 'watermark', label: 'Watermark', param: 'text' },
  { id: 'rotate', label: 'Rotate 90°' },
  { id: 'extract_text', label: 'Extract text (.txt)' },
  { id: 'rename', label: 'Rename (prefix)', param: 'prefix' },
]

interface Props {
  files: File[]
  onClose: () => void
  showStatus: (msg: string, dur?: number) => void
}

export default function BatchEngineTool({ files, onClose, showStatus }: Props) {
  const engineRef = useRef<any>(null)
  const [rules, setRules] = useState<Rule[]>([{ name: 'Rule 1', conditions: [{ field: 'extension', operator: 'equals', value: 'pdf' }], actions: [{ type: 'compress', params: {} }] }])
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string[]>([])

  const getEngine = async () => {
    if (engineRef.current) return engineRef.current
    const engine: any = new BatchEngine()
    const ops = await import('@/utils/pdfOperations')
    // Override the engine's stub actions with real implementations.
    // Each returns { blob, name } consumed by the runner below.
    engine.actionCompress = async (fi: any) => ({ blob: await ops.compressPDF(fi.file, 0.7), name: fi.name.replace(/\.pdf$/i, '-compressed.pdf') })
    engine.actionWatermark = async (fi: any, params: any) => {
      const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib')
      const doc = await PDFDocument.load(await fi.file.arrayBuffer())
      const font = await doc.embedFont(StandardFonts.HelveticaBold)
      const text = params.text || 'CONFIDENTIAL'
      doc.getPages().forEach((p: any) => {
        const { width, height } = p.getSize()
        p.drawText(text, { x: width / 2 - font.widthOfTextAtSize(text, 48) / 2, y: height / 2, size: 48, font, color: rgb(0.85, 0.1, 0.1), opacity: 0.25, rotate: degrees(35) })
      })
      return { blob: new Blob([await doc.save() as BlobPart], { type: 'application/pdf' }), name: fi.name.replace(/\.pdf$/i, '-watermarked.pdf') }
    }
    engine.actionRotate = async (fi: any) => {
      const { PDFDocument, degrees } = await import('pdf-lib')
      const doc = await PDFDocument.load(await fi.file.arrayBuffer())
      doc.getPages().forEach((p: any) => p.setRotation(degrees((p.getRotation().angle + 90) % 360)))
      return { blob: new Blob([await doc.save() as BlobPart], { type: 'application/pdf' }), name: fi.name.replace(/\.pdf$/i, '-rotated.pdf') }
    }
    engine.actionExtractText = async (fi: any) => {
      const blob = await ops.extractTextFromPDF(fi.file, 'txt')
      return { blob, name: fi.name.replace(/\.pdf$/i, '.txt') }
    }
    engine.actionRename = async (fi: any, params: any) => ({ blob: fi.file, name: `${params.prefix || 'batch-'}${fi.name}` })
    engineRef.current = engine
    return engine
  }

  const run = async () => {
    if (files.length === 0) { showStatus('Upload files first'); return }
    setBusy(true); setLog([])
    const newLog: string[] = []
    try {
      const engine = await getEngine()
      const pdfjsLib = await import('pdfjs-dist')
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs'
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      let outputs = 0

      for (const file of files) {
        let pageCount = 0
        if (file.name.toLowerCase().endsWith('.pdf')) {
          try { pageCount = (await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise).numPages } catch {}
        }
        const fileInfo = {
          file, name: file.name,
          extension: file.name.split('.').pop()?.toLowerCase() || '',
          size: Math.round(file.size / 1024), pageCount,
        }
        for (const rule of rules) {
          const matched = engine.evaluateConditions(rule.conditions, fileInfo)
          if (!matched) { newLog.push(`— ${file.name}: no match for "${rule.name}"`); continue }
          for (const action of rule.actions) {
            try {
              const result = await engine.executeAction(action, fileInfo, {})
              if (result?.blob) { zip.file(result.name, result.blob); outputs++ }
              newLog.push(`✓ ${file.name}: ${action.type} → ${result?.name || 'done'}`)
            } catch (e: any) { newLog.push(`✗ ${file.name}: ${action.type} failed — ${e.message}`) }
          }
        }
      }
      setLog(newLog)
      if (outputs > 0) {
        const blob = await zip.generateAsync({ type: 'blob' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = 'batch-results.zip'
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(url), 5000)
        showStatus(`✓ ${outputs} file${outputs > 1 ? 's' : ''} processed — ZIP downloading`)
      } else showStatus('No files matched any rule')
    } catch (e: any) { showStatus('Batch run failed: ' + e.message) }
    setBusy(false)
  }

  const updateRule = (i: number, patch: Partial<Rule>) => setRules(prev => prev.map((r, j) => j === i ? { ...r, ...patch } : r))

  return (
    <div className="card space-y-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <div><p className="font-semibold text-sm">⚙️ Batch Engine v2</p>
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>IF conditions match THEN run actions — across all uploaded files. Output is a ZIP.</p></div>
        <button onClick={onClose} className="btn-ghost text-xs">✕ Close</button>
      </div>

      {rules.map((rule, ri) => (
        <div key={ri} className="p-3 rounded-xl space-y-2" style={{ background: 'var(--surface-2)' }}>
          <div className="flex items-center gap-2">
            <input className="input text-xs font-semibold" style={{ width: 140 }} value={rule.name} onChange={e => updateRule(ri, { name: e.target.value })} />
            {rules.length > 1 && <button onClick={() => setRules(prev => prev.filter((_, j) => j !== ri))} className="btn-ghost text-xs ml-auto">✕ Remove rule</button>}
          </div>
          <p className="section-label">IF</p>
          {rule.conditions.map((c, ci) => (
            <div key={ci} className="flex flex-wrap gap-1.5 items-center text-xs">
              <select className="input text-xs" value={c.field} onChange={e => { const cs = [...rule.conditions]; cs[ci] = { ...c, field: e.target.value }; updateRule(ri, { conditions: cs }) }}>
                {FIELDS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
              <select className="input text-xs" value={c.operator} onChange={e => { const cs = [...rule.conditions]; cs[ci] = { ...c, operator: e.target.value }; updateRule(ri, { conditions: cs }) }}>
                {OPERATORS.map(o => <option key={o} value={o}>{o.replace('_', ' ')}</option>)}
              </select>
              <input className="input text-xs" style={{ width: 110 }} value={c.value} onChange={e => { const cs = [...rule.conditions]; cs[ci] = { ...c, value: e.target.value }; updateRule(ri, { conditions: cs }) }} />
              {rule.conditions.length > 1 && <button className="btn-ghost text-xs" onClick={() => updateRule(ri, { conditions: rule.conditions.filter((_, j) => j !== ci) })}>✕</button>}
            </div>
          ))}
          <button className="btn-ghost text-xs" onClick={() => updateRule(ri, { conditions: [...rule.conditions, { field: 'name', operator: 'contains', value: '' }] })}>+ condition</button>
          <p className="section-label">THEN</p>
          {rule.actions.map((a, ai) => {
            const def = ACTIONS.find(x => x.id === a.type)
            return (
              <div key={ai} className="flex flex-wrap gap-1.5 items-center text-xs">
                <select className="input text-xs" value={a.type} onChange={e => { const as = [...rule.actions]; as[ai] = { type: e.target.value, params: {} }; updateRule(ri, { actions: as }) }}>
                  {ACTIONS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
                </select>
                {def?.param && (
                  <input className="input text-xs" style={{ width: 150 }} placeholder={def.param}
                    value={a.params[def.param] || ''} onChange={e => { const as = [...rule.actions]; as[ai] = { ...a, params: { ...a.params, [def.param!]: e.target.value } }; updateRule(ri, { actions: as }) }} />
                )}
                {rule.actions.length > 1 && <button className="btn-ghost text-xs" onClick={() => updateRule(ri, { actions: rule.actions.filter((_, j) => j !== ai) })}>✕</button>}
              </div>
            )
          })}
          <button className="btn-ghost text-xs" onClick={() => updateRule(ri, { actions: [...rule.actions, { type: 'compress', params: {} }] })}>+ action</button>
        </div>
      ))}

      <div className="flex gap-2">
        <button className="btn-ghost text-sm" onClick={() => setRules(prev => [...prev, { name: `Rule ${prev.length + 1}`, conditions: [{ field: 'name', operator: 'contains', value: '' }], actions: [{ type: 'compress', params: {} }] }])}>+ Add rule</button>
        <button onClick={run} disabled={busy || files.length === 0} className="btn-primary text-sm">{busy ? 'Running…' : `▶ Run on ${files.length} file${files.length === 1 ? '' : 's'}`}</button>
      </div>

      {log.length > 0 && (
        <div className="space-y-1 max-h-48 overflow-y-auto text-xs font-mono p-3 rounded-xl" style={{ background: 'var(--surface-2)' }}>
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </div>
  )
}
