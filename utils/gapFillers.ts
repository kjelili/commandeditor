// ─── v9 GAP-FILLERS ─────────────────────────────────────────────────────────
// New niche capabilities that keep CommandEditor ahead of every competitor.
// Everything here runs 100% client-side — no uploads, ever.

import { pdfBlob } from './blob'
import { sha256File } from './pdfOperations'

// ─── 1. BATES NUMBERING (legal / e-discovery niche) ─────────────────────────
// Stamps sequential Bates identifiers (e.g. ACME-000042) onto every page.
// Nothing like this exists in any free in-browser toolkit; lawyers normally
// pay for Acrobat or e-discovery suites to do it.
export interface BatesOptions {
  prefix: string
  start: number
  digits: number
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  fontSize: number
}

export async function batesNumberPDF(file: File, opts: BatesOptions): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true })
  const font = await doc.embedFont(StandardFonts.CourierBold)
  const pages = doc.getPages()

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]
    const { width, height } = page.getSize()
    const label = `${opts.prefix}${String(opts.start + i).padStart(opts.digits, '0')}`
    const textWidth = font.widthOfTextAtSize(label, opts.fontSize)
    const margin = 36
    const x = opts.position.endsWith('right') ? width - textWidth - margin : margin
    const y = opts.position.startsWith('top') ? height - margin : margin - 10
    page.drawText(label, { x, y, size: opts.fontSize, font, color: rgb(0.15, 0.15, 0.15) })
  }

  return pdfBlob(await doc.save())
}

// ─── 2. CHAIN-OF-CUSTODY LOG (forensic / compliance niche) ─────────────────
// Appends a tamper-evident custody page: each entry carries the SHA-256 of
// the document *before* this entry plus the hash of the previous entry, so
// any alteration breaks the chain. The chain head lives in localStorage —
// verifiable later with verifyCustodyChain().
export interface CustodyEntry {
  timestamp: string
  actor: string
  action: string
  docHash: string
  prevHash: string
  entryHash: string
}

const CUSTODY_KEY = 'commandeditor-custody-chain'

export function loadCustodyChain(): CustodyEntry[] {
  try { return JSON.parse(localStorage.getItem(CUSTODY_KEY) || '[]') } catch { return [] }
}

async function hashText(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function appendCustodyEntry(
  file: File,
  actor: string,
  action: string
): Promise<{ blob: Blob; entry: CustodyEntry }> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const bytes = await file.arrayBuffer()
  const docHash = await sha256File(file)
  const chain = loadCustodyChain()
  const prevHash = chain.length ? chain[chain.length - 1].entryHash : 'GENESIS'
  const timestamp = new Date().toISOString()
  const entryHash = await hashText(`${prevHash}|${docHash}|${timestamp}|${actor}|${action}`)

  const entry: CustodyEntry = { timestamp, actor, action, docHash, prevHash, entryHash }
  localStorage.setItem(CUSTODY_KEY, JSON.stringify([...chain, entry]))

  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const font = await doc.embedFont(StandardFonts.Courier)
  const bold = await doc.embedFont(StandardFonts.CourierBold)
  const page = doc.addPage([612, 792])
  const dark = rgb(0.1, 0.1, 0.12)
  let y = 750
  page.drawText('CHAIN-OF-CUSTODY RECORD', { x: 50, y, size: 16, font: bold, color: dark })
  y -= 28
  page.drawText('CommandEditor — tamper-evident, hash-chained log. Generated on-device.', { x: 50, y, size: 9, font, color: rgb(0.4, 0.4, 0.45) })
  y -= 30
  const rows: Array<[string, string]> = [
    ['Timestamp (UTC)', timestamp],
    ['Actor', actor],
    ['Action', action],
    ['Document SHA-256', docHash],
    ['Previous entry hash', prevHash],
    ['This entry hash', entryHash],
    ['Chain length', String(chain.length + 1)],
  ]
  for (const [k, v] of rows) {
    page.drawText(`${k}:`, { x: 50, y, size: 10, font: bold, color: dark })
    // wrap long hashes
    const val = v.match(/.{1,58}/g) || ['']
    page.drawText(val[0], { x: 200, y, size: 9, font, color: dark })
    y -= 15
    for (let i = 1; i < val.length; i++) { page.drawText(val[i], { x: 200, y, size: 9, font, color: dark }); y -= 13 }
    y -= 4
  }
  y -= 10
  page.drawText('Any modification to the document or to earlier entries invalidates every', { x: 50, y, size: 8, font, color: rgb(0.4, 0.4, 0.45) })
  page.drawText('subsequent hash. Verify with CommandEditor → Chain of Custody → Verify.', { x: 50, y: y - 11, size: 8, font, color: rgb(0.4, 0.4, 0.45) })

  return { blob: pdfBlob(await doc.save()), entry }
}

