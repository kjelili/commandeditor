// pdfOperations.ts — all client-side PDF operations

import { pdfBlob } from './blob'

// ─── Worker init helper ────────────────────────────────────────────────────
let _pdfjsReady = false
async function getPdfjs() {
  const lib = await import('pdfjs-dist')
  if (!_pdfjsReady) {
    lib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
    _pdfjsReady = true
  }
  return lib
}

// ─── Merge PDFs ────────────────────────────────────────────────────────────
export async function mergePDFs(files: File[]): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib')
  const merged = await PDFDocument.create()
  for (const file of files) {
    const doc = await PDFDocument.load(await file.arrayBuffer())
    const pages = await merged.copyPages(doc, doc.getPageIndices())
    pages.forEach(p => merged.addPage(p))
  }
  return pdfBlob(await merged.save())
}

// ─── Split PDF ─────────────────────────────────────────────────────────────
export async function splitPDF(file: File, pageNumbers: number[]): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib')
  const src = await PDFDocument.load(await file.arrayBuffer())
  const out = await PDFDocument.create()
  const copied = await out.copyPages(src, pageNumbers.map(n => n - 1))
  copied.forEach(p => out.addPage(p))
  return pdfBlob(await out.save())
}

// ─── Compress PDF ──────────────────────────────────────────────────────────
// Raster re-render path — shrinks scanned/image-heavy PDFs, but BLOATS
// vector/text PDFs (crisp text becomes a big JPEG). Used only when it wins.
async function rasterCompressBytes(
  file: File,
  quality: number,
  onProgress?: (page: number, total: number) => void
): Promise<Uint8Array> {
  const pdfjsLib = await getPdfjs()
  const { jsPDF } = await import('jspdf')
  const buf = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ standardFontDataUrl: '/pdf-standard-fonts/', data: buf }).promise
  const jsPdfDoc = new jsPDF({ unit: 'pt', compress: true })
  const renderScale = quality < 0.4 ? 1.5 : 1.8 // ~108–130 DPI: legible without ballooning
  const jpegQuality = Math.max(0.5, Math.min(0.85, quality))
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const vp = page.getViewport({ scale: renderScale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport: vp, background: '#ffffff' }).promise
    const imgData = canvas.toDataURL('image/jpeg', jpegQuality)
    const pw = vp.width / renderScale, ph = vp.height / renderScale
    if (i > 1) jsPdfDoc.addPage([pw, ph])
    else { (jsPdfDoc as any).internal.pageSize.width = pw; (jsPdfDoc as any).internal.pageSize.height = ph }
    jsPdfDoc.addImage(imgData, 'JPEG', 0, 0, pw, ph)
    onProgress?.(i, pdf.numPages)
  }
  return new Uint8Array(jsPdfDoc.output('arraybuffer'))
}

export async function compressPDF(
  file: File,
  quality = 0.6,
  onProgress?: (page: number, total: number) => void
): Promise<Blob> {
  const buf = await file.arrayBuffer()
  const original = new Uint8Array(buf)
  const candidates: Uint8Array[] = [original]

  // 1) Lossless structural re-save (object streams). Never bloats; often shrinks
  //    vector/text PDFs where rasterizing would only make things worse.
  try {
    const { PDFDocument } = await import('pdf-lib')
    const doc = await PDFDocument.load(buf, { updateMetadata: false })
    candidates.push(await doc.save({ useObjectStreams: true }))
  } catch {}

  // 2) Raster re-render — great for scanned/image PDFs, wasteful for text PDFs.
  try { candidates.push(await rasterCompressBytes(file, quality, onProgress)) }
  catch {}

  // Pick the smallest result. Because the original is a candidate, the output is
  // guaranteed never larger than the input — compress can shrink, never bloat.
  const best = candidates.reduce((a, b) => (b.byteLength < a.byteLength ? b : a))
  return pdfBlob(best)
}

