// utils/docTools.ts — Stage 5 gap-fillers: Scale/Resize Pages, Link Editor,
// Contact Sheet, Bookmarks Import/Export.
// All client-side: pdf-lib for structure, pdfjs-dist for inspection/rendering.

import { pdfBlob, bytesBlob } from './blob'

let _pdfjsReady = false
async function getPdfjs() {
  const lib = await import('pdfjs-dist')
  if (!_pdfjsReady) {
    lib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
    _pdfjsReady = true
  }
  return lib
}

// ─── Scale / Resize Pages ───────────────────────────────────────────────────
export type ScaleOptions =
  | { mode: 'percent'; percent: number }
  | { mode: 'fit'; width: number; height: number }   // target box in points (A4 = 595x842, Letter = 612x792)

export async function scalePDFPages(file: File, opts: ScaleOptions): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true } as any)
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize()
    let s: number
    if (opts.mode === 'percent') {
      s = opts.percent / 100
    } else {
      s = Math.min(opts.width / width, opts.height / height)
    }
    if (!isFinite(s) || s <= 0) continue
    page.scaleContent(s, s)
    const newW = width * s, newH = height * s
    if (opts.mode === 'fit') {
      // centre the scaled content inside the target box
      const dx = (opts.width - newW) / 2, dy = (opts.height - newH) / 2
      if (dx !== 0 || dy !== 0) page.translateContent(dx, dy)
      page.setSize(opts.width, opts.height)
    } else {
      page.setSize(newW, newH)
    }
  }
  return pdfBlob(await doc.save({ useObjectStreams: false }))
}

// ─── Link Editor ────────────────────────────────────────────────────────────
export interface PdfLink { pageIndex: number; url: string | null; rect: number[] }

export async function listPDFLinks(file: File): Promise<PdfLink[]> {
  const pdfjsLib = await getPdfjs()
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
  const links: PdfLink[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const annots = await page.getAnnotations()
    for (const a of annots) {
      if (a.subtype === 'Link') {
        links.push({ pageIndex: i - 1, url: a.url ?? a.unsafeUrl ?? null, rect: a.rect ?? [] })
      }
    }
  }
  return links
}

export async function removePDFLinks(file: File, onlyPage?: number): Promise<{ blob: Blob; removed: number }> {
  const { PDFDocument, PDFName, PDFArray } = await import('pdf-lib')
  const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true } as any)
  let removed = 0
  const pages = doc.getPages()
  for (let pi = 0; pi < pages.length; pi++) {
    if (onlyPage !== undefined && pi !== onlyPage) continue
    const node: any = pages[pi].node
    const annots = node.lookup?.(PDFName.of('Annots'))
    if (!(annots instanceof PDFArray)) continue
    const keep: any[] = []
    for (let i = 0; i < annots.size(); i++) {
      const ref = annots.get(i)
      let subtype = ''
      try { subtype = (doc as any).context.lookup(ref)?.get?.(PDFName.of('Subtype'))?.toString?.() ?? '' } catch {}
      if (subtype === '/Link') removed++
      else keep.push(ref)
    }
    if (keep.length === 0) node.delete(PDFName.of('Annots'))
    else if (keep.length !== annots.size()) node.set(PDFName.of('Annots'), (doc as any).context.obj(keep))
  }
  return { blob: pdfBlob(await doc.save({ useObjectStreams: false })), removed }
}

export interface AddLinkOptions {
  pageIndex: number
  url: string
  xPct: number  // 0-100, from left
  yPct: number  // 0-100, from TOP (UI-style)
  wPct: number
  hPct: number
}

export async function addPDFLink(file: File, opts: AddLinkOptions): Promise<Blob> {
  const { PDFDocument, PDFName, PDFString, PDFArray } = await import('pdf-lib')
  const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true } as any)
  const pages = doc.getPages()
  if (opts.pageIndex < 0 || opts.pageIndex >= pages.length) throw new Error(`Page ${opts.pageIndex + 1} does not exist`)
  const page = pages[opts.pageIndex]
  const { width, height } = page.getSize()
  const x = (opts.xPct / 100) * width
  const w = (opts.wPct / 100) * width
  const h = (opts.hPct / 100) * height
  const yTop = (opts.yPct / 100) * height
  const y = height - yTop - h // PDF origin is bottom-left
  const annotRef = (doc as any).context.nextRef()
  ;(doc as any).context.assign(annotRef, (doc as any).context.obj({
    Type: 'Annot', Subtype: 'Link', Rect: [x, y, x + w, y + h],
    Border: [0, 0, 0],
    A: { Type: 'Action', S: 'URI', URI: PDFString.of(opts.url) },
  }))
  const node: any = page.node
  const existing = node.lookup?.(PDFName.of('Annots'))
  if (existing instanceof PDFArray) {
    const arr = (doc as any).context.obj(Array.from({ length: existing.size() }, (_, i) => existing.get(i)))
    arr.push(annotRef)
    node.set(PDFName.of('Annots'), arr)
  } else {
    node.set(PDFName.of('Annots'), (doc as any).context.obj([annotRef]))
  }
  return pdfBlob(await doc.save({ useObjectStreams: false }))
}