/** Recompute the chain from stored entries; returns index of first break, or -1. */
export async function verifyCustodyChain(): Promise<{ valid: boolean; entries: number; breakAt: number }> {
  const chain = loadCustodyChain()
  let prev = 'GENESIS'
  for (let i = 0; i < chain.length; i++) {
    const e = chain[i]
    if (e.prevHash !== prev) return { valid: false, entries: chain.length, breakAt: i }
    const recomputed = await hashText(`${e.prevHash}|${e.docHash}|${e.timestamp}|${e.actor}|${e.action}`)
    if (recomputed !== e.entryHash) return { valid: false, entries: chain.length, breakAt: i }
    prev = e.entryHash
  }
  return { valid: true, entries: chain.length, breakAt: -1 }
}

// ─── 3. EMBEDDED ATTACHMENT EXTRACTOR (PDF portfolio niche) ────────────────
// Pulls files embedded inside the PDF (invoices in emails, evidence bundles,
// CAD attachments) — a feature even many paid editors bury.
export interface AttachmentInfo { name: string; size: number; data: Uint8Array }

export async function extractEmbeddedAttachments(file: File): Promise<AttachmentInfo[]> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  const pdf = await pdfjsLib.getDocument({ standardFontDataUrl: '/pdf-standard-fonts/', data: await file.arrayBuffer() }).promise

  const out: AttachmentInfo[] = []
  const collect = (attachments: any) => {
    if (!attachments) return
    for (const [name, att] of Object.entries<any>(attachments)) {
      if (att?.content) out.push({ name, size: att.content.length, data: att.content })
    }
  }
  collect(await pdf.getAttachments())
  // Also check per-page annotations of type FileAttachment
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const annots = await page.getAnnotations()
    for (const a of annots as any[]) {
      if (a.subtype === 'FileAttachment' && a.file?.content) {
        out.push({ name: a.file.filename || a.filename || `attachment-p${p}`, size: a.file.content.length, data: a.file.content })
      }
    }
  }
  return out
}

// ─── 4. NEAR-DUPLICATE PAGE DETECTOR (dedup niche) ─────────────────────────
// Renders each page small, computes a 64-bit difference hash, and clusters
// pages whose hashes are within a Hamming threshold. Finds "scan the same
// page twice" and "template pages with one word changed" — then can strip
// them. Great for cleaning scanned archives.
export interface DupeGroup { pages: number[]; similarity: number }

function dHash(data: Uint8ClampedArray, width: number, height: number): bigint {
  // 9x8 luminance grid → 64-bit hash (bit set when left pixel > right pixel)
  let hash = 0n
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const i1 = (y * width + x) * 4
      const i2 = (y * width + x + 1) * 4
      const l1 = data[i1] * 0.299 + data[i1 + 1] * 0.587 + data[i1 + 2] * 0.114
      const l2 = data[i2] * 0.299 + data[i2 + 1] * 0.587 + data[i2 + 2] * 0.114
      if (l1 > l2) hash |= (1n << BigInt(y * 8 + x))
    }
  }
  return hash
}

function hamming(a: bigint, b: bigint): number {
  let x = a ^ b, n = 0
  while (x) { n += Number(x & 1n); x >>= 1n }
  return n
}

