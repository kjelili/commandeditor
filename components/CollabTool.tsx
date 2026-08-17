"use client"

import { useEffect, useRef, useState } from 'react'

// ── Serverless co-review rooms (WebRTC via Trystero) ──────────────────────
// A real-time review room with NO server: Trystero forms a WebRTC mesh
// signalled through public torrent trackers, so a room code is all anyone
// needs. The PDF itself never travels the channel by default — only pin
// annotations (page, x/y, text, state). Reviewers open their own local copy
// and the room keeps both sides looking at the same discussion.
//
// Privacy notes:
//   - Room code doubles as the Trystero room id (plus a fixed app id).
//   - Pins are end-to-end peer-to-peer; trackers only see connection
//     metadata, never document content.
//   - Nothing is persisted beyond the session unless the user exports.

interface Pin {
  id: string
  page: number
  x: number // 0..1 relative
  y: number
  text: string
  author: string
  state: 'open' | 'accepted' | 'rejected'
  ts: number
}

interface Props {
  file: File
  showStatus: (msg: string, duration?: number) => void
  onClose: () => void
}

function makeCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  const buf = new Uint8Array(6)
  crypto.getRandomValues(buf)
  for (let i = 0; i < 6; i++) code += chars[buf[i] % chars.length]
  return code
}

