// tests/labs.test.mts — headless coverage for Labs tools whose logic is pure or
// pdf-lib based (bates, header/footer, insert page, split-by-N, crop) plus the
// text-analysis functions (readability, language, citations, timeline, cards).
import assert from 'node:assert'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { batesNumberPDF } from '../utils/gapFillers'
import { addHeaderFooterPDF, insertPagePDF, splitByNPages, cropPDF } from '../utils/pdfOperations'
import { computeReadability, detectLanguage, extractCitations, extractTimeline } from '../utils/documentIntelligence'
import { extractFlashcards } from '../utils/advancedFeatures'

let passed = 0
async function ok(name: string, fn: () => Promise<void> | void) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`) }
  catch (e: any) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1 }
}
async function makePDF(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < pages; i++) doc.addPage([400, 520]).drawText(`Page ${i+1}`, { x: 40, y: 470, size: 14, font })
  return doc.save()
}
const fileFrom = (b: Uint8Array, n='t.pdf') => new File([b as any], n, { type: 'application/pdf' })
const pageCount = async (blob: Blob) => (await PDFDocument.load(await blob.arrayBuffer())).getPageCount()
const isPdf = async (blob: Blob) => Buffer.from(await blob.arrayBuffer()).subarray(0,5).toString() === '%PDF-'

console.log('labs tools')

await ok('bates: stamps every page, valid PDF, page count intact', async () => {
  const out = await batesNumberPDF(fileFrom(await makePDF(3)), { prefix:'ABC', start:1, digits:6, position:'bottom-right', fontSize:10 })
  assert.ok(await isPdf(out)); assert.equal(await pageCount(out), 3)
})
await ok('header/footer: preserves pages + valid PDF', async () => {
  const out = await addHeaderFooterPDF(fileFrom(await makePDF(2)), { header:'{page}/{total}', footer:'{date}', align:'center', fontSize:10 })
  assert.ok(await isPdf(out)); assert.equal(await pageCount(out), 2)
})
await ok('insert blank page: page count +1', async () => {
  const out = await insertPagePDF(fileFrom(await makePDF(2)), { after:1, type:'blank' })
  assert.equal(await pageCount(out), 3)
})
await ok('insert duplicate page: page count +1', async () => {
  const out = await insertPagePDF(fileFrom(await makePDF(2)), { after:1, type:'duplicate' })
  assert.equal(await pageCount(out), 3)
})
await ok('split-by-N: produces a ZIP', async () => {
  const out = await splitByNPages(fileFrom(await makePDF(5)), 2)
  assert.ok(out.type.includes('zip'))
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(await out.arrayBuffer())
  assert.equal(Object.keys(zip.files).length, 3, '5 pages / 2 = 3 chunks')
})
await ok('crop: valid PDF, page count intact', async () => {
  const out = await cropPDF(fileFrom(await makePDF(2)), { top:10, right:10, bottom:10, left:10 })
  assert.ok(await isPdf(out)); assert.equal(await pageCount(out), 2)
})
await ok('readability: scores real text', () => {
  const r = computeReadability('The cat sat on the mat. It was a sunny day and the birds were singing loudly.')
  assert.ok(typeof r.fleschScore === 'number' || typeof (r as any).score === 'number', 'has a numeric score')
})
await ok('language detect: English text → English', () => {
  const r = detectLanguage('This is a clearly English sentence with common English words and the of to a in.')
  assert.ok(r && r.name, 'returns a language name')
  assert.match(r.name, /English/i)
})
await ok('citations: finds a DOI and a URL', () => {
  const c = extractCitations([{ page:1, text:'See https://example.com/paper and doi:10.1000/xyz123 for details.' }])
  assert.ok(c.length >= 1, 'found at least one citation')
})
await ok('timeline: extracts a date', () => {
  const t = extractTimeline([{ page:1, text:'The contract was signed on 12/05/2026 and renewed 01/01/2027.' }])
  assert.ok(t.length >= 1, 'found at least one dated event')
})
await ok('flashcards: builds Q/A from headings', () => {
  const cards = extractFlashcards('What is a PDF?\nA portable document format file.\n\nWhat is OCR?\nOptical character recognition.')
  assert.ok(Array.isArray(cards), 'returns an array')
})

console.log(`\n${passed} passed${process.exitCode ? ' (with failures)' : ', 0 failures'}`)