// Compress several PDFs at once → a ZIP of the compressed files.
export async function compressMultiplePDFs(
  files: File[],
  quality = 0.6,
  onProgress?: (done: number, total: number) => void
): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  for (let i = 0; i < files.length; i++) {
    const blob = await compressPDF(files[i], quality)
    const base = files[i].name.replace(/\.pdf$/i, '')
    zip.file(`${base}-compressed.pdf`, await blob.arrayBuffer())
    onProgress?.(i + 1, files.length)
  }
  const zBlob = await zip.generateAsync({ type: 'blob' })
  return new Blob([zBlob], { type: 'application/zip' })
}

// ─── Edit PDF (add text overlays) ─────────────────────────────────────────
export interface TextEdit {
  text: string; x: number; y: number; page: number
  fontSize?: number; color?: { r: number; g: number; b: number }
}

export async function editPDF(file: File, edits: TextEdit[]): Promise<Blob> {
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib')
  const doc = await PDFDocument.load(await file.arrayBuffer())
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const edit of edits) {
    const page = doc.getPage(edit.page - 1)
    const { width, height } = page.getSize()
    const fs = edit.fontSize ?? 14
    const c = edit.color ?? { r: 0.1, g: 0.1, b: 0.1 }
    page.drawText(edit.text, { x: edit.x * width, y: (1 - edit.y) * height - fs, size: fs, font, color: rgb(c.r, c.g, c.b) })
  }
  return pdfBlob(await doc.save())
}

// ─── Convert PDF to Images ─────────────────────────────────────────────────
export async function convertPDFToImages(
  file: File, format: 'png' | 'jpg' | 'webp' = 'png', scale = 2,
  onProgress?: (page: number, total: number) => void
): Promise<Blob[]> {
  const pdfjsLib = await getPdfjs()
  const pdf = await pdfjsLib.getDocument({ standardFontDataUrl: '/pdf-standard-fonts/', data: await file.arrayBuffer() }).promise
  const mime: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }
  const blobs: Blob[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const vp = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = vp.width; canvas.height = vp.height
    const ctx = canvas.getContext('2d')!
    // White matte only for opaque formats (JPEG); keep PNG/WebP transparency intact.
    if (format !== 'png') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height) }
    await page.render({ canvasContext: ctx, viewport: vp }).promise
    blobs.push(await new Promise<Blob>(res => canvas.toBlob(b => res(b!), mime[format], 0.95)))
    onProgress?.(i, pdf.numPages)
  }
  return blobs
}

// ─── Convert Images to PDF ────────────────────────────────────────────────
export async function convertImagesToPDF(files: File[]): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  for (const file of files) {
    const bytes = await file.arrayBuffer()
    const isJpeg = file.type === 'image/jpeg'
    const isPng = file.type === 'image/png'
    let img
    if (isPng) img = await doc.embedPng(bytes)
    else if (isJpeg) img = await doc.embedJpg(bytes)
    else {
      const bmp = await createImageBitmap(new Blob([bytes]))
      const canvas = document.createElement('canvas')
      canvas.width = bmp.width; canvas.height = bmp.height
      canvas.getContext('2d')!.drawImage(bmp, 0, 0)
      img = await doc.embedPng(await new Promise<ArrayBuffer>(res => canvas.toBlob(b => b!.arrayBuffer().then(res), 'image/png')))
    }
    const page = doc.addPage([img.width, img.height])
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
  }
  return pdfBlob(await doc.save())
}

// ─── Convert Word to PDF ──────────────────────────────────────────────────
export async function convertWordToPDF(file: File): Promise<Blob> {
  const mammoth = await import('mammoth')
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() })
  return _htmlToPDF(html, file.name)
}

// ─── Convert Text to PDF ──────────────────────────────────────────────────
export async function convertTextToPDF(file: File): Promise<Blob> {
  const text = await file.text()
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const margin = 40, lh = 14
  const lines = doc.splitTextToSize(text, doc.internal.pageSize.getWidth() - margin * 2)
  let y = margin + 16
  doc.setFont('Helvetica', 'normal'); doc.setFontSize(11)
  for (const line of lines) {
    if (y > doc.internal.pageSize.getHeight() - margin) { doc.addPage(); y = margin + 16 }
    doc.text(line, margin, y); y += lh
  }
  return new Blob([doc.output('arraybuffer')], { type: 'application/pdf' })
}

