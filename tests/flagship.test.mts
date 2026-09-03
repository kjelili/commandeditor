// tests/flagship.test.mts — regression tests for the flagship tool operations
// (the 15 tools we promise always work). Pure, headless: exercises the real
// utils/* code paths with pdf-lib, no browser. Other flagship ops are covered
// by sibling suites: rotate/watermark/pagenum/compress (cli.test), protect/
// unlock (pdfCrypto.test), rearrange/reverse/remove (pageOps.test), convert
// (wordConvert.test), sanitize (sanitizePdf.test).
import assert from 'node:assert'
import { PDFDocument } from 'pdf-lib'
import { mergePDFs, splitPDF, editPDF, redactPDF } from '../utils/pdfOperations'

let passed = 0
async function ok(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`) }
  catch (e: any) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1 }
}

async function makePDF(pages: number, label: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage([300, 400])
    p.drawText(`${label} ${i + 1}`, { x: 20, y: 360, size: 20 })
  }
  return doc.save()
}
const fileFrom = (bytes: Uint8Array, name: string) =>
  new File([bytes as BlobPart], name, { type: 'application/pdf' })
const pageCount = async (blob: Blob) =>
  (await PDFDocument.load(await blob.arrayBuffer())).getPageCount()
const isPdf = async (blob: Blob) =>
  Buffer.from(await blob.arrayBuffer()).subarray(0, 5).toString() === '%PDF-'

console.log('flagship regression')

await ok('merge: page counts add up + valid PDF', async () => {
  const a = fileFrom(await makePDF(2, 'A'), 'a.pdf')
  const b = fileFrom(await makePDF(3, 'B'), 'b.pdf')
  const out = await mergePDFs([a, b])
  assert.ok(await isPdf(out), 'not a PDF')
  assert.equal(await pageCount(out), 5)
})

await ok('merge: single file is a passthrough of pages', async () => {
  const out = await mergePDFs([fileFrom(await makePDF(4, 'S'), 's.pdf')])
  assert.equal(await pageCount(out), 4)
})

await ok('split: extracts the requested 1-based pages', async () => {
  const f = fileFrom(await makePDF(5, 'P'), 'p.pdf')
  assert.equal(await pageCount(await splitPDF(f, [2, 4])), 2)
})

await ok('split: single page', async () => {
  const f = fileFrom(await makePDF(3, 'P'), 'p.pdf')
  assert.equal(await pageCount(await splitPDF(f, [1])), 1)
})

await ok('edit: text overlay preserves page count + valid PDF', async () => {
  const f = fileFrom(await makePDF(1, 'E'), 'e.pdf')
  const out = await editPDF(f, [{ text: 'HELLO', x: 50, y: 50, page: 1 }])
  assert.ok(await isPdf(out))
  assert.equal(await pageCount(out), 1)
  assert.ok((await out.arrayBuffer()).byteLength > 0, 'empty output')
})

await ok('redact: draws box, keeps page count, valid PDF', async () => {
  const f = fileFrom(await makePDF(2, 'R'), 'r.pdf')
  const out = await redactPDF(f, [{ page: 1, x: 10, y: 10, w: 100, h: 20 }])
  assert.ok(await isPdf(out))
  assert.equal(await pageCount(out), 2)
})

console.log(`\n${passed} passed`)
