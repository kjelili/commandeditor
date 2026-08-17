"use client"

import { useEffect, useState } from 'react'
import type { NotaryProof, VerifyResult } from '@/utils/notarize'

// ── Public-Anchor Notarization (v11) ───────────────────────────────────────
// Anchors the document's SHA-256 into the Bitcoin blockchain via
// OpenTimestamps. Only the hash leaves the device — the document never does.
// Pending proofs are kept in localStorage so the user can come back and
// upgrade them once the calendar has aggregated the anchor into a block.

interface Props {
  file: File
  showStatus: (msg: string, duration?: number) => void
  onClose: () => void
}

const STORE_KEY = 'ce-ots-proofs'

function loadStored(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') } catch { return {} }
}
function saveStored(hash: string, otsB64: string) {
  try {
    const all = loadStored()
    all[hash] = otsB64
    localStorage.setItem(STORE_KEY, JSON.stringify(all))
  } catch {}
}
const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...Array.from(bytes)))
const fromB64 = (s: string) => new Uint8Array(atob(s).split('').map(c => c.charCodeAt(0)))

export default function NotarizeTool({ file, showStatus, onClose }: Props) {
  const [hash, setHash] = useState('')
  const [proof, setProof] = useState<NotaryProof | null>(null)
  const [busy, setBusy] = useState(false)
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null)

  useEffect(() => {
    ;(async () => {
      const { sha256Hex } = await import('@/utils/notarize')
      setHash(await sha256Hex(await file.arrayBuffer()))
    })()
  }, [file])

  const downloadOts = (p: NotaryProof) => {
    const blob = new Blob([p.otsBytes as any], { type: 'application/vnd.opentimestamps.ots' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = p.fileName + '.ots'; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  const doStamp = async () => {
    setBusy(true)
    showStatus('⚓ Anchoring hash to Bitcoin calendars…')
    try {
      const n = await import('@/utils/notarize')
      const p = await n.stamp(file)
      setProof(p)
      saveStored(p.hashHex, toB64(p.otsBytes))
      downloadOts(p)
      showStatus(`⚓ Anchored via ${p.calendars.length} calendar(s) — proof downloads now, confirms on-chain within hours`, 8000)
    } catch (e: any) { showStatus('Stamp failed: ' + (e?.message || e), 6000) }
    finally { setBusy(false) }
  }

  const doUpgrade = async () => {
    if (!proof) return
    setBusy(true)
    try {
      const n = await import('@/utils/notarize')
      const up = await n.upgrade(proof)
      setProof(up)
      if (up.upgraded) {
        saveStored(up.hashHex, toB64(up.otsBytes))
        downloadOts(up)
        showStatus('✓ Proof confirmed on the Bitcoin blockchain — upgraded .ots downloaded', 8000)
      } else {
        showStatus('Still pending — Bitcoin confirmation usually takes 1–12 hours. Come back and click again.', 6000)
      }
    } catch (e: any) { showStatus('Upgrade check failed: ' + (e?.message || e), 6000) }
    finally { setBusy(false) }
  }

  const doVerify = async (otsFile: File) => {
    setBusy(true)
    try {
      const n = await import('@/utils/notarize')
      const res = await n.verify(file, new Uint8Array(await otsFile.arrayBuffer()))
      setVerifyResult(res)
      showStatus(res.matches ? '✓ Proof matches this exact file' : '✗ This proof is for a different file', 6000)
    } catch (e: any) { showStatus('Verify failed: ' + (e?.message || e), 6000) }
    finally { setBusy(false) }
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 18, color: 'var(--ink)' }}>⚓ Notarize <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--ink-soft)' }}>Bitcoin-anchored proof of existence (OpenTimestamps)</span></h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--ink-soft)' }}>✕</button>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
          SHA-256 fingerprint (computed locally — the file itself never leaves this device):
          <code style={{ display: 'block', marginTop: 4, padding: 8, borderRadius: 6, background: 'var(--blue-pale, #dbeafe)', color: 'var(--ink)', wordBreak: 'break-all', fontSize: 11 }}>{hash || '…'}</code>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-primary" disabled={busy || !hash} onClick={doStamp}>{busy ? 'Working…' : '⚓ Anchor to Bitcoin'}</button>
          {proof && (
            <button className="btn-secondary" disabled={busy} onClick={doUpgrade}>
              {proof.upgraded ? '✓ Confirmed on-chain' : '🔄 Check confirmation'}
            </button>
          )}
          {proof && <button className="btn-secondary" onClick={() => downloadOts(proof)}>⬇ .ots proof</button>}
        </div>

        {proof && (
          <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: 0 }}>
            Submitted to: {proof.calendars.join(', ')} · {proof.upgraded ? '✅ confirmed in a Bitcoin block' : '⏳ pending — the calendar will aggregate it into a Bitcoin transaction'}
          </p>
        )}

        <details style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>Verify a proof against this file</summary>
          <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
            <input type="file" accept=".ots" onChange={e => e.target.files?.[0] && doVerify(e.target.files[0])} style={{ fontSize: 12 }} />
            {verifyResult && (
              <div style={{ fontSize: 12, color: 'var(--ink)' }}>
                <div>{verifyResult.matches ? '✅ The .ots proof contains this file\'s exact fingerprint.' : '❌ Fingerprint mismatch — this proof belongs to a different file.'}</div>
                {verifyResult.attestations.length > 0 && <div style={{ marginTop: 4, color: 'var(--ink-soft)' }}>Attestations: {verifyResult.attestations.join(', ')}</div>}
                <div style={{ marginTop: 4, color: 'var(--ink-soft)' }}>Independent check: upload the file + .ots at opentimestamps.org</div>
              </div>
            )}
          </div>
        </details>

        <p style={{ fontSize: 11, color: 'var(--ink-soft)', margin: 0 }}>
          🔒 Only the 32-byte hash is sent to public OpenTimestamps calendars — no document content, no metadata about you.
          The downloaded .ots is a standard OpenTimestamps proof: verify or upgrade it independently at{' '}
          <a href="https://opentimestamps.org" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent, #2563eb)' }}>opentimestamps.org</a>,
          or with the CLI — <code style={{ fontSize: 10 }}>commandeditor verify file.pdf file.pdf.ots</code>.
        </p>
      </div>
    </div>
  )
}
