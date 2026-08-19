// ─── NEGOTIATION REDLINE ───────────────────────────────────────────────────
// Track-changes for PDF contracts: propose text edits (counterparty terms),
// accept/reject each one, then export either a CLEAN copy (accepted changes
// applied silently) or a REDLINED copy (original struck through in red with
// the proposed text beside it). This is the Word "Track Changes" workflow
// that PDF tools never offer — it lives here, on-device.

import { toWinAnsi } from '@/utils/pdfTextSafe'

export interface RedlineChange {
  id: string
  page: number            // 1-based; 0 = auto-detect first page containing the text
  original: string
  proposed: string
  note?: string
  state: 'proposed' | 'accepted' | 'rejected'
}

export interface TextHit { page: number; x: number; y: number; w: number; h: number }

// Locate the first occurrence of `needle` across the document's text runs.
export async function findText(file: File, needle: string): Promise<TextHit | null> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  const doc = await pdfjs.getDocument({ standardFontDataUrl: '/pdf-standard-fonts/', data: await file.arrayBuffer() }).promise
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const tc = await page.getTextContent()
      // join items, remember offsets so we can map a match back to an item
      let acc = ''
      const spans: Array<{ start: number; item: any }> = []
      for (const it of tc.items as any[]) {
        spans.push({ start: acc.length, item: it })
        acc += it.str
        if (!it.str.endsWith(' ')) acc += ' '
      }
      const idx = acc.toLowerCase().indexOf(needle.toLowerCase())
      if (idx >= 0) {
        // find the item that contains the match start
        let hit = spans[0]
        for (const s of spans) if (s.start <= idx) hit = s
        const t = hit.item.transform
        const scale = Math.hypot(t[0], t[1]) || 1
        await doc.destroy()
        return { page: p, x: t[4], y: t[5], w: (hit.item.width || 5) * scale, h: (hit.item.height || 10) * scale || 10 }
      }
      page.cleanup()
    }
  } catch { /* fall through */ }
  await doc.destroy()
  return null
}

export async function applyRedlines(
  file: File,
  changes: RedlineChange[],
  mode: 'clean' | 'redline',
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true })
  const helv = await doc.embedFont(StandardFonts.Helvetica)
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const pages = doc.getPages()

  for (const c of changes) {
    const accepted = c.state === 'accepted'
    if (mode === 'clean' && !accepted) continue
    if (mode === 'redline' && c.state === 'rejected') continue
    const hit = await findText(file, c.original)
    if (!hit) continue
    const page = pages[hit.page - 1]
    if (!page) continue
    const size = Math.max(7, Math.min(hit.h, 14))

    if (mode === 'clean') {
      // white-out original, write replacement
      page.drawRectangle({ x: hit.x - 1, y: hit.y - size * 0.25, width: hit.w + 2, height: size * 1.3, color: rgb(1, 1, 1) })
      page.drawText(toWinAnsi(c.proposed), { x: hit.x, y: hit.y, size, font: helv, color: rgb(0, 0, 0) })
    } else {
      // redline: strikethrough original, red proposal above/beside
      const yMid = hit.y + size * 0.35
      page.drawLine({ start: { x: hit.x, y: yMid }, end: { x: hit.x + hit.w, y: yMid }, thickness: 1, color: rgb(0.86, 0.15, 0.15) })
      page.drawText(toWinAnsi(c.proposed), { x: hit.x, y: hit.y + size * 1.35, size, font: helvBold, color: rgb(0.86, 0.15, 0.15) })
      if (c.note) {
        page.drawText(toWinAnsi(`[${c.note.slice(0, 80)}]`), { x: hit.x, y: hit.y - size * 1.2, size: Math.max(6, size - 3), font: helv, color: rgb(0.5, 0.1, 0.1) })
      }
    }
  }
  return doc.save()
}

// Export the negotiation trail as a Markdown record.
export function redlineTrailMarkdown(docName: string, changes: RedlineChange[]): string {
  const lines = [
    `# Redline record — ${docName}`,
    ``,
    `Date: ${new Date().toISOString()}`,
    ``,
    `| # | Page | Original | Proposed | State | Note |`,
    `|---|------|----------|----------|-------|------|`,
    ...changes.map((c, i) =>
      `| ${i + 1} | ${c.page || 'auto'} | ${c.original.replace(/\|/g, '\\|')} | ${c.proposed.replace(/\|/g, '\\|')} | ${c.state} | ${(c.note || '').replace(/\|/g, '\\|')} |`),
  ]
  return lines.join('\n')
}