// ─── Convert Markdown to PDF ──────────────────────────────────────────────
export async function convertMarkdownToPDF(file: File): Promise<Blob> {
  const text = await file.text()
  const html = text
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hpli])(.+)$/gm, '<p>$1</p>')
  return _htmlToPDF(`<div style="font-family:Georgia,serif;font-size:13px;line-height:1.6;padding:20px">${html}</div>`, file.name)
}

// ─── Convert HTML File to PDF ─────────────────────────────────────────────
export async function convertHTMLFileToPDF(file: File): Promise<Blob> {
  return _htmlToPDF(await file.text(), file.name)
}

// ─── Internal: HTML → PDF ─────────────────────────────────────────────────
async function _htmlToPDF(html: string, _name: string): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const html2canvas = (await import('html2canvas')).default
  // Sanitize the uploaded HTML before it touches the live DOM. Without this a
  // malicious .html file could fire inline event handlers (onerror/onload) the
  // instant the element is inserted — an XSS vector. DOMPurify strips scripts,
  // event handlers and dangerous URLs while preserving layout for rendering.
  const DOMPurify = (await import('dompurify')).default
  const el = document.createElement('div')
  el.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:white;padding:40px;box-sizing:border-box;font-family:Georgia,serif;font-size:13px;line-height:1.6'
  el.innerHTML = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
  document.body.appendChild(el)
  try {
    const canvas = await html2canvas(el, { scale: 1.5, useCORS: true, backgroundColor: '#ffffff' })
    const img = canvas.toDataURL('image/jpeg', 0.9)
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight()
    const ih = (canvas.height * pw) / canvas.width
    let y = 0
    while (y < ih) { if (y > 0) doc.addPage(); doc.addImage(img, 'JPEG', 0, -y, pw, ih); y += ph }
    return new Blob([doc.output('arraybuffer')], { type: 'application/pdf' })
  } finally { document.body.removeChild(el) }
}

// ─── Extract images from PDF as ZIP ───────────────────────────────────────
export async function extractImagesPDF(
  file: File,
  onProgress?: (page: number, total: number) => void
): Promise<Blob> {
  const pdfjsLib = await getPdfjs()
  const { default: JSZip } = await import('jszip')
  const pdf = await pdfjsLib.getDocument({ standardFontDataUrl: '/pdf-standard-fonts/', data: await file.arrayBuffer() }).promise
  const zip = new JSZip()
  const folder = zip.folder('images')!
  const base = file.name.replace(/\.pdf$/i, '')
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const vp = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = vp.width; canvas.height = vp.height
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise
    folder.file(`${base}-page-${i}.png`, canvas.toDataURL('image/png').split(',')[1], { base64: true })
    onProgress?.(i, pdf.numPages)
  }
  return new Blob([await zip.generateAsync({ type: 'blob' }).then(b => b.arrayBuffer())], { type: 'application/zip' })
}

// ─── Flatten PDF ──────────────────────────────────────────────────────────
export async function flattenPDF(
  file: File,
  onProgress?: (page: number, total: number) => void
): Promise<Blob> {
  const pdfjsLib = await getPdfjs()
  const { PDFDocument } = await import('pdf-lib')
  const pdf = await pdfjsLib.getDocument({ standardFontDataUrl: '/pdf-standard-fonts/', data: await file.arrayBuffer() }).promise
  const out = await PDFDocument.create()
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const vp = page.getViewport({ scale: 1.5 })
    const canvas = document.createElement('canvas')
    canvas.width = vp.width; canvas.height = vp.height
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise
    const pngBytes = await new Promise<ArrayBuffer>(res => canvas.toBlob(b => b!.arrayBuffer().then(res), 'image/png'))
    const img = await out.embedPng(pngBytes)
    const p = out.addPage([vp.width / 1.5, vp.height / 1.5])
    p.drawImage(img, { x: 0, y: 0, width: vp.width / 1.5, height: vp.height / 1.5 })
    onProgress?.(i, pdf.numPages)
  }
  return pdfBlob(await out.save())
}

