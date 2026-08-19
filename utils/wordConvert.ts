// wordConvert.ts — layout-aware PDF → editable Word (.docx) conversion
//
// The old converter embedded a raster image of each page into a .docx —
// the result looked right but the text was not selectable or editable,
// which is exactly what users judge a "PDF to Word" tool by.
//
// This module rebuilds an *editable* document instead:
//   - pdf.js text items are clustered into lines (same baseline) and
//     lines into paragraphs (vertical-gap heuristics for wrapped text).
//   - A font-size histogram finds the body size; larger text becomes
//     Heading 1/2/3, Bold/Italic font names become real Word formatting.
//   - Bullet glyphs (•, -, –, ·, ▪) become real Word bullet lists.
//   - Pages with no text layer at all (scans) fall back to an embedded
//     page image so no content is silently dropped.
//
// The analysis core (pageItemsToBlocks) is pure and unit-tested in Node;
// only convertPDFToWord touches pdf.js / canvas.

export interface WordItem {
  str: string
  x: number        // left edge, viewport units
  y: number        // baseline, viewport units (y grows downward)
  width: number    // advance width, viewport units
  height: number   // font size, viewport units
  fontName: string
}

export interface WordRun {
  text: string
  bold: boolean
  italic: boolean
  size: number     // points
}

export type WordBlockKind = 'h1' | 'h2' | 'h3' | 'p' | 'bullet'

export interface WordBlock {
  kind: WordBlockKind
  runs: WordRun[]
  align: 'left' | 'center' | 'right'
}

export interface WordPageContent {
  blocks: WordBlock[]
  hasText: boolean
}

const BOLD_RE = /bold|black|semibold|demi|heavy|extrabold/i
const ITALIC_RE = /italic|oblique/i
const BULLET_RE = /^\s*(•|◦|▪|·|●|○|\*|-\s|–\s|—\s)/

interface Line {
  y: number
  height: number
  items: WordItem[]
}

function clusterLines(items: WordItem[]): Line[] {
  // pdf.js default coordinates are PDF user space: y grows UPWARD, so the
  // visually-first line has the LARGEST y. Sort descending.
  const usable = items
    .filter(it => it.str.trim().length > 0 && it.height > 0)
    .sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: Line[] = []
  for (const it of usable) {
    const last = lines[lines.length - 1]
    const tol = Math.max(2, it.height * 0.35)
    if (last && Math.abs(it.y - last.y) <= tol) {
      last.items.push(it)
      last.height = Math.max(last.height, it.height)
      // keep a height-weighted baseline so the line y stays stable
      last.y = (last.y * (last.items.length - 1) + it.y) / last.items.length
    } else {
      lines.push({ y: it.y, height: it.height, items: [it] })
    }
  }
  for (const l of lines) l.items.sort((a, b) => a.x - b.x)
  return lines
}

/** Most common rounded font size in the document = body text size. */
function bodySize(lines: Line[]): number {
  const hist = new Map<number, number>()
  for (const l of lines) {
    const key = Math.round(l.height * 2) / 2
    hist.set(key, (hist.get(key) || 0) + l.items.length)
  }
  let best = 12, bestCount = -1
  for (const [size, count] of hist) {
    if (count > bestCount || (count === bestCount && size < best)) { best = size; bestCount = count }
  }
  return best
}

/** Merge a line's items into styled runs, re-inserting spaces pdf.js split out. */
function lineToRuns(line: Line): WordRun[] {
  const runs: WordRun[] = []
  for (const it of line.items) {
    const bold = BOLD_RE.test(it.fontName)
    const italic = ITALIC_RE.test(it.fontName)
    let text = it.str
    const prevItem = line.items[line.items.indexOf(it) - 1]
    if (prevItem) {
      const gap = it.x - (prevItem.x + prevItem.width)
      if (gap > it.height * 0.22 && runs.length > 0 && !runs[runs.length - 1].text.endsWith(' ') && !text.startsWith(' ')) {
        text = ' ' + text
      }
    }
    const prev = runs[runs.length - 1]
    if (prev && prev.bold === bold && prev.italic === italic && Math.abs(prev.size - it.height) < 0.6) {
      prev.text += text
    } else {
      runs.push({ text, bold, italic, size: Math.round(it.height * 2) / 2 })
    }
  }
  return runs
}

function headingKind(lineHeight: number, body: number): WordBlockKind | null {
  if (lineHeight >= body * 1.95) return 'h1'
  if (lineHeight >= body * 1.5) return 'h2'
  if (lineHeight >= body * 1.25) return 'h3'
  return null
}

function lineAlignment(line: Line, pageWidth: number): 'left' | 'center' | 'right' {
  const first = line.items[0]
  const last = line.items[line.items.length - 1]
  const left = first.x
  const right = last.x + last.width
  const centerDelta = Math.abs((left + (pageWidth - right)) / 2 - Math.min(left, pageWidth - right))
  const lineWidth = right - left
  if (lineWidth < pageWidth * 0.7 && Math.abs(left - (pageWidth - right)) < pageWidth * 0.06) return 'center'
  if (lineWidth < pageWidth * 0.5 && left > pageWidth * 0.55) return 'right'
  void centerDelta
  return 'left'
}

