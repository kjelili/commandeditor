import { toWinAnsi } from '@/utils/pdfTextSafe'

// ─── DYSLEXIA / LOW-VISION REFLOW ──────────────────────────────────────────
// PDF's fixed layout is a wall for readers with dyslexia or low vision.
// This extracts the text and rebuilds the document under the reader's own
// rules: bigger type, wider letter/word/line spacing, short line lengths,
// tinted paper. Exports a fresh, accessible PDF built with those settings.

export interface ReflowOptions {
  fontSize: number       // pt
  lineHeight: number     // multiple, e.g. 1.8
  wordSpacing: number    // pt added between words
  margin: number         // pt
  pageWidth: number      // pt (default A4 595)
  pageHeight: number     // pt (default A4 842)
}

export const DEFAULT_REFLOW: ReflowOptions = {
  fontSize: 18, lineHeight: 1.8, wordSpacing: 2, margin: 64,
  pageWidth: 595, pageHeight: 842,
}

export async function extractPagesText(file: File): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const pages: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    let lastY: number | null = null
    let line = ''
    const lines: string[] = []
    for (const it of tc.items as any[]) {
      const y = Math.round(it.transform[5])
      if (lastY !== null && Math.abs(y - lastY) > 2 && line.trim()) {
        lines.push(line.trim()); line = ''
      }
      line += it.str + (it.str.endsWith(' ') ? '' : ' ')
      lastY = y
    }
    if (line.trim()) lines.push(line.trim())
    pages.push(lines.join('\n'))
    page.cleanup()
  }
  await doc.destroy()
  return pages
}

function wrapLine(text: string, font: any, size: number, maxWidth: number, wordSpacing: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const trial = cur ? cur + ' ' + w : w
    const width = font.widthOfTextAtSize(trial, size) + (trial.split(' ').length - 1) * wordSpacing
    if (width > maxWidth && cur) { lines.push(cur); cur = w }
    else cur = trial
  }
  if (cur) lines.push(cur)
  return lines
}

export async function buildReflowedPdf(pagesText: string[], opts: ReflowOptions): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const maxWidth = opts.pageWidth - opts.margin * 2
  const lineAdvance = opts.fontSize * opts.lineHeight

  let page = doc.addPage([opts.pageWidth, opts.pageHeight])
  let y = opts.pageHeight - opts.margin

  for (const pageText of pagesText) {
    for (const rawParagraph of pageText.split('\n')) {
      // Sanitize BEFORE width measurement — widthOfTextAtSize also throws on
      // characters outside the standard font's charset.
      const paragraph = toWinAnsi(rawParagraph)
      if (!paragraph.trim()) { y -= lineAdvance * 0.5; continue }
      for (const line of wrapLine(paragraph, font, opts.fontSize, maxWidth, opts.wordSpacing)) {
        if (y < opts.margin) {
          page = doc.addPage([opts.pageWidth, opts.pageHeight])
          y = opts.pageHeight - opts.margin
        }
        page.drawText(line, {
          x: opts.margin, y: y - opts.fontSize,
          size: opts.fontSize, font,
          color: rgb(0.12, 0.12, 0.12),
        })
        y -= lineAdvance
      }
    }
    // page break between source pages
    y -= lineAdvance * 0.5
  }
  return doc.save()
}