// ─── Contact Sheet ──────────────────────────────────────────────────────────
export interface GridCell { col: number; row: number }
export function computeContactGrid(pageCount: number, cols: number): { cells: GridCell[]; rows: number } {
  const rows = Math.ceil(pageCount / cols)
  const cells: GridCell[] = Array.from({ length: pageCount }, (_, i) => ({ col: i % cols, row: Math.floor(i / cols) }))
  return { cells, rows }
}

/** Renders every page as a thumbnail onto A4-landscape grid sheets.
 *  Browser-only (canvas rendering via pdf.js). */
export async function contactSheetPDF(file: File, cols = 4, onProgress?: (p: number, t: number) => void): Promise<Blob> {
  const pdfjsLib = await getPdfjs()
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
  const { PDFDocument } = await import('pdf-lib')
  const out = await PDFDocument.create()
  const SHEET_W = 842, SHEET_H = 595, MARGIN = 24, GAP = 10
  const { cells, rows } = computeContactGrid(pdf.numPages, cols)
  const cellW = (SHEET_W - 2 * MARGIN - (cols - 1) * GAP) / cols
  const cellH = (SHEET_H - 2 * MARGIN - (rows - 1) * GAP) / rows

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const vp1 = page.getViewport({ scale: 1 })
    const scale = Math.min((cellW * 2) / vp1.width, (cellH * 2) / vp1.height) // 2x for crispness
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise
    const png = await out.embedPng(canvas.toDataURL('image/png'))

    // (re)use one sheet page per rows*cols thumbs
    if ((i - 1) % (cols * rows) === 0 || i === 1) out.addPage([SHEET_W, SHEET_H])
    const sheet = out.getPages()[out.getPageCount() - 1]
    const cell = cells[i - 1]
    const drawW = cellW, drawH = (cellW / viewport.width) * viewport.height
    const finalH = Math.min(drawH, cellH), finalW = (finalH / drawH) * drawW
    sheet.drawImage(png, {
      x: MARGIN + cell.col * (cellW + GAP) + (cellW - finalW) / 2,
      y: SHEET_H - MARGIN - (cell.row + 1) * cellH - cell.row * GAP + (cellH - finalH) / 2,
      width: finalW, height: finalH,
    })
    onProgress?.(i, pdf.numPages)
  }
  return pdfBlob(await out.save())
}

// ─── Bookmarks Import / Export ──────────────────────────────────────────────
export interface BookmarkItem { title: string; page: number; children?: BookmarkItem[] }

export async function exportBookmarks(file: File): Promise<{ blob: Blob; count: number }> {
  const pdfjsLib = await getPdfjs()
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
  const outline = await pdf.getOutline()
  async function convert(items: any[]): Promise<BookmarkItem[]> {
    const out: BookmarkItem[] = []
    for (const item of items || []) {
      let pageIndex = 0
      try {
        let dest = item.dest
        if (typeof dest === 'string') dest = await pdf.getDestination(dest)
        const ref = Array.isArray(dest) ? dest[0] : null
        if (ref) pageIndex = await pdf.getPageIndex(ref)
      } catch { /* keep 0 */ }
      const node: BookmarkItem = { title: item.title || 'Untitled', page: pageIndex }
      const kids = await convert(item.items)
      if (kids.length) node.children = kids
      out.push(node)
    }
    return out
  }
  const items = await convert(outline || [])
  const count = (function countAll(list: BookmarkItem[]): number {
    return list.reduce((n, it) => n + 1 + (it.children ? countAll(it.children) : 0), 0)
  })(items)
  const json = new TextEncoder().encode(JSON.stringify({ format: 'commandeditor-bookmarks-v1', items }, null, 2))
  return { blob: bytesBlob(json, 'application/json'), count }
}

/** Writes a bookmark outline into a PDF via pdf-lib's low-level object API. */
export async function importBookmarks(file: File, items: BookmarkItem[]): Promise<{ blob: Blob; count: number }> {
  const { PDFDocument, PDFName, PDFHexString } = await import('pdf-lib')
  const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true } as any)
  const ctx: any = (doc as any).context
  const pages = doc.getPages()
  if (!items.length) throw new Error('No bookmarks to import')

  let count = 0
  const clampPage = (p: number) => Math.max(0, Math.min(pages.length - 1, p))

  const buildLevel = (list: BookmarkItem[], parentRef: any): { first: any; last: any } => {
    const refs = list.map(() => ctx.nextRef())
    list.forEach((item, i) => {
      const dict: any = {
        Title: PDFHexString.fromText(item.title || 'Untitled'),
        Parent: parentRef,
        Dest: [pages[clampPage(item.page)].ref, PDFName.of('Fit')],
      }
      if (i > 0) dict.Prev = refs[i - 1]
      if (i < refs.length - 1) dict.Next = refs[i + 1]
      count++
      const kids = item.children?.length ? buildLevel(item.children, refs[i]) : null
      if (kids) {
        dict.First = kids.first; dict.Last = kids.last
        dict.Count = item.children!.length
      }
      ctx.assign(refs[i], ctx.obj(dict))
    })
    return { first: refs[0], last: refs[refs.length - 1] }
  }

  const rootRef = ctx.nextRef()
  const top = buildLevel(items, rootRef)
  ctx.assign(rootRef, ctx.obj({ Type: 'Outlines', First: top.first, Last: top.last, Count: count }))
  doc.catalog.set(PDFName.of('Outlines'), rootRef)
  return { blob: pdfBlob(await doc.save({ useObjectStreams: false })), count }
}
