// tests/compressRedact.test.mts — regression tests for the two bugs fixed in
// the thorough audit: (1) compress must never produce a LARGER file, and it
// must handle multiple PDFs; (2) redact must return a valid PDF with the page
// count intact (true-rasterization is browser-only; headless falls back to
// opaque boxes, which we still validate here).
import assert from 'node:assert'
import { PDFDocument } from 'pdf-lib'
import { compressPDF, compressMultiplePDFs, redactPDF } from '../utils/pdfOperations'

let passed = 0
async function ok(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`) }
  catch (e: any) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1 }
}

async function makePDF(pages: number, label: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage([300, 400])
    p.drawText(`${label} page ${i + 1} - some body text to give the file substance.`, { x: 20, y: 360, size: 12 })
  }
  return doc.save()
}
const fileFrom = (bytes: Uint8Array, name: string) =>
  new File([bytes as BlobPart], name, { type: 'application/pdf' })
const pageCount = async (blob: Blob) =>
  (await PDFDocument.load(await blob.arrayBuffer())).getPageCount()
const isPdf = async (blob: Blob) =>
  Buffer.from(await blob.arrayBuffer()).subarray(0, 5).toString() === '%PDF-'

console.log('compress + redact audit')

await ok('compress: output is never larger than input (size-safe)', async () => {
  const bytes = await makePDF(3, 'C')
  const input = fileFrom(bytes, 'c.pdf')
  for (const q of [0.2, 0.6, 0.9]) {
    const out = await compressPDF(input, q)
    assert.ok(await isPdf(out), `q=${q}: not a PDF`)
    assert.ok(out.size <= bytes.byteLength, `q=${q}: output ${out.size} > input ${bytes.byteLength} (bloated!)`)
    assert.equal(await pageCount(out), 3, `q=${q}: page count changed`)
  }
})

await ok('compress: multiple PDFs -> a ZIP with one compressed file each', async () => {
  const a = fileFrom(await makePDF(2, 'A'), 'a.pdf')
  const b = fileFrom(await makePDF(1, 'B'), 'b.pdf')
  const out = await compressMultiplePDFs([a, b])
  assert.ok(out.type.includes('zip'), 'not a zip mime type')
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(await out.arrayBuffer())
  const names = Object.keys(zip.files).sort()
  assert.deepEqual(names, ['a-compressed.pdf', 'b-compressed.pdf'], `zip entries wrong: ${names}`)
  for (const n of names) {
    const buf = await zip.files[n].async('uint8array')
    assert.equal(Buffer.from(buf).subarray(0, 5).toString(), '%PDF-', `${n} not a PDF`)
  }
})

await ok('redact: returns a valid PDF with page count intact', async () => {
  const f = fileFrom(await makePDF(3, 'R'), 'r.pdf')
  const out = await redactPDF(f, [{ page: 2, x: 30, y: 30, w: 120, h: 40 }])
  assert.ok(await isPdf(out), 'not a PDF')
  assert.equal(await pageCount(out), 3, 'page count changed')
})

await ok('redact: no regions -> passthrough, same page count', async () => {
  const f = fileFrom(await makePDF(2, 'R'), 'r.pdf')
  const out = await redactPDF(f, [])
  assert.equal(await pageCount(out), 2)
})

console.log(`\n${passed} passed${process.exitCode ? ' (with failures)' : ', 0 failures'}`)
