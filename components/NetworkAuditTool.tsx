'use client'

import { useRef, useState } from 'react'
import { startNetworkAudit, stopNetworkAudit, AuditReport } from '@/utils/enterprise'

/**
 * Proof of No Upload — v10 trust signal.
 *
 * Every competitor *says* "private". This makes it verifiable: start an
 * audit, run any tools on real documents, then stop. The auditor wraps
 * fetch/XHR/WebSocket/sendBeacon and counts every byte that tried to leave
 * the device during the window. Verdict CLEAN means zero egress.
 */
export default function NetworkAuditTool() {
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState<AuditReport | null>(null)
  const startRef = useRef<string>('')

  const start = () => {
    startRef.current = new Date().toISOString()
    startNetworkAudit()
    setReport(null); setRunning(true)
  }
  const stop = () => {
    setReport(stopNetworkAudit(startRef.current))
    setRunning(false)
  }

  const downloadReport = () => {
    if (!report) return
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `commandeditor-no-upload-audit-${Date.now()}.json`
    a.click()
  }

  return (
    <div className="card space-y-4 animate-scale-in">
      <div className="flex items-center gap-3"><span className="text-xl">🕵️</span>
        <div><p className="font-semibold text-sm">Proof of No Upload</p>
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Live network audit — verify the privacy claim yourself instead of trusting it</p></div>
      </div>

      <ol className="text-xs space-y-1 pl-4 list-decimal" style={{ color: 'var(--ink-muted)' }}>
        <li>Start the audit below.</li>
        <li>Run any tools on real documents — merge, redact, sign, AI assistant…</li>
        <li>Stop the audit. Every byte that tried to leave is counted and listed.</li>
      </ol>

      {running ? (
        <button onClick={stop} className="btn-primary w-full" style={{ background: '#dc2626' }}>
          ⏹ Stop audit &amp; show verdict
        </button>
      ) : (
        <button onClick={start} className="btn-primary w-full" style={{ background: '#059669' }}>
          ▶ Start network audit
        </button>
      )}
      {running && (
        <p className="text-xs text-center animate-pulse" style={{ color: 'var(--ink-muted)' }}>
          Auditing… go use the toolkit, then come back and stop.
        </p>
      )}

      {report && (
        <div className="space-y-3">
          <div className="px-4 py-3 rounded-xl text-center"
               style={{ background: report.verdict === 'CLEAN' ? 'var(--green-light)' : 'var(--red-light, #fee2e2)' }}>
            <p className="font-bold text-sm">
              {report.verdict === 'CLEAN' ? '✓ CLEAN — zero bytes left this device' : `⚠ ${report.requests.length} outbound request${report.requests.length !== 1 ? 's' : ''} detected`}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--ink-muted)' }}>
              {(report.durationMs / 1000).toFixed(0)}s window · {report.totalBytesOut.toLocaleString()} bytes out
            </p>
          </div>
          {report.requests.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {report.requests.map((r, i) => (
                <div key={i} className="text-xs px-3 py-1.5 rounded-lg font-mono break-all"
                     style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--ink-muted)' }}>[{r.kind}]</span> {r.url} — {r.bytes} B
                </div>
              ))}
            </div>
          )}
          <button onClick={downloadReport} className="btn-ghost text-xs w-full">⬇ Download signed audit report (JSON)</button>
        </div>
      )}
    </div>
  )
}