// ─── Convert PDF to Word (.docx, editable text) ───────────────────────────
// Layout-aware conversion: real headings, bold/italic runs, bullet lists and
// paragraphs rebuilt from the PDF text layer (see utils/wordConvert.ts).
// Scanned pages without a text layer fall back to an embedded page image.
export async function convertPDFToWord(file: File, onProgress?: (page: number, total: number) => void): Promise<Blob> {
  const pdfjsLib = await getPdfjs()
  const { pageItemsToBlocks, buildWordDocument } = await import('./wordConvert')
  const pdf = await pdfjsLib.getDocument({ standardFontDataUrl: '/pdf-standard-fonts/', data: await file.arrayBuffer() }).promise
  const pages = []
  const pageImages = new Map<number, { data: ArrayBuffer; ratio: number }>()
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const vp = page.getViewport({ scale: 1 })
    // Force font resolution so commonObjs can tell us the real base font
    // name ("Helvetica-Bold") — getTextContent alone leaves fonts pending.
    try { await page.getOperatorList() } catch { /* cosmetic only */ }
    const tc = await page.getTextContent()
    const baseFont = (fn: string): string => {
      try {
        const objs = (page as any).commonObjs
        return objs?.has(fn) ? (objs.get(fn)?.name ?? '') : ''
      } catch { return '' }
    }
    const items = tc.items
      .filter((it: any) => typeof it.str === 'string')
      .map((it: any) => ({
        str: it.str as string,
        x: it.transform[4] as number,
        y: it.transform[5] as number,
        width: (it.width ?? 0) as number,
        height: (it.height || Math.abs(it.transform[3]) || 12) as number,
        // pdf.js renames fonts ("g_d0_f1"); the Bold/Italic suffix lives on
        // the resolved base name — pass every alias we have.
        fontName: `${baseFont(it.fontName)} ${it.fontName} ${(tc.styles as any)?.[it.fontName]?.fontFamily ?? ''}`,
      }))
    const content = pageItemsToBlocks(items, vp.width)
    if (!content.hasText) {
      // Scanned page — keep the content as a full-page image instead of
      // silently dropping it. (Requires a DOM canvas; browsers only.)
      const scale = 1.5
      const cvp = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = cvp.width; canvas.height = cvp.height
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport: cvp }).promise
      const imgBuffer = await new Promise<ArrayBuffer>(res => canvas.toBlob(b => b!.arrayBuffer().then(res), 'image/png'))
      pageImages.set(i - 1, { data: imgBuffer, ratio: cvp.height / cvp.width })
    }
    pages.push(content)
    onProgress?.(i, pdf.numPages)
  }
  const buf = await buildWordDocument(pages, {
    title: file.name.replace(/\.pdf$/i, ''),
    pageImages,
  })
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
}

// ─── Download helper ──────────────────────────────────────────────────────
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

// ─── Crop PDF pages (setCropBox) ──────────────────────────────────────────
export async function cropPDF(
  file: File,
  marginPts: { top: number; right: number; bottom: number; left: number }
): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.load(await file.arrayBuffer())
  doc.getPages().forEach(page => {
    const { width, height } = page.getSize()
    page.setCropBox(
      marginPts.left,
      marginPts.bottom,
      width - marginPts.left - marginPts.right,
      height - marginPts.top - marginPts.bottom
    )
  })
  return pdfBlob(await doc.save())
}

