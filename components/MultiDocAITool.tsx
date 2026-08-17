"use client"

import { useRef, useState } from 'react'
import { MultiDocCorpus, type MultiDocAnswer } from '@/utils/multiDocRag'

// ── Multi-Document AI Q&A (v11) ────────────────────────────────────────────
// One question across every uploaded PDF, answered on-device with citations.
// This is the "chat with the whole case file" feature competitors gate behind
// server uploads — here the bundle never leaves the browser.

interface Props {
  files: File[]
  showStatus: (msg: string, duration?: number) => void
  onClose: () => void
}

export default function MultiDocAITool({ files, showStatus, onClose }: Props) {
  const corpusRef = useRef<MultiDocCorpus | null>(null)
  const [indexed, setIndexed] = useState<string[]>([])
  const [progress, setProgress] = useState('')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<MultiDocAnswer | null>(null)
  const [busy, setBusy] = useState(false)

  const indexAll = async () => {
    setBusy(true)
    try {
      if (!corpusRef.current) corpusRef.current = new MultiDocCorpus()
      const corpus = corpusRef.current
      const added = await corpus.addDocuments(files, setProgress)
      setIndexed([...corpus.docs])
      showStatus(added ? `🧠 Indexed ${corpus.docs.length} document(s), ${corpus.chunks.length} chunks` : 'Documents already indexed')
    } catch (e: any) {
      showStatus('Indexing failed: ' + (e?.message || e), 6000)
    } finally { setBusy(false); setProgress('') }
  }

  const ask = async () => {
    if (!question.trim() || !corpusRef.current) return
    setBusy(true)
    setAnswer(null)
    try {
      const res = await corpusRef.current.query(question.trim())
      setAnswer(res)
    } catch (e: any) {
      showStatus('Query failed: ' + (e?.message || e), 6000)
    } finally { setBusy(false) }
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 18, color: 'var(--ink)' }}>🧠 Multi-Doc Q&A <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--ink-soft)' }}>ask across {files.length} PDFs — on-device</span></h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--ink-soft)' }}>✕</button>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn-primary" disabled={busy} onClick={indexAll}>
            {busy && !answer ? 'Working…' : indexed.length ? '🔄 Re-index documents' : '🧠 Index documents'}
          </button>
          {indexed.length > 0 && <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Indexed: {indexed.join(', ')}</span>}
        </div>
        {progress && <p style={{ fontSize: 12, color: 'var(--accent, #2563eb)', margin: 0 }}>{progress}</p>}
        <p style={{ fontSize: 11, color: 'var(--ink-soft)', margin: 0 }}>
          First index downloads a ~20&nbsp;MB embedding model once (browser-cached). No text ever leaves this device.
        </p>

        {indexed.length > 0 && (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={question} onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !busy && ask()}
                placeholder="Ask a question across all documents…"
                style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)' }} />
              <button className="btn-primary" disabled={busy} onClick={ask}>{busy ? 'Thinking…' : 'Ask'}</button>
            </div>

            {answer && (
              <div style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                <div style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{answer.answer}</div>
                {answer.citations.length > 0 && (
                  <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {answer.citations.map((c, i) => (
                      <span key={i} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'var(--blue-pale, #dbeafe)', color: 'var(--accent, #2563eb)' }}>
                        {c.docName} · p.{c.page}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
