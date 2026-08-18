// utils/repairPdf.ts — Stage 2 gap-filler: Repair PDF
//
// Two strategies, both fully client-side:
//  1. rebuild   — byte-level sanitisation (junk before %PDF-, garbage after
//                 %%EOF) + tolerant pdf-lib load + page-level re-copy into a
//                 fresh document (rewrites xref tables, drops broken objects).
//                 Preserves the text layer.
//  2. rasterize — last-resort: pdf.js (Firefox's engine, extremely tolerant)
//                 renders each page to an image which is embedded into a new
//                 PDF. Always works if the file can be displayed at all, but
//                 the text layer is lost.

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

export type RepairMode = 'rebuild' | 'rasterize'
export interface RepairResult { blob: Blob; method: string; pages: number }

/** Trim non-PDF junk around the payload: anything before %PDF- and after
 *  the last %%EOF. Corrupt uploads/email forwards often add both. */
export function sanitisePdfBytes(input: Uint8Array): Uint8Array {
  const latin = new TextDecoder('latin1')
  // Search on a bounded window to avoid decoding multi-GB garbage twice
  const head = latin.decode(input.slice(0, Math.min(input.length, 1024 * 1024)))
  const start = head.indexOf('%PDF-')
  // lastIndexOf over the tail: %%EOF is near the end of healthy files
  const tailStart = Math.max(0, input.length - 1024 * 1024)
  const tail = latin.decode(input.slice(tailStart))
  const eofRel = tail.lastIndexOf('%%EOF')
  const end = eofRel >= 0 ? tailStart + eofRel + 5 : input.length
  if (start <= 0 && end === input.length) return input
  return input.slice(Math.max(0, start), end)
}

async function repairRebuild(bytes: Uint8Array): Promise<RepairResult> {
  const { PDFDocument } = await import('pdf-lib')
  const clean = sanitisePdfBytes(bytes)
  const src = await PDFDocument.load(clean, {
    ignoreEncryption: true,
    updateMetadata: false,
    throwOnInvalidObject: false,
  } as any)
  // Deep re-copy: forces every reachable object into a brand-new file with
  // fresh xref tables; orphaned/broken objects are dropped.
  const out = await PDFDocument.create()
  const pages = await out.copyPages(src, src.getPageIndices())
  pages.forEach(p => out.addPage(p))
  const title = src.getTitle()
  if (title) { try { out.setTitle(title) } catch { /* cosmetic only */ } }
  return { blob: pdfBlob(await out.save()), method: 'structure rebuild', pages: pages.length }
}

async function repairRasterize(bytes: Uint8Array, onProgress?: (p: number, t: number) => void): Promise<RepairResult> {
  const pdfjsLib = await getPdfjs()
  const clean = sanitisePdfBytes(bytes)
  const pdf = await pdfjsLib.getDocument({ data: clean.slice() }).promise
  const { PDFDocument } = await import('pdf-lib')
  const out = await PDFDocument.create()
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise
    const jpgDataUrl = canvas.toDataURL('image/jpeg', 0.92)
    const jpg = await out.embedJpg(jpgDataUrl)
    const p = out.addPage([viewport.width / 2, viewport.height / 2])
    p.drawImage(jpg, { x: 0, y: 0, width: viewport.width / 2, height: viewport.height / 2 })
    onProgress?.(i, pdf.numPages)
  }
  return { blob: pdfBlob(await out.save()), method: 'page rasterization', pages: pdf.numPages }
}

/** Repair a damaged PDF. Tries rebuild first; falls back to rasterize when
 *  mode is 'rebuild' but the structure is unsalvageable. */
export async function repairPDF(file: File, mode: RepairMode, onProgress?: (p: number, t: number) => void): Promise<RepairResult> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (mode === 'rasterize') return repairRasterize(bytes, onProgress)
  try {
    return await repairRebuild(bytes)
  } catch (e) {
    // Structure unsalvageable — but pdf.js might still render it
    if (typeof document !== 'undefined') {
      const res = await repairRasterize(bytes, onProgress)
      return { ...res, method: 'rasterization fallback (structure was unsalvageable)' }
    }
    throw e
  }
}
