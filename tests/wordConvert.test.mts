// tests/wordConvert.test.mts — PDF → editable Word conversion
import assert from 'node:assert'
import { pageItemsToBlocks, buildWordDocument, type WordItem } from '../utils/wordConvert'

let passed = 0
function ok(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`  ✓ ${name}`) })
    .catch(e => { console.error(`  ✗ ${name}\n    ${e.stack}`); process.exitCode = 1 })
}
const item = (str: string, x: number, y: number, height = 12, fontName = 'g_d0_f1 sans-serif', width?: number): WordItem =>
  ({ str, x, y, height, fontName, width: width ?? str.length * height * 0.5 })

console.log('wordConvert')
await ok('same-baseline items merge into one line, ordered by x', () => {
  const { blocks } = pageItemsToBlocks([
    item('world', 120, 100), item('Hello', 60, 100),
  ], 612)
  assert.equal(blocks.length, 1)
  const text = blocks[0].runs.map(r => r.text).join('')
  assert.match(text, /Hello\s+world/)
})
await ok('different baselines become separate paragraphs when sentence ends', () => {
  const { blocks } = pageItemsToBlocks([
    item('First sentence.', 60, 116),
    item('Second sentence.', 60, 100),
  ], 612)
  assert.equal(blocks.length, 2)
})
await ok('wrapped lines (no sentence end, small gap) continue the paragraph', () => {
  const { blocks } = pageItemsToBlocks([
    item('This is a long line that keeps', 60, 114),
    item('going on the next line.', 60, 100),
  ], 612)
  assert.equal(blocks.length, 1)
  assert.match(blocks[0].runs.map(r => r.text).join(''), /keeps going/)
})
await ok('large text becomes headings by size ratio', () => {
  const { blocks } = pageItemsToBlocks([
    item('Big Title', 60, 160, 30),
    item('Medium Head', 60, 130, 19),
    item('Subhead here', 60, 100, 15.5),
    item('Body text line.', 60, 70, 12),
  ], 612)
  const kinds = blocks.map(b => b.kind)
  assert.deepEqual(kinds, ['h1', 'h2', 'h3', 'p'])
})
await ok('bold/italic detected from font family name', () => {
  const { blocks } = pageItemsToBlocks([
    item('Bolded', 60, 120, 12, 'g_d0_f1 Helvetica-Bold'),
    item('Slanted', 60, 100, 12, 'g_d0_f2 Times-Italic'),
  ], 612)
  assert.equal(blocks[0].runs[0].bold, true)
  assert.equal(blocks[1].runs[0].italic, true)
})
await ok('bullet glyphs become bullet blocks', () => {
  const { blocks } = pageItemsToBlocks([
    item('• First point', 72, 132),
    item('- Second point', 72, 116),
    item('Normal paragraph.', 72, 100),
  ], 612)
  assert.deepEqual(blocks.map(b => b.kind), ['bullet', 'bullet', 'p'])
})
await ok('empty page reports hasText=false (scanned fallback path)', () => {
  const { blocks, hasText } = pageItemsToBlocks([item('   ', 0, 0)], 612)
  assert.equal(hasText, false)
  assert.equal(blocks.length, 0)
})
await ok('spaces re-inserted when pdf.js splits words with a gap', () => {
  const { blocks } = pageItemsToBlocks([
    item('invoice', 60, 100, 12, 'g sans', 45), item('total:', 130, 100, 12, 'g sans', 35),
  ], 612)
  assert.match(blocks[0].runs.map(r => r.text).join(''), /invoice total:/)
})

// ── End-to-end: real PDF → docx → inspect XML ────────────────────────────
await ok('end-to-end: styled PDF produces styled docx XML', async () => {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg = await doc.embedFont(StandardFonts.Helvetica)
  const p1 = doc.addPage([612, 792])
  p1.drawText('Quarterly Report', { x: 72, y: 700, size: 28, font: bold, color: rgb(0, 0, 0) })
  p1.drawText('Revenue grew this quarter and the', { x: 72, y: 650, size: 12, font: reg })
  p1.drawText('outlook remains positive.', { x: 72, y: 634, size: 12, font: reg })
  p1.drawText('• Costs fell', { x: 84, y: 600, size: 12, font: reg })
  const p2 = doc.addPage([612, 792])
  p2.drawText('Appendix starts here.', { x: 72, y: 700, size: 12, font: reg })
  const bytes = await doc.save()

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).pathname
  const pdf = await pdfjs.getDocument({ data: bytes }).promise
  const pages = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const vp = page.getViewport({ scale: 1 })
    try { await page.getOperatorList() } catch { /* cosmetic only */ }
    const tc = await page.getTextContent()
    const baseFont = (fn: string): string => {
      try {
        const objs = (page as any).commonObjs
        return objs?.has(fn) ? (objs.get(fn)?.name ?? '') : ''
      } catch { return '' }
    }
    const items = tc.items.filter((it: any) => typeof it.str === 'string').map((it: any) => ({
      str: it.str, x: it.transform[4], y: it.transform[5],
      width: it.width ?? 0, height: it.height || 12,
      fontName: `${baseFont(it.fontName)} ${it.fontName} ${(tc.styles as any)?.[it.fontName]?.fontFamily ?? ''}`,
    }))
    pages.push(pageItemsToBlocks(items, vp.width))
  }
  assert.equal(pages.length, 2)
  assert.ok(pages[0].hasText && pages[1].hasText)
  // title must be a heading
  assert.ok(pages[0].blocks.some(b => b.kind.startsWith('h') && /Quarterly Report/.test(b.runs.map(r => r.text).join(''))))
  // wrapped body lines must be one paragraph
  const bodyBlock = pages[0].blocks.find(b => /Revenue grew/.test(b.runs.map(r => r.text).join('')))
  assert.ok(bodyBlock && /outlook remains positive/.test(bodyBlock.runs.map(r => r.text).join('')))
  // bullet detected
  assert.ok(pages[0].blocks.some(b => b.kind === 'bullet' && /Costs fell/.test(b.runs.map(r => r.text).join(''))))

  const docxBuf = await buildWordDocument(pages, { title: 'test' })
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(docxBuf)
  const xml = await zip.file('word/document.xml')!.async('string')
  assert.match(xml, /Quarterly Report/)
  assert.match(xml, /Heading1|Heading2/)                     // real Word heading style
  assert.match(xml, /<w:b\/>/)                               // bold title run
  assert.match(xml, /<w:numPr>/)                             // real Word bullet
  assert.match(xml, /<w:br w:type="page"\/>/)                // page break before page 2
  assert.match(xml, /Appendix starts here\./)
})

await ok('textless page with fallback image embeds the image part', async () => {
  // 2x2 transparent PNG
  const pngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGP8//8/AzGAiShVAAj3Av/9m0o0AAAAAElFTkSuQmCC'
  const data = Uint8Array.from(atob(pngB64), c => c.charCodeAt(0)).buffer
  const buf = await buildWordDocument(
    [{ blocks: [], hasText: false }],
    { pageImages: new Map([[0, { data, ratio: 1 }]]) },
  )
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(buf)
  const media = Object.keys(zip.files).filter(f => f.startsWith('word/media/'))
  assert.ok(media.length >= 1, 'expected an embedded media file')
})

console.log(`\n${passed} passed, ${process.exitCode ? 'FAILURES' : '0 failures'}`)