/** Analyse one page's pdf.js text items into structured Word blocks. */
export function pageItemsToBlocks(items: WordItem[], pageWidth: number): WordPageContent {
  const lines = clusterLines(items)
  if (lines.length === 0) return { blocks: [], hasText: false }
  const body = bodySize(lines)
  const blocks: WordBlock[] = []

  let prevLine: Line | null = null
  let prevBlock: WordBlock | null = null
  for (const line of lines) {
    const runs = lineToRuns(line)
    const text = runs.map(r => r.text).join('').trim()
    if (!text) { prevLine = line; continue }

    const hKind = headingKind(line.height, body)
    const isBullet = !hKind && BULLET_RE.test(text)
    const kind: WordBlockKind = hKind ?? (isBullet ? 'bullet' : 'p')
    // Word renders its own bullet glyph — strip the PDF's literal one.
    if (isBullet) {
      runs[0].text = runs[0].text.replace(BULLET_RE, '').replace(/^\s+/, '')
      if (!runs[0].text) runs.shift()
      if (runs.length === 0) { prevLine = line; continue }
    }

    // Continuation heuristic: a line that follows a same-size body line with a
    // small gap, where the previous line did not end a sentence, is wrapped
    // text — append it to the previous paragraph instead of a new one.
    // (y grows upward, so the gap of the NEXT visual line is prev - current.)
    const gap = prevLine ? prevLine.y - line.y : Infinity
    const prevText = prevBlock ? prevBlock.runs.map(r => r.text).join('').trimEnd() : ''
    const isContinuation =
      kind === 'p' && prevBlock?.kind === 'p' && prevLine !== null &&
      gap < line.height * 1.55 &&
      Math.abs(line.height - prevLine.height) < 0.6 &&
      !/[.!?:;…]["')\]]?$/.test(prevText) && prevText.length > 0

    if (isContinuation && prevBlock) {
      const lastRun = prevBlock.runs[prevBlock.runs.length - 1]
      if (lastRun && runs.length > 0 && !lastRun.text.endsWith(' ') && !runs[0].text.startsWith(' ')) {
        lastRun.text += ' '
      }
      prevBlock.runs.push(...runs)
    } else {
      const block: WordBlock = { kind, runs, align: lineAlignment(line, pageWidth) }
      blocks.push(block)
      prevBlock = block
    }
    prevLine = line
  }
  return { blocks, hasText: blocks.length > 0 }
}

export interface WordPageImage {
  data: ArrayBuffer
  /** width / height ratio of the source page */
  ratio: number
}

export interface BuildDocxOptions {
  title?: string
  /** Raster fallback for textless (scanned) pages, indexed by page number. */
  pageImages?: Map<number, WordPageImage>
}

/** Assemble the .docx from analysed pages. Returns raw docx bytes. */
export async function buildWordDocument(pages: WordPageContent[], opts: BuildDocxOptions = {}): Promise<ArrayBuffer> {
  const {
    Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType, PageBreak,
  } = await import('docx')

  const alignMap = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT } as const
  const headingMap = { h1: HeadingLevel.HEADING_1, h2: HeadingLevel.HEADING_2, h3: HeadingLevel.HEADING_3 } as const

  const clampSize = (pt: number) => Math.min(96, Math.max(14, Math.round(pt * 2))) // half-points

  const children: InstanceType<typeof Paragraph>[] = []
  pages.forEach((page, pageIdx) => {
    if (!page.hasText) {
      const img = opts.pageImages?.get(pageIdx)
      if (img) {
        const widthEmu = 540  // ~6.0in usable width in px-equivalent used by docx transformation
        const heightEmu = Math.round(widthEmu * img.ratio)
        children.push(new Paragraph({
          children: pageIdx > 0 ? [new PageBreak(), new ImageRun({ data: img.data, transformation: { width: widthEmu, height: heightEmu }, type: 'png' })]
                                : [new ImageRun({ data: img.data, transformation: { width: widthEmu, height: heightEmu }, type: 'png' })],
        }))
      }
      return
    }
    page.blocks.forEach((block, blockIdx) => {
      const runs = block.runs.map(r => new TextRun({
        text: r.text,
        bold: r.bold || block.kind.startsWith('h'),
        italics: r.italic,
        size: clampSize(r.size),
      }))
      const isFirst = pageIdx > 0 && blockIdx === 0
      if (block.kind === 'bullet') {
        children.push(new Paragraph({
          children: isFirst ? [new PageBreak(), ...runs] : runs,
          bullet: { level: 0 },
          alignment: alignMap.left,
          spacing: { after: 60 },
        }))
      } else if (block.kind in headingMap) {
        children.push(new Paragraph({
          children: isFirst ? [new PageBreak(), ...runs] : runs,
          heading: headingMap[block.kind as 'h1' | 'h2' | 'h3'],
          alignment: alignMap[block.align],
          spacing: { before: 240, after: 120 },
        }))
      } else {
        children.push(new Paragraph({
          children: isFirst ? [new PageBreak(), ...runs] : runs,
          alignment: alignMap[block.align],
          spacing: { after: 120 },
        }))
      }
    })
  })

  const doc = new Document({
    creator: 'CommandEditor',
    title: opts.title || 'Converted document',
    description: 'Converted from PDF entirely on-device by CommandEditor (commandeditor.com)',
    sections: [{
      properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
      children,
    }],
  })
  const buf = await Packer.toBuffer(doc)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}
