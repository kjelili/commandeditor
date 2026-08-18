// tests/imposition.test.mts — Stage 6 unit tests
import { PDFDocument } from 'pdf-lib'
import { nupPDF, bookletPDF, bookletOrder } from '../utils/imposition'

let passed = 0, failed = 0
function ok(cond: boolean, name: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name}`) }
}

console.log('imposition tests')

// ── booklet order math ──
ok(JSON.stringify(bookletOrder(8)) === JSON.stringify([[7, 0], [1, 6], [5, 2], [3, 4]]), 'booklet: 8 pages → classic saddle order')
ok(JSON.stringify(bookletOrder(5)) === JSON.stringify([[7, 0], [1, 6], [5, 2], [3, 4]]).replace(/7|6|5/g, m => Number(m) >= 5 ? 'null' : m), 'booklet: 5 pages pad with nulls')
ok(bookletOrder(4).length === 2, 'booklet: 4 pages → 2 sides')
ok(bookletOrder(1)[0][1] === 0 && bookletOrder(1)[0][0] === null, 'booklet: single page sits on right half')

// ── booklet structure ──
async function makeNumberedPdf(n: number): Promise<File> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < n; i++) {
    const p = doc.addPage([400, 600])
    p.drawText(`Page ${i + 1}`, { x: 150, y: 300, size: 40 })
  }
  return new File([await doc.save() as unknown as BlobPart], 'n.pdf', { type: 'application/pdf' })
}

const b = await bookletPDF(await makeNumberedPdf(8))
const bDoc = await PDFDocument.load(await b.arrayBuffer())
ok(bDoc.getPageCount() === 4, 'booklet: 8 pages → 4 landscape sides')
const bSize = bDoc.getPages()[0].getSize()
ok(bSize.width > bSize.height, 'booklet: sheets are landscape')

// verify placement via pdf.js text extraction: side 1 must contain "Page 8" and "Page 1"
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs' as any)
;(pdfjs as any).GlobalWorkerOptions.workerSrc = '/tmp/ce/node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs'
const pj = await (pdfjs as any).getDocument({ data: await b.arrayBuffer() }).promise
const t1 = (await (await pj.getPage(1)).getTextContent()).items.map((i: any) => i.str).join(' ')
ok(t1.includes('Page 8') && t1.includes('Page 1'), 'booklet: side 1 holds pages 8+1')
const t2 = (await (await pj.getPage(2)).getTextContent()).items.map((i: any) => i.str).join(' ')
ok(t2.includes('Page 2') && t2.includes('Page 7'), 'booklet: side 2 holds pages 2+7')
await pj.destroy()

// ── n-up structure ──
const nup = await nupPDF(await makeNumberedPdf(9), { cols: 2, rows: 2 })
const nDoc = await PDFDocument.load(await nup.arrayBuffer())
ok(nDoc.getPageCount() === 3, 'nup: 9 pages 2x2 → 3 sheets')
const pj2 = await (pdfjs as any).getDocument({ data: await nup.arrayBuffer() }).promise
const nt = (await (await pj2.getPage(1)).getTextContent()).items.map((i: any) => i.str).join(' ')
ok(nt.includes('Page 1') && nt.includes('Page 4') && !nt.includes('Page 5'), 'nup: sheet 1 holds pages 1-4')
await pj2.destroy()

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