// ─── Redact PDF (TRUE redaction) ──────────────────────────────────────────
// SECURITY: drawing a black rectangle over text does NOT remove the text — it
// stays selectable/extractable underneath. Real redaction must destroy the
// underlying content. We do that by (1) drawing opaque black boxes, then
// (2) rasterizing every page that carries a redaction so its text/vector
// content is permanently flattened to pixels. Pages with no redaction keep
// their original text layer. In a non-browser context (unit tests, no canvas)
// we fall back to boxes only — the browser path always rasterizes.
export async function redactPDF(
  file: File,
  regions: Array<{ page: number; x: number; y: number; w: number; h: number }>,
  onProgress?: (page: number, total: number) => void
): Promise<Blob> {
  const { PDFDocument, rgb } = await import('pdf-lib')

  // Phase 1 — draw opaque black boxes on a working copy.
  const boxed = await PDFDocument.load(await file.arrayBuffer())
  const affected = new Set<number>()
  for (const r of regions) {
    const page = boxed.getPage(r.page - 1)
    const { height } = page.getSize()
    page.drawRectangle({ x: r.x, y: height - r.y - r.h, width: r.w, height: r.h, color: rgb(0, 0, 0), opacity: 1 })
    affected.add(r.page)
  }
  const boxedBytes = await boxed.save()

  // Phase 2 — rasterize the affected pages so the covered content is destroyed.
  const canRaster = typeof document !== 'undefined'
  if (!canRaster || affected.size === 0) return pdfBlob(boxedBytes)

  const pdfjsLib = await getPdfjs()
  const renderDoc = await pdfjsLib.getDocument({ standardFontDataUrl: '/pdf-standard-fonts/', data: boxedBytes.slice(0) }).promise
  const srcForCopy = await PDFDocument.load(boxedBytes)
  const out = await PDFDocument.create()
  const total = renderDoc.numPages
  for (let i = 1; i <= total; i++) {
    if (affected.has(i)) {
      const page = await renderDoc.getPage(i)
      const scale = 2.2 // ~158 DPI: crisp, and any covered text becomes pixels
      const vp = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height)
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: ctx, viewport: vp, background: '#ffffff' }).promise
      const jpegBuf = await new Promise<ArrayBuffer>(res => canvas.toBlob(b => b!.arrayBuffer().then(res), 'image/jpeg', 0.85))
      const img = await out.embedJpg(jpegBuf)
      const pw = vp.width / scale, ph = vp.height / scale
      const pg = out.addPage([pw, ph])
      pg.drawImage(img, { x: 0, y: 0, width: pw, height: ph })
    } else {
      const [copied] = await out.copyPages(srcForCopy, [i - 1])
      out.addPage(copied)
    }
    onProgress?.(i, total)
  }
  return pdfBlob(await out.save())
}

// ─── Extract text / markdown from PDF ────────────────────────────────────
export async function extractTextFromPDF(
  file: File,
  format: 'txt' | 'md' = 'txt',
  onProgress?: (page: number, total: number) => void
): Promise<Blob> {
  const pdfjsLib = await getPdfjs()
  const pdf = await pdfjsLib.getDocument({ standardFontDataUrl: '/pdf-standard-fonts/', data: await file.arrayBuffer() }).promise
  const lines: string[] = []
  if (format === 'md') lines.push(`# ${file.name.replace(/\.pdf$/i, '')}\n`)
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const tc = await page.getTextContent()
    const pageText = (tc.items as any[]).map((it: any) => it.str).join(' ').trim()
    if (format === 'md') {
      lines.push(`## Page ${i}\n`)
      lines.push(pageText)
      lines.push('')
    } else {
      lines.push(`--- Page ${i} ---`)
      lines.push(pageText)
    }
    onProgress?.(i, pdf.numPages)
  }
  const mimeMap = { txt: 'text/plain', md: 'text/markdown' }
  return new Blob([lines.join('\n')], { type: mimeMap[format] })
}

// ─── Add QR code to PDF page ─────────────────────────────────────────────
export async function addQRToPDF(
  file: File,
  url: string,
  page: number,
  x: number, y: number, size: number
): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib')
  // Generate the QR code entirely ON-DEVICE with bwip-js. (Previously this
  // fetched from api.qrserver.com, which sent the encoded data to a third-party
  // server — a direct violation of the zero-upload / no-egress guarantee.)
  const { default: bwipjs } = await import('bwip-js' as any)
  const qrCanvas = document.createElement('canvas')
  bwipjs.toCanvas(qrCanvas, {
    bcid: 'qrcode',
    text: url,
    scale: 4,
    padding: 2,
    backgroundcolor: 'FFFFFF',
  })

  const pngBytes = await new Promise<ArrayBuffer>(res =>
    qrCanvas.toBlob(b => b!.arrayBuffer().then(res), 'image/png')
  )

  const doc = await PDFDocument.load(await file.arrayBuffer())
  const pdfPage = doc.getPage(Math.min(page - 1, doc.getPageCount() - 1))
  const { height } = pdfPage.getSize()
  const qrImg = await doc.embedPng(pngBytes)
  pdfPage.drawImage(qrImg, { x, y: height - y - size, width: size, height: size })
  return pdfBlob(await doc.save())
}

