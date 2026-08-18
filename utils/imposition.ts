// utils/imposition.ts — Stage 6 gap-filler: Booklet / N-up Imposition
//
// nupPDF:     place N source pages per sheet in a grid (handouts, review sheets)
// bookletPDF: 2-up saddle-stitch imposition — print double-sided, fold, staple.
//             Pages are reordered so physical sheets come out correctly.

import { pdfBlob } from './blob'

// ─── N-up ───────────────────────────────────────────────────────────────────
export interface NupOptions {
  cols: number                 // e.g. 2
  rows: number                 // e.g. 2  → 4 pages per sheet
  sheetWidth?: number          // default A4 portrait 595x842
  sheetHeight?: number
  margin?: number
  gap?: number
}

export async function nupPDF(file: File, opts: NupOptions): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib')
  const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true } as any)
  const { cols, rows } = opts
  const W = opts.sheetWidth ?? 595, H = opts.sheetHeight ?? 842
  const margin = opts.margin ?? 18, gap = opts.gap ?? 8
  const perSheet = cols * rows
  const cellW = (W - 2 * margin - (cols - 1) * gap) / cols
  const cellH = (H - 2 * margin - (rows - 1) * gap) / rows

  const out = await PDFDocument.create()
  const srcPages = src.getPages()
  for (let i = 0; i < srcPages.length; i++) {
    if (i % perSheet === 0) out.addPage([W, H])
    const sheet = out.getPages()[out.getPageCount() - 1]
    const cell = i % perSheet
    const col = cell % cols, row = Math.floor(cell / cols)
    const embedded = await out.embedPage(srcPages[i])
    const scale = Math.min(cellW / embedded.width, cellH / embedded.height)
    const dw = embedded.width * scale, dh = embedded.height * scale
    sheet.drawPage(embedded, {
      x: margin + col * (cellW + gap) + (cellW - dw) / 2,
      y: H - margin - (row + 1) * cellH - row * gap + (cellH - dh) / 2,
      width: dw, height: dh,
    })
  }
  return pdfBlob(await out.save())
}

// ─── Booklet (saddle-stitch) ────────────────────────────────────────────────
/** Pure: page placement order for a booklet. Given input page count n,
 *  returns sides: [ [leftIdx, rightIdx], ... ] — each side becomes one
 *  landscape output page; null means a blank filler page. */
export function bookletOrder(n: number): Array<[number | null, number | null]> {
  const N = Math.ceil(n / 4) * 4 || 4
  const at = (i: number) => (i < n ? i : null)
  const sides: Array<[number | null, number | null]> = []
  for (let k = 0; k < N / 4; k++) {
    sides.push([at(N - 1 - 2 * k), at(2 * k)])       // front
    sides.push([at(2 * k + 1), at(N - 2 - 2 * k)])   // back
  }
  return sides
}

export async function bookletPDF(file: File, paper: 'a4' | 'letter' = 'a4'): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib')
  const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true } as any)
  const srcPages = src.getPages()
  const n = srcPages.length
  const sides = bookletOrder(n)

  // Each output side is a landscape sheet; source pages are scaled to half.
  const [baseW, baseH] = paper === 'a4' ? [595, 842] : [612, 792]
  const sheetW = baseH, sheetH = baseW // landscape
  const halfW = sheetW / 2

  const out = await PDFDocument.create()
  for (const [leftIdx, rightIdx] of sides) {
    const sheet = out.addPage([sheetW, sheetH])
    const place = async (idx: number | null, x0: number) => {
      if (idx === null) return
      const emb = await out.embedPage(srcPages[idx])
      const scale = Math.min(halfW / emb.width, sheetH / emb.height)
      const dw = emb.width * scale, dh = emb.height * scale
      sheet.drawPage(emb, { x: x0 + (halfW - dw) / 2, y: (sheetH - dh) / 2, width: dw, height: dh })
    }
    await place(leftIdx, 0)
    await place(rightIdx, halfW)
  }
  return pdfBlob(await out.save())
}
