'use client'

/**
 * Smart Document Profiler banner — runs lib/profiler.js automatically
 * after upload, shows the detected document type, and suggests tools
 * mapped to this app's actual tool ids.
 */

import React, { useState, useEffect } from 'react'
import { DocumentProfiler } from '@/lib/profiler'

// profile type → real tool ids in the grid
const TYPE_TOOL_MAP: Record<string, Array<{ id: string; label: string }>> = {
  invoice:  [{ id: 'toexcel', label: 'Extract tables' }, { id: 'autoredact', label: 'Auto-redact PII' }, { id: 'piiscan', label: 'PII scan' }],
  contract: [{ id: 'esign', label: 'E-sign' }, { id: 'pdfcompare', label: 'Compare versions' }, { id: 'tamperseal', label: 'Tamper seal' }],
  academic: [{ id: 'citations', label: 'Extract citations' }, { id: 'smarttoc', label: 'Generate TOC' }, { id: 'flashcards', label: 'Flashcards' }],
  form:     [{ id: 'formbuilder', label: 'Form builder' }, { id: 'inplaceedit', label: 'Edit text' }],
  scan:     [{ id: 'ocr', label: 'Run OCR' }, { id: 'compress', label: 'Compress' }],
  report:   [{ id: 'smarttoc', label: 'Generate TOC' }, { id: 'bookmarks', label: 'Bookmarks' }, { id: 'readability', label: 'Readability' }],
  legal:    [{ id: 'autoredact', label: 'Auto-redact' }, { id: 'esign', label: 'E-sign' }, { id: 'microannot', label: 'Annotate' }],
}

interface Props {
  file: File | null
  onSelectTool: (toolId: string) => void
}

export default function ProfilerBanner({ file, onSelectTool }: Props) {
  const [result, setResult] = useState<{ name: string; type: string; confidence: number } | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    setResult(null); setDismissed(false)
    if (!file || !(file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) return
    let cancelled = false
    ;(async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist')
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        const doc = await pdfjsLib.getDocument({ standardFontDataUrl: '/pdf-standard-fonts/', data: await file.arrayBuffer() }).promise
        const profiler = new DocumentProfiler()
        const analysis = await profiler.analyze(doc)
        if (!cancelled && analysis.primary) {
          setResult({ name: analysis.primary.name, type: analysis.primary.type, confidence: analysis.primary.confidence })
        }
      } catch { /* profiling is best-effort */ }
    })()
    return () => { cancelled = true }
  }, [file])

  if (!result || dismissed) return null
  const suggestions = TYPE_TOOL_MAP[result.type] || []

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3 rounded-xl text-xs animate-fade-up"
         style={{ background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.15)' }}>
      <span className="text-base">🧠</span>
      <span style={{ color: 'var(--ink)' }}>
        Looks like <strong>{result.name}</strong> <span style={{ color: 'var(--ink-muted)' }}>({(result.confidence * 100).toFixed(0)}% match)</span>
      </span>
      {suggestions.map(s => (
        <button key={s.id} onClick={() => onSelectTool(s.id)}
          className="px-2.5 py-1 rounded-lg font-semibold transition-colors"
          style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--blue-vivid, #2563eb)' }}>
          {s.label}
        </button>
      ))}
      <button onClick={() => setDismissed(true)} className="ml-auto btn-ghost text-xs" aria-label="Dismiss suggestion">✕</button>
    </div>
  )
}