// ─── Remove password from PDF ─────────────────────────────────────────────
// Note: pdf-lib cannot actually decrypt password-protected PDFs. This
// function passes ignoreEncryption=true, which only succeeds for documents
// with weak/empty owner protection. Strongly-encrypted PDFs still need
// the password to be removed in a desktop viewer first. We surface a clear
// error to the user instead of silently producing garbage output.
export async function removePasswordPDF(file: File, password: string): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib')
  try {
    const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true })
    // Re-save without any password (omitting encrypt options strips it)
    return pdfBlob(await doc.save())
  } catch {
    throw new Error('This PDF uses strong encryption and cannot be unlocked in the browser. Try opening it in a desktop viewer with the password, then re-saving without one.')
  }
}

// ─── Add header and footer to every page ─────────────────────────────────
export async function addHeaderFooterPDF(
  file: File,
  opts: {
    header?: string; footer?: string
    align?: 'left' | 'center' | 'right'; fontSize?: number
  }
): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.load(await file.arrayBuffer())
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const pages = doc.getPages()
  const total = pages.length
  const dateStr = new Date().toLocaleDateString()
  const fs = opts.fontSize ?? 10
  const clr = rgb(0.3, 0.3, 0.3)

  pages.forEach((page, i) => {
    const { width, height } = page.getSize()
    const pageNum = i + 1

    const getX = (text: string, size: number): number => {
      const tw = font.widthOfTextAtSize(text, size)
      if (opts.align === 'left') return 36
      if (opts.align === 'right') return width - tw - 36
      return width / 2 - tw / 2  // center default
    }

    // Substitute placeholders
    const substitute = (tmpl: string) =>
      tmpl.replace(/\{page\}/gi, String(pageNum))
          .replace(/\{total\}/gi, String(total))
          .replace(/\{date\}/gi, dateStr)

    if (opts.header) {
      const text = substitute(opts.header)
      page.drawText(text, { x: getX(text, fs), y: height - 28, size: fs, font, color: clr })
    }
    if (opts.footer) {
      const text = substitute(opts.footer)
      page.drawText(text, { x: getX(text, fs), y: 18, size: fs, font, color: clr })
    }
  })
  return pdfBlob(await doc.save())
}

// ─── Grayscale PDF ───────────────────────────────────────────────────────
export async function grayscalePDF(
  file: File,
  onProgress?: (page: number, total: number) => void
): Promise<Blob> {
  const pdfjsLib = await getPdfjs()
  const { PDFDocument } = await import('pdf-lib')
  const pdf = await pdfjsLib.getDocument({ standardFontDataUrl: '/pdf-standard-fonts/', data: await file.arrayBuffer() }).promise
  const out = await PDFDocument.create()
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const vp = page.getViewport({ scale: 1.5 })
    const canvas = document.createElement('canvas')
    canvas.width = vp.width; canvas.height = vp.height
    const ctx = canvas.getContext('2d')!
    await page.render({ canvasContext: ctx, viewport: vp }).promise
    // Desaturate in place
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const d = imgData.data
    for (let j = 0; j < d.length; j += 4) {
      const gray = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]
      d[j] = d[j + 1] = d[j + 2] = gray
    }
    ctx.putImageData(imgData, 0, 0)
    const pngBytes = await new Promise<ArrayBuffer>(res => canvas.toBlob(b => b!.arrayBuffer().then(res), 'image/png'))
    const img = await out.embedPng(pngBytes)
    const p = out.addPage([vp.width / 1.5, vp.height / 1.5])
    p.drawImage(img, { x: 0, y: 0, width: vp.width / 1.5, height: vp.height / 1.5 })
    onProgress?.(i, pdf.numPages)
  }
  return pdfBlob(await out.save())
}

