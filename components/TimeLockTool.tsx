'use client'

/**
 * Time-Locked Documents — lib/time-lock.js (reworked crypto).
 * Locks any file into a portable .tlock bundle: AES-256-GCM with a
 * PBKDF2 password-derived key, plus an availability window and open limit.
 * The password is the real protection; the time window is enforced by the
 * viewer and is advisory — stated plainly in the UI.
 */

import React, { useState, useRef } from 'react'
import { TimeAccessControl } from '@/lib/time-lock'

interface Props {
  file: File | null
  onClose: () => void
  showStatus: (msg: string, dur?: number) => void
}

export default function TimeLockTool({ file, onClose, showStatus }: Props) {
  const tacRef = useRef(new TimeAccessControl())
  const [tab, setTab] = useState<'lock' | 'unlock'>('lock')
  const [password, setPassword] = useState('')
  const [notBefore, setNotBefore] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [maxOpens, setMaxOpens] = useState('')
  const [recipient, setRecipient] = useState('')
  const [busy, setBusy] = useState(false)
  // unlock
  const [unlockPassword, setUnlockPassword] = useState('')
  const [bundle, setBundle] = useState<any | null>(null)
  const [bundleName, setBundleName] = useState('')
  const unlockInputRef = useRef<HTMLInputElement>(null)

  const lock = async () => {
    if (!file) { showStatus('Upload a file first'); return }
    if (password.length < 8) { showStatus('Use a password of at least 8 characters'); return }
    setBusy(true)
    try {
      const result = await tacRef.current.createTimeLock(new Uint8Array(await file.arrayBuffer()), {
        password,
        fileName: file.name,
        recipient: recipient || null,
        notBefore: notBefore || null,
        expiresAt: expiresAt || null,
        maxOpens: maxOpens ? parseInt(maxOpens) : null,
      })
      const blob = new Blob([JSON.stringify(result)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = file.name.replace(/\.[^.]+$/, '') + '.tlock'
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      showStatus('✓ Locked — .tlock file downloading. Share it and the password separately.')
    } catch (e: any) { showStatus('Lock failed: ' + e.message) }
    setBusy(false)
  }

  const loadBundle = async (f: File) => {
    try { setBundle(JSON.parse(await f.text())); setBundleName(f.name); showStatus(`Loaded ${f.name}`) }
    catch { showStatus('Not a valid .tlock file') }
  }

  const unlock = async () => {
    if (!bundle) { showStatus('Choose a .tlock file first'); return }
    setBusy(true)
    try {
      const { fileBytes, fileName } = await tacRef.current.openDocument(bundle, unlockPassword)
      const type = fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream'
      const blob = new Blob([fileBytes as unknown as BlobPart], { type })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = fileName
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      showStatus('✓ Unlocked — original file downloading')
    } catch (e: any) { showStatus(e.message) }
    setBusy(false)
  }

  return (
    <div className="card space-y-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <div><p className="font-semibold text-sm">⏳ Time-Locked Documents</p>
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>AES-256 encrypted bundles with an availability window. The password is the real lock; dates are enforced by the viewer.</p></div>
        <button onClick={onClose} className="btn-ghost text-xs">✕ Close</button>
      </div>

      <div className="flex gap-1">
        {(['lock', 'unlock'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className="text-xs px-3 py-1.5 rounded-lg font-semibold"
            style={{ background: tab === t ? 'var(--accent)' : 'var(--surface-2)', color: tab === t ? 'white' : 'var(--ink-soft)' }}>
            {t === 'lock' ? '🔒 Lock a file' : '🔓 Open a .tlock'}
          </button>
        ))}
      </div>

      {tab === 'lock' && (
        <>
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>{file ? `Locking: ${file.name}` : 'Upload a file above first.'}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div><p className="section-label mb-1">Password (required, min 8)</p>
              <input type="password" className="input w-full text-sm" value={password} onChange={e => setPassword(e.target.value)} /></div>
            <div><p className="section-label mb-1">Recipient (optional)</p>
              <input className="input w-full text-sm" placeholder="alice@example.com" value={recipient} onChange={e => setRecipient(e.target.value)} /></div>
            <div><p className="section-label mb-1">Available from (optional)</p>
              <input type="datetime-local" className="input w-full text-sm" value={notBefore} onChange={e => setNotBefore(e.target.value)} /></div>
            <div><p className="section-label mb-1">Expires (optional)</p>
              <input type="datetime-local" className="input w-full text-sm" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} /></div>
            <div><p className="section-label mb-1">Max opens (optional)</p>
              <input type="number" min={1} className="input w-full text-sm" placeholder="unlimited" value={maxOpens} onChange={e => setMaxOpens(e.target.value)} /></div>
          </div>
          <button onClick={lock} disabled={busy || !file} className="btn-primary text-sm">{busy ? 'Encrypting…' : '🔒 Create .tlock bundle'}</button>
        </>
      )}

      {tab === 'unlock' && (
        <>
          <div className="flex flex-wrap gap-2 items-end">
            <button onClick={() => unlockInputRef.current?.click()} className="btn-ghost text-sm">{bundleName || 'Choose .tlock file…'}</button>
            <input ref={unlockInputRef} type="file" accept=".tlock,.json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) loadBundle(f) }} />
            <div className="flex-1 min-w-40"><p className="section-label mb-1">Password</p>
              <input type="password" className="input w-full text-sm" value={unlockPassword} onChange={e => setUnlockPassword(e.target.value)} /></div>
            <button onClick={unlock} disabled={busy || !bundle} className="btn-primary text-sm">{busy ? 'Decrypting…' : '🔓 Unlock'}</button>
          </div>
          {bundle && (
            <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
              {bundle.fileName} · created {new Date(bundle.createdAt).toLocaleString()}
              {bundle.notBefore ? ` · from ${new Date(bundle.notBefore).toLocaleString()}` : ''}
              {bundle.expiresAt ? ` · until ${new Date(bundle.expiresAt).toLocaleString()}` : ''}
              {bundle.recipient ? ` · for ${bundle.recipient}` : ''}
            </p>
          )}
        </>
      )}
    </div>
  )
}
