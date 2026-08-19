// ─── VERSION TIME-TRAVEL ───────────────────────────────────────────────────
// Every completed operation automatically snapshots its output into
// IndexedDB, keyed by the source document's fingerprint. The user can browse
// the session's versions, restore any of them as the current output, or diff
// a snapshot's text against the current result. All local — no server, no
// account, clears with the browser's site data.

export interface VersionSnapshot {
  id: string
  docKey: string      // fingerprint of the ORIGINAL uploaded file
  ts: number
  label: string       // tool id that produced it (or 'restore')
  sizeKB: number
  bytes: ArrayBuffer
}

const DB_NAME = 'ce_version_history'
const STORE = 'snapshots'
const MAX_PER_DOC = 20

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = e => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('docKey', 'docKey', { unique: false })
      }
    }
  })
}

export async function docFingerprint(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(`${file.name}:${file.size}`))
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
}

export async function saveSnapshot(docKey: string, bytes: ArrayBuffer, label: string): Promise<void> {
  try {
    const db = await openDb()
    const snap: VersionSnapshot = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      docKey, ts: Date.now(), label,
      sizeKB: Math.round(bytes.byteLength / 1024),
      bytes,
    }
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).add(snap)
    await new Promise<void>(r => { tx.oncomplete = () => r(); tx.onerror = () => r() })

    // Trim to the newest MAX_PER_DOC for this document
    const all = await listSnapshots(docKey)
    if (all.length > MAX_PER_DOC) {
      const excess = all.slice(0, all.length - MAX_PER_DOC)
      const tx2 = db.transaction(STORE, 'readwrite')
      for (const s of excess) tx2.objectStore(STORE).delete(s.id)
      await new Promise<void>(r => { tx2.oncomplete = () => r(); tx2.onerror = () => r() })
    }
    db.close()
  } catch { /* snapshotting must never break the main flow */ }
}

export async function listSnapshots(docKey: string): Promise<VersionSnapshot[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).index('docKey').getAll(docKey)
    req.onsuccess = () => { resolve((req.result as VersionSnapshot[]).sort((a, b) => a.ts - b.ts)); db.close() }
    req.onerror = () => reject(req.error)
  })
}

export async function deleteSnapshot(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).delete(id)
  await new Promise<void>(r => { tx.oncomplete = () => r(); tx.onerror = () => r() })
  db.close()
}

export async function clearSnapshots(docKey: string): Promise<void> {
  const all = await listSnapshots(docKey)
  for (const s of all) await deleteSnapshot(s.id)
}

// ── Text diff between two PDF byte arrays ──────────────────────────────────

export interface DiffLine { kind: 'same' | 'added' | 'removed'; text: string }

export async function diffSnapshotsText(a: ArrayBuffer, b: ArrayBuffer): Promise<DiffLine[]> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

  const extract = async (buf: ArrayBuffer): Promise<string[]> => {
    const doc = await pdfjs.getDocument({ standardFontDataUrl: '/pdf-standard-fonts/', data: buf }).promise
    const lines: string[] = []
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const tc = await page.getTextContent()
      lines.push(...tc.items.map((it: any) => it.str).filter((s: string) => s.trim()))
      page.cleanup()
    }
    await doc.destroy()
    return lines
  }

  const [laFull, lbFull] = await Promise.all([extract(a.slice(0)), extract(b.slice(0))])

  // LCS is O(n·m) in memory — cap line counts so huge documents degrade to a
  // prefix diff instead of exhausting the browser tab.
  const MAX_LINES = 1500
  const la = laFull.slice(0, MAX_LINES)
  const lb = lbFull.slice(0, MAX_LINES)

  // Simple LCS diff
  const n = la.length, m = lb.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = la[i] === lb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])

  const out: DiffLine[] = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (la[i] === lb[j]) { out.push({ kind: 'same', text: la[i] }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ kind: 'removed', text: la[i] }); i++ }
    else { out.push({ kind: 'added', text: lb[j] }); j++ }
  }
  while (i < n) out.push({ kind: 'removed', text: la[i++] })
  while (j < m) out.push({ kind: 'added', text: lb[j++] })
  if (laFull.length > MAX_LINES || lbFull.length > MAX_LINES)
    out.push({ kind: 'added', text: `… diff truncated to the first ${MAX_LINES} text lines (document too large) …` })
  return out
}