// ─── Add blank page / duplicate page ─────────────────────────────────────
export async function insertPagePDF(
  file: File,
  opts: { after: number; type: 'blank' | 'duplicate' }
): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.load(await file.arrayBuffer())
  const pages = doc.getPages()
  const afterPage = Math.max(0, Math.min(opts.after, pages.length))
  const refPage = pages[Math.max(0, afterPage - 1)]
  const { width, height } = refPage.getSize()
  if (opts.type === 'blank') {
    doc.insertPage(afterPage, [width, height])
  } else {
    const srcIdx = Math.max(0, afterPage - 1)
    const [dup] = await doc.copyPages(doc, [srcIdx])
    doc.insertPage(afterPage, dup)
  }
  return pdfBlob(await doc.save())
}

// ─── Delete pages from PDF ────────────────────────────────────────────────
export async function deletePagesFromPDF(file: File, pagesToDelete: number[]): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib')
  const src = await PDFDocument.load(await file.arrayBuffer())
  const out = await PDFDocument.create()
  const keepIndices = src.getPageIndices().filter(i => !pagesToDelete.includes(i + 1))
  const copied = await out.copyPages(src, keepIndices)
  copied.forEach(p => out.addPage(p))
  return pdfBlob(await out.save())
}

// ─── Split by every N pages → returns ZIP blob ───────────────────────────
export async function splitByNPages(
  file: File, n: number,
  onProgress?: (chunk: number, total: number) => void
): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib')
  const { default: JSZip } = await import('jszip')
  const src = await PDFDocument.load(await file.arrayBuffer())
  const total = src.getPageCount()
  const zip = new JSZip()
  const base = file.name.replace(/\.pdf$/i, '')
  let chunkNum = 0
  const numChunks = Math.ceil(total / n)
  for (let start = 0; start < total; start += n) {
    const out = await PDFDocument.create()
    const end = Math.min(start + n, total)
    const pages = await out.copyPages(src, Array.from({ length: end - start }, (_, i) => start + i))
    pages.forEach(p => out.addPage(p))
    const bytes = await out.save()
    chunkNum++
    zip.file(`${base}-part-${chunkNum}.pdf`, bytes)
    onProgress?.(chunkNum, numChunks)
  }
  const buf = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
  return new Blob([buf], { type: 'application/zip' })
}

// ─── PDF to PowerPoint (native JSZip — no extra library needed) ──────────
export async function pdfToPPTX(
  file: File,
  onProgress?: (page: number, total: number) => void
): Promise<Blob> {
  const pdfjsLib = await getPdfjs()
  const { default: JSZip } = await import('jszip')
  const pdf = await pdfjsLib.getDocument({ standardFontDataUrl: '/pdf-standard-fonts/', data: await file.arrayBuffer() }).promise
  const numPages = pdf.numPages

  // Render all pages to JPEG data URLs
  const images: { data: string; w: number; h: number }[] = []
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i)
    const vp = page.getViewport({ scale: 1.5 })
    const canvas = document.createElement('canvas')
    canvas.width = vp.width; canvas.height = vp.height
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise
    images.push({ data: canvas.toDataURL('image/jpeg', 0.88), w: vp.width, h: vp.height })
    onProgress?.(i, numPages)
  }

  // Slide dimensions in EMU (English Metric Units): 1pt = 12700 EMU
  // Use first page aspect ratio; default to 10in x 7.5in = 9144000 x 6858000 EMU
  const slideW = 9144000, slideH = Math.round(9144000 * (images[0]?.h || 1) / (images[0]?.w || 1))

  const zip = new JSZip()

  // [Content_Types].xml
  const contentTypes = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Default Extension="jpeg" ContentType="image/jpeg"/>',
    '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>',
    ...images.map((_, i) => `<Override PartName="/ppt/slides/slide${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`),
    '</Types>'
  ].join('\n')
  zip.file('[Content_Types].xml', contentTypes)

  // _rels/.rels
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`)

  // ppt/presentation.xml
  const slideRefs = images.map((_, i) => `<p:sldId id="${256+i}" r:id="rId${i+1}"/>`).join('\n    ')
  zip.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
    xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:sldMasterIdLst/>
  <p:sldSz cx="${slideW}" cy="${slideH}" type="custom"/>
  <p:notesSz cx="6858000" cy="9144000"/>
  <p:sldIdLst>
    ${slideRefs}
  </p:sldIdLst>
</p:presentation>`)

  // ppt/_rels/presentation.xml.rels
  const presRels = images.map((_, i) => `<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i+1}.xml"/>`).join('\n  ')
  zip.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${presRels}