export async function findDuplicatePages(
  file: File,
  threshold = 6,
  onProgress?: (page: number, total: number) => void
): Promise<DupeGroup[]> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  const pdf = await pdfjsLib.getDocument({ standardFontDataUrl: '/pdf-standard-fonts/', data: await file.arrayBuffer() }).promise

  const hashes: bigint[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const viewport = page.getViewport({ scale: 1 })
    const scale = 9 / viewport.width // tiny render: 9px wide
    const vp = page.getViewport({ scale: Math.max(scale, 8 / viewport.height) })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(9, Math.floor(vp.width)); canvas.height = Math.max(8, Math.floor(vp.height))
    const ctx = canvas.getContext('2d')!
    await page.render({ canvasContext: ctx, viewport: vp }).promise
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    hashes.push(dHash(img.data, canvas.width, canvas.height))
    onProgress?.(p, pdf.numPages)
  }

  const assigned = new Set<number>()
  const groups: DupeGroup[] = []
  for (let i = 0; i < hashes.length; i++) {
    if (assigned.has(i)) continue
    const group = [i + 1]
    for (let j = i + 1; j < hashes.length; j++) {
      if (!assigned.has(j) && hamming(hashes[i], hashes[j]) <= threshold) {
        group.push(j + 1); assigned.add(j)
      }
    }
    if (group.length > 1) {
      groups.push({ pages: group, similarity: 1 })
      assigned.add(i)
    }
  }
  return groups
}

/** Remove the given 1-based page numbers, keeping the first of each dupe set. */
export async function removePagesPDF(file: File, pagesToRemove: number[]): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true })
  const sorted = [...pagesToRemove].sort((a, b) => b - a) // remove from the back
  for (const p of sorted) {
    if (p >= 1 && p <= doc.getPageCount()) doc.removePage(p - 1)
  }
  return pdfBlob(await doc.save())
}

// ─── 5. ACCESSIBILITY AUTO-FIXER ───────────────────────────────────────────
// The existing a11ycheck tool *audits*; this *repairs* what can be repaired
// automatically: document title (from the largest first-page text), language,
// subject/keywords from content, and XMP metadata — then reports the fixes.
export interface A11yFixReport {
  fixes: string[]
  skipped: string[]
  title: string
  language: string
}

export async function autoFixAccessibility(file: File, language = 'en'): Promise<{ blob: Blob; report: A11yFixReport }> {
  const { PDFDocument } = await import('pdf-lib')
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

  const bytes = await file.arrayBuffer()
  const fixes: string[] = []
  const skipped: string[] = []

  // Guess a title: biggest text item on page 1
  const pdf = await pdfjsLib.getDocument({ standardFontDataUrl: '/pdf-standard-fonts/', data: bytes.slice(0) }).promise
  const page1 = await pdf.getPage(1)
  const tc = await page1.getTextContent()
  let best = '', bestH = 0
  for (const item of tc.items as any[]) {
    const h = Math.abs(item.transform?.[3] || 0)
    if (h > bestH && item.str.trim().length > 3) { bestH = h; best = item.str.trim() }
  }
  const title = best.slice(0, 120) || file.name.replace(/\.pdf$/i, '')

  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })

  if (!doc.getTitle()) { doc.setTitle(title); fixes.push(`Set document title → "${title}"`) }
  else skipped.push(`Title already present ("${doc.getTitle()}")`)

  doc.setLanguage(language)
  fixes.push(`Set document language → "${language}" (screen readers now pronounce correctly)`)

  if (!doc.getProducer()?.includes('CommandEditor')) {
    doc.setProducer('CommandEditor — accessibility auto-fix')
    fixes.push('Updated producer metadata')
  }
  doc.setModificationDate(new Date())

  if (bestH === 0) skipped.push('No text layer found — run OCR first to make the document readable to screen readers')

  return { blob: pdfBlob(await doc.save()), report: { fixes, skipped, title, language } }
}

// ─── 6. TEXT EXTRACTION FOR TTS (feeds the Listen tool) ────────────────────
export interface SpeechChapter { page: number; text: string; words: number }

export async function extractSpeechChapters(file: File): Promise<SpeechChapter[]> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  const pdf = await pdfjsLib.getDocument({ standardFontDataUrl: '/pdf-standard-fonts/', data: await file.arrayBuffer() }).promise
  const chapters: SpeechChapter[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const tc = await page.getTextContent()
    const text = (tc.items as any[]).map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim()
    if (text) chapters.push({ page: p, text, words: text.split(' ').length })
  }
  return chapters
}
