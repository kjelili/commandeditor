// utils/pageOps.ts — Stage 1 gap-fillers: reverse order, blank-page removal,
// interleave (duplex-scan fix), split-by-bookmarks.
// All client-side: pdf-lib for structure, pdfjs-dist for inspection.

import { pdfBlob } from './blob'

let _pdfjsReady = false
async function getPdfjs() {
  const lib = await import('pdfjs-dist')
  if (!_pdfjsReady) {
    lib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
    _pdfjsReady = true
  }
  return lib
}

// ─── Reverse Page Order ─────────────────────────────────────────────────────
// Reorders the page tree in place (same document → metadata/outlines survive).
export async function reversePageOrder(file: File): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.load(await file.arrayBuffer())
  const pages = doc.getPages()
  for (let i = pages.length - 1; i >= 0; i--) doc.removePage(i)
  for (const p of pages.reverse()) doc.addPage(p)
  return pdfBlob(await doc.save())
}

// ─── Blank Page Detection ───────────────────────────────────────────────────
// Conservative: a page is blank only if it has NO text, NO images, and NO
// vector drawing ops. Vector-only pages (charts, dividers) are kept.
export async function findBlankPages(file: File): Promise<number[]> {
  const pdfjsLib = await getPdfjs()
  const pdf = await pdfjsLib.getDocument({ standardFontDataUrl: '/pdf-standard-fonts/', data: await file.arrayBuffer() }).promise
  const blanks: number[] = []
  const OPS = pdfjsLib.OPS
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const text = await page.getTextContent()
    const hasText = text.items.some((it: any) => (it.str || '').trim().length > 0)
    let hasVisual = false
    if (!hasText) {
      const opList = await page.getOperatorList()
      for (let j = 0; j < opList.fnArray.length; j++) {
        const fn = opList.fnArray[j]
        if (fn === OPS.paintImageXObject || fn === OPS.paintXObject ||
            fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject ||
            fn === OPS.fill || fn === OPS.stroke || fn === OPS.fillStroke ||
            fn === OPS.eoFill || fn === OPS.eoFillStroke || fn === OPS.shadingFill) {
          hasVisual = true
          break
        }
      }
    }
    if (!hasText && !hasVisual) blanks.push(i - 1) // 0-based page index
  }
  return blanks
}

export async function removePagesByIndex(file: File, removeIdx: number[]): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.load(await file.arrayBuffer())
  const total = doc.getPageCount()
  const keep = removeIdx.filter(i => i >= 0 && i < total)
  if (keep.length >= total) throw new Error('That would remove every page — keeping the last page.')
  for (const i of [...keep].sort((a, b) => b - a)) doc.removePage(i)
  return pdfBlob(await doc.save())
}

// ─── Interleave / Duplex Fix ────────────────────────────────────────────────
// Classic scanner rescue: fronts.pdf (1,2,3…) + backs.pdf (1,2,3… scanned
// after flipping the stack, so usually reversed) → one interleaved document.
export async function interleavePDFs(fileA: File, fileB: File, reverseB: boolean): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib')
  const docA = await PDFDocument.load(await fileA.arrayBuffer())
  const docB = await PDFDocument.load(await fileB.arrayBuffer())
  const idxA = docA.getPageIndices()
  const idxB = docB.getPageIndices()
  if (reverseB) idxB.reverse()
  const out = await PDFDocument.create()
  const max = Math.max(idxA.length, idxB.length)
  const order: Array<{ src: 'A' | 'B'; idx: number }> = []
  for (let i = 0; i < max; i++) {
    if (i < idxA.length) order.push({ src: 'A', idx: idxA[i] })
    if (i < idxB.length) order.push({ src: 'B', idx: idxB[i] })
  }
  for (const step of order) {
    const src = step.src === 'A' ? docA : docB
    const [p] = await out.copyPages(src, [step.idx])
    out.addPage(p)
  }
  const title = docA.getTitle()
  if (title) out.setTitle(title)
  return pdfBlob(await out.save())
}

// ─── Split by Bookmarks ─────────────────────────────────────────────────────
export interface OutlineStart { title: string; pageIndex: number }

// Reads the top-level outline (bookmarks) via pdf.js and resolves each entry
// to a 0-based page index. Entries without a resolvable destination are
// skipped; duplicates and page-0 lead-ins are normalised by the caller.
export async function getOutlineStarts(file: File): Promise<OutlineStart[]> {
  const pdfjsLib = await getPdfjs()
  const pdf = await pdfjsLib.getDocument({ standardFontDataUrl: '/pdf-standard-fonts/', data: await file.arrayBuffer() }).promise
  const outline = await pdf.getOutline()
  if (!outline || outline.length === 0) return []
  const starts: OutlineStart[] = []
  for (const item of outline) {
    try {
      let dest = item.dest
      if (typeof dest === 'string') dest = await pdf.getDestination(dest)
      if (!dest) continue
      const ref = Array.isArray(dest) ? dest[0] : null
      if (!ref) continue
      const pageIndex = await pdf.getPageIndex(ref)
      starts.push({ title: (item.title || 'Section').trim() || 'Section', pageIndex })
    } catch { /* unresolvable destination — skip this entry */ }
  }
  // Sort by page, drop duplicates pointing at the same page
  const seen = new Set<number>()
  return starts
    .sort((a, b) => a.pageIndex - b.pageIndex)
    .filter(s => { if (seen.has(s.pageIndex)) return false; seen.add(s.pageIndex); return true })
}

// Pure: given bookmark start pages (0-based) and a page count, produce
// [start, endInclusive] ranges covering the whole document.
export function computeSplitRanges(starts: number[], pageCount: number): Array<{ start: number; end: number }> {
  const boundaries = [...new Set(starts.filter(s => s > 0 && s < pageCount))].sort((a, b) => a - b)
  const cuts = [0, ...boundaries]
  return cuts.map((start, i) => ({
    start,
    end: i + 1 < cuts.length ? cuts[i + 1] - 1 : pageCount - 1,
  })).filter(r => r.end >= r.start)
}

function safeFileStem(title: string): string {
  const stem = title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60)
  return stem || 'section'
}

// Splits a PDF at bookmark boundaries and returns a ZIP of chapter PDFs.
export async function splitPDFByBookmarks(
  file: File,
  onProgress?: (done: number, total: number) => void
): Promise<{ blob: Blob; chapters: number } | null> {
  const starts = await getOutlineStarts(file)
  const { PDFDocument } = await import('pdf-lib')
  const src = await PDFDocument.load(await file.arrayBuffer())
  const pageCount = src.getPageCount()
  const ranges = computeSplitRanges(starts.map(s => s.pageIndex), pageCount)
  if (ranges.length < 2) return null // nothing meaningful to split

  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i]
    const chunk = await PDFDocument.create()
    const pages = await chunk.copyPages(src, Array.from({ length: r.end - r.start + 1 }, (_, k) => r.start + k))
    pages.forEach(p => chunk.addPage(p))
    const bytes = await chunk.save()
    const title = i === 0 && starts[0]?.pageIndex !== 0 ? 'front-matter' : (starts.find(s => s.pageIndex === r.start)?.title ?? `part-${i + 1}`)
    zip.file(`${String(i + 1).padStart(2, '0')}-${safeFileStem(title)}.pdf`, bytes)
    onProgress?.(i + 1, ranges.length)
  }
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/zip' })
  return { blob, chapters: ranges.length }
}