</Relationships>`)

  // Each slide
  for (let i = 0; i < images.length; i++) {
    const imgId = `img${i+1}`
    // Embed image
    const b64 = images[i].data.split(',')[1]
    zip.file(`ppt/media/${imgId}.jpeg`, b64, { base64: true })
    // Slide XML
    zip.file(`ppt/slides/slide${i+1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld><p:spTree>
    <p:sp><p:nvSpPr><p:cNvPr id="1" name=""/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>
    <p:pic>
      <p:nvPicPr><p:cNvPr id="2" name="Page ${i+1}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
      <p:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
      <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${slideW}" cy="${slideH}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
    </p:pic>
  </p:spTree></p:cSld>
</p:sld>`)
    // Slide rels
    zip.file(`ppt/slides/_rels/slide${i+1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${imgId}.jpeg"/>
</Relationships>`)
  }

  const buf = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
}

// ─── Compute SHA-256 hash ─────────────────────────────────────────────────
export async function sha256File(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const hashBuf = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ─── Remove Password / Unlock PDF ─────────────────────────────────────────


// ─── OCR: Make scanned PDF searchable using Tesseract.js (client-side) ────────
// This runs entirely in the browser — no file is uploaded anywhere.
export async function ocrPDF(
  file: File,
  lang: string = 'eng',
  onProgress?: (page: number, total: number) => void
): Promise<Blob> {
  const pdfjsLib = await getPdfjs()
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')

  // Dynamically load Tesseract.js
  const Tesseract = await (async () => {
    if ((window as any).Tesseract) return (window as any).Tesseract
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
      s.onload = () => resolve()
      s.onerror = () => reject(new Error('Tesseract.js failed to load'))
      document.head.appendChild(s)
    })
    return (window as any).Tesseract
  })()

  const src = await PDFDocument.load(await file.arrayBuffer())
  const out = await PDFDocument.create()
  const font = await out.embedFont(StandardFonts.Helvetica)

  const pdf = await pdfjsLib.getDocument({ standardFontDataUrl: '/pdf-standard-fonts/', data: await file.arrayBuffer() }).promise
  const total = pdf.numPages

  // Create Tesseract worker
  const worker = await Tesseract.createWorker(lang, 1, {
    logger: () => {}, // suppress logs
    workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core-simd.wasm.js',
  })

  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i)
    const vp = page.getViewport({ scale: 2.0 }) // High-res for OCR
    const canvas = document.createElement('canvas')
    canvas.width = vp.width; canvas.height = vp.height
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise

    // Run OCR
    const { data } = await worker.recognize(canvas)
    const words = data.words || []

    // Copy original page (preserves visual)
    const [srcPage] = await out.copyPages(src, [i - 1])
    const outPage = out.addPage(srcPage)
    const { width: pw, height: ph } = outPage.getSize()
    const scaleX = pw / vp.width
    const scaleY = ph / vp.height

    // Overlay invisible text layer
    words.forEach((word: any) => {
      if (!word.text?.trim() || (word.confidence ?? 0) < 30) return
      const x = word.bbox.x0 * scaleX
      const y = ph - word.bbox.y1 * scaleY
      const h = (word.bbox.y1 - word.bbox.y0) * scaleY * 0.85
      const fontSize = Math.max(4, Math.min(h, 72))
      try {
        outPage.drawText(word.text, {
          x, y, size: fontSize, font,
          color: rgb(0, 0, 0),
          opacity: 0, // invisible — searchable but not visible
        })
      } catch {}
    })

    onProgress?.(i, total)
  }

  await worker.terminate()
  return pdfBlob(await out.save())
}
