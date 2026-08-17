'use client'

import { useEffect, useRef, useState } from 'react'
import { watchFolder, canUseFsAccess, WatchHandle } from '@/utils/interop'
import { compressPDF } from '@/utils/pdfOperations'
import { batesNumberPDF } from '@/utils/gapFillers'

interface Props {
  showStatus: (msg: string, dur?: number) => void
}

/**
 * Watch Folder — v10 automation gap-fill.
 *
 * The browser equivalent of a desktop "hot folder": pick any local or
 * network-mounted directory, choose an automation, and every new PDF that
 * lands in it is processed automatically and written back as
 * `ce-<action>-<name>.pdf`. No server, no upload — the File System Access
 * API talks straight to the disk.
 */
export default function WatchFolderTool({ showStatus }: Props) {
  const [watching, setWatching] = useState<WatchHandle | null>(null)
  const [action, setAction] = useState<'compress' | 'bates'>('compress')
  const [batesPrefix, setBatesPrefix] = useState('SCAN-')
  const [processed, setProcessed] = useState<string[]>([])
  const [supported] = useState(() => canUseFsAccess())
  const dirRef = useRef<any>(null)

  useEffect(() => () => watching?.stop(), [watching])

  const processFile = async (f: File) => {
    let blob: Blob
    if (action === 'compress') blob = await compressPDF(f)
    else blob = await batesNumberPDF(f, { prefix: batesPrefix, start: 1, digits: 6, position: 'bottom-right', fontSize: 10 })

    // Write back next to the original
    if (dirRef.current) {
      try {
        const out = await dirRef.current.getFileHandle(`ce-${action}-${f.name}`, { create: true })
        const w = await out.createWritable()
        await w.write(blob); await w.close()
      } catch {
        // Fall back to download if the handle was read-only
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob); a.download = `ce-${action}-${f.name}`; a.click()
      }
    }
    setProcessed((p) => [`${f.name} → ce-${action}-${f.name}`, ...p].slice(0, 20))
    showStatus(`✓ Auto-processed ${f.name}`)
  }

  const start = async () => {
    try {
      // Request readwrite so we can write results back
      const dir = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
      dirRef.current = dir
      const seen = new Set<string>()
      for await (const [name, h] of (dir as any).entries()) {
        if (h.kind === 'file' && name.toLowerCase().endsWith('.pdf')) seen.add(name)
      }
      let stopped = false
      const tick = async () => {
        if (stopped) return
        const fresh: File[] = []
        for await (const [name, h] of (dir as any).entries()) {
          if (h.kind === 'file' && name.toLowerCase().endsWith('.pdf') && !seen.has(name)) {
            seen.add(name)
            try { fresh.push(await h.getFile()) } catch {}
          }
        }
        for (const f of fresh) { try { await processFile(f) } catch (e: any) { showStatus(`${f.name}: ${e.message}`) } }
        if (!stopped) setTimeout(tick, 4000)
      }
      setTimeout(tick, 4000)
      setWatching({ stop: () => { stopped = true }, dirName: dir.name })
      showStatus(`👁 Watching "${dir.name}" — drop PDFs in it`)
    } catch { showStatus('Folder selection cancelled') }
  }

  if (!supported) {
    return (
      <div className="card space-y-3">
        <p className="font-semibold text-sm">👁 Watch Folder</p>
        <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
          Watch Folder needs the File System Access API (Chrome/Edge desktop). Other browsers: use Batch or Batch v2 instead.
        </p>
      </div>
    )
  }

  return (
    <div className="card space-y-4 animate-scale-in">
      <div className="flex items-center gap-3"><span className="text-xl">👁</span>
        <div><p className="font-semibold text-sm">Watch Folder</p>
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Hot-folder automation: new PDFs in a folder get processed automatically — works on local drives and network shares</p></div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs block mb-1" style={{ color: 'var(--ink-muted)' }}>Automation</label>
          <select value={action} onChange={(e) => setAction(e.target.value as any)}
                  className="w-full text-sm px-3 py-2 rounded-lg"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink)' }}>
            <option value="compress">Compress (smaller copy)</option>
            <option value="bates">Bates-stamp (sequential)</option>
          </select>
        </div>
        {action === 'bates' && (
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--ink-muted)' }}>Bates prefix</label>
            <input value={batesPrefix} onChange={(e) => setBatesPrefix(e.target.value)}
                   className="w-full text-sm px-3 py-2 rounded-lg"
                   style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink)' }} />
          </div>
        )}
      </div>

      {watching ? (
        <button onClick={() => { watching.stop(); setWatching(null); showStatus('Watch stopped') }}
                className="btn-primary w-full" style={{ background: '#dc2626' }}>
          ⏹ Stop watching “{watching.dirName}”
        </button>
      ) : (
        <button onClick={start} className="btn-primary w-full" style={{ background: '#0369a1' }}>
          👁 Pick folder & start watching
        </button>
      )}

      {processed.length > 0 && (
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {processed.map((p, i) => (
            <p key={i} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'var(--green-light)' }}>✓ {p}</p>
          ))}
        </div>
      )}
    </div>
  )
}