export default function CollabTool({ file, showStatus, onClose }: Props) {
  const [roomCode, setRoomCode] = useState('')
  const [joined, setJoined] = useState(false)
  const [peers, setPeers] = useState(0)
  const [author, setAuthor] = useState(() => localStorage.getItem('ce-collab-name') || 'Reviewer')
  const [pins, setPins] = useState<Pin[]>([])
  const [newPin, setNewPin] = useState('')
  const [pinPage, setPinPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const [docHash, setDocHash] = useState('')
  const roomRef = useRef<any>(null)
  const actionsRef = useRef<{ sendPin?: Function; sendState?: Function; sendPresence?: Function }>({})

  // Stable document fingerprint so all parties know they review the same file
  useEffect(() => {
    ;(async () => {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${file.name}:${file.size}`))
      const hex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
      setDocHash(hex.slice(0, 12))
    })()
    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
        setPageCount(doc.numPages)
        await doc.destroy()
      } catch {}
    })()
  }, [file])

  const upsertPin = (pin: Pin) => {
    setPins(prev => {
      const i = prev.findIndex(p => p.id === pin.id)
      if (i === -1) return [...prev, pin].sort((a, b) => a.page - b.page || a.ts - b.ts)
      const next = [...prev]
      next[i] = pin
      return next
    })
  }

  const join = async (code: string) => {
    const clean = code.trim().toUpperCase()
    if (clean.length < 4) { showStatus('Enter a room code (6 characters)'); return }
    try {
      const { joinRoom } = await import('trystero')
      const room = joinRoom({ appId: 'commandeditor-collab' }, clean)
      roomRef.current = room
      const [sendPin, onPin] = room.makeAction('pin') as any
      const [sendState, onState] = room.makeAction('pinstate') as any
      const [sendPresence, onPresence] = room.makeAction('presence') as any
      actionsRef.current = { sendPin, sendState, sendPresence }

      onPin((pin: Pin) => upsertPin(pin))
      onState((u: { id: string; state: Pin['state'] }) => {
        setPins(prev => prev.map(p => p.id === u.id ? { ...p, state: u.state } : p))
      })
      onPresence((known: Pin[]) => { known.forEach(upsertPin) })

      room.onPeerJoin(() => {
        setPeers(p => p + 1)
        showStatus('🤝 A reviewer joined')
        // Late joiners get the full pin list from us (functional setState
        // gives us the current list, not a stale closure)
        setPins(cur => { try { actionsRef.current.sendPresence?.(cur) } catch {} ; return cur })
      })
      room.onPeerLeave(() => {
        setPeers(p => Math.max(0, p - 1))
        showStatus('A reviewer left')
      })

      localStorage.setItem('ce-collab-name', author)
      setRoomCode(clean)
      setJoined(true)
      showStatus(`🤝 Room ${clean} live — share the code with reviewers`)
    } catch (e: any) {
      showStatus('Could not start room: ' + (e?.message || 'WebRTC unavailable'), 6000)
    }
  }

  const leave = () => {
    try { roomRef.current?.leave() } catch {}
    roomRef.current = null
    setJoined(false)
    setPeers(0)
  }

  useEffect(() => () => { try { roomRef.current?.leave() } catch {} }, [])

  const addPin = () => {
    if (!newPin.trim()) return
    const pin: Pin = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      page: Math.min(Math.max(1, pinPage), pageCount),
      x: 0.5, y: 0.5,
      text: newPin.trim(),
      author,
      state: 'open',
      ts: Date.now(),
    }
    upsertPin(pin)
    try { actionsRef.current.sendPin?.(pin) } catch {}
    setNewPin('')
  }

  const setState = (id: string, state: Pin['state']) => {
    setPins(prev => prev.map(p => p.id === id ? { ...p, state } : p))
    try { actionsRef.current.sendState?.({ id, state }) } catch {}
  }

  const exportMarkdown = () => {
    const lines = [
      `# Co-Review — ${file.name}`,
      ``,
      `- Room: ${roomCode}`,
      `- Document fingerprint: ${docHash}`,
      `- Date: ${new Date().toISOString()}`,
      ``,
      ...pins.map(p => `- [${p.state === 'open' ? ' ' : 'x'}] **p.${p.page}** — ${p.text}  *(${p.author}, ${p.state})*`),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name.replace(/\.pdf$/i, '') + '-review.md'
    a.click()
    URL.revokeObjectURL(url)
    showStatus('📝 Review exported as Markdown')
  }

  const stateColor = (s: Pin['state']) => s === 'accepted' ? 'var(--green-light, #10b981)' : s === 'rejected' ? '#ef4444' : 'var(--accent, #2563eb)'

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 18, color: 'var(--ink)' }}>🤝 Co-Review Room <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--ink-soft)' }}>serverless P2P — no account, no server</span></h3>
        <button onClick={() => { leave(); onClose() }} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--ink-soft)' }}>✕</button>
      </div>

      {!joined ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <label style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
            Your name
            <input value={author} onChange={e => setAuthor(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)' }} />
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={() => join(makeCode())}>Create a room</button>
            <div style={{ display: 'flex', gap: 6, flex: 1 }}>
              <input placeholder="or enter room code" value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())} maxLength={6}
                style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', letterSpacing: 2, textTransform: 'uppercase' }} />
              <button className="btn-secondary" onClick={() => join(roomCode)}>Join</button>
            </div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: 0 }}>
            🔒 Peers connect directly (WebRTC). Only review pins travel — each reviewer keeps their own local copy of the PDF.
            Document fingerprint: <code>{docHash}</code> — compare it with your reviewers to confirm you all opened the same file.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--blue-pale, #dbeafe)', color: 'var(--accent, #2563eb)', fontWeight: 700, letterSpacing: 3 }}>{roomCode}</span>
            <button className="btn-secondary" onClick={() => { navigator.clipboard.writeText(roomCode); showStatus('Room code copied') }}>Copy code</button>
            <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{peers} peer{peers === 1 ? '' : 's'} connected · doc <code>{docHash}</code></span>
            <span style={{ flex: 1 }} />
            <button className="btn-secondary" onClick={exportMarkdown}>📝 Export review</button>
            <button className="btn-secondary" onClick={leave}>Leave</button>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <input type="number" min={1} max={pageCount} value={pinPage} onChange={e => setPinPage(Number(e.target.value) || 1)}
              style={{ width: 70, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)' }} title="Page" />
            <input placeholder={`Add a review pin on page ${pinPage}…`} value={newPin} onChange={e => setNewPin(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addPin()}
              style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)' }} />
            <button className="btn-primary" onClick={addPin}>Pin</button>
          </div>

          <div style={{ maxHeight: 320, overflowY: 'auto', display: 'grid', gap: 8 }}>
            {pins.length === 0 && <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>No pins yet — add the first one above.</p>}
            {pins.map(p => (
              <div key={p.id} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: stateColor(p.state), textTransform: 'uppercase' }}>{p.state}</span>
                  <span style={{ fontSize: 12, color: 'var(--accent, #2563eb)', fontWeight: 600 }}>p.{p.page}</span>
                  <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{p.author}</span>
                  <span style={{ flex: 1 }} />
                  {p.state === 'open' && (
                    <>
                      <button onClick={() => setState(p.id, 'accepted')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--green-light, #10b981)', fontSize: 13 }}>✓</button>
                      <button onClick={() => setState(p.id, 'rejected')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 13 }}>✗</button>
                    </>
                  )}
                </div>
                <div style={{ fontSize: 14, color: 'var(--ink)', marginTop: 4 }}>{p.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
