// tests/docTools.test.mts — Stage 5 unit tests
import { PDFDocument, PDFName } from 'pdf-lib'
import {
  scalePDFPages, addPDFLink, removePDFLinks, computeContactGrid, importBookmarks
} from '../utils/docTools'

let passed = 0, failed = 0
function ok(cond: boolean, name: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name}`) }
}

async function makePdf(sizes: Array<[number, number]>): Promise<File> {
  const doc = await PDFDocument.create()
  for (const [w, h] of sizes) { const p = doc.addPage([w, h]); p.drawText('content', { x: 20, y: h / 2 }) }
  return new File([await doc.save() as unknown as BlobPart], 't.pdf', { type: 'application/pdf' })
}

console.log('docTools tests')

// ── scale: percent ──
const s1 = await scalePDFPages(await makePdf([[612, 792]]), { mode: 'percent', percent: 50 })
const d1 = await PDFDocument.load(await s1.arrayBuffer())
const sz1 = d1.getPages()[0].getSize()
ok(Math.abs(sz1.width - 306) < 1 && Math.abs(sz1.height - 396) < 1, 'scale: 50% halves the page box')

// ── scale: fit to A4 from Letter ──
const s2 = await scalePDFPages(await makePdf([[612, 792]]), { mode: 'fit', width: 595, height: 842 })
const d2 = await PDFDocument.load(await s2.arrayBuffer())
const sz2 = d2.getPages()[0].getSize()
ok(Math.abs(sz2.width - 595) < 0.5 && Math.abs(sz2.height - 842) < 0.5, 'scale: fit-to-A4 box')

// ── links: add then list then remove ──
const withLink = await addPDFLink(await makePdf([[612, 792]]), { pageIndex: 0, url: 'https://example.com', xPct: 10, yPct: 10, wPct: 30, hPct: 5 })
const d3 = await PDFDocument.load(await withLink.arrayBuffer())
const annots = d3.getPages()[0].node.lookup(PDFName.of('Annots')) as any
ok(annots && annots.size() === 1, 'links: annotation added')
const annot = d3.context.lookup(annots.get(0)) as any
ok(annot.get(PDFName.of('Subtype'))?.toString() === '/Link', 'links: subtype is Link')
const uri = annot.lookup(PDFName.of('A'))?.get(PDFName.of('URI'))?.toString()
ok(uri?.includes('example.com'), 'links: URI stored')

const rm = await removePDFLinks(withLink)
ok(rm.removed === 1, 'links: removal counted')
const d4 = await PDFDocument.load(await rm.blob.arrayBuffer())
ok(!d4.getPages()[0].node.lookup(PDFName.of('Annots')), 'links: annotation array gone after removal')

// ── contact grid math ──
ok(computeContactGrid(9, 4).rows === 3 && computeContactGrid(9, 4).cells.length === 9, 'grid: 9 pages / 4 cols → 3 rows')
ok(computeContactGrid(8, 4).rows === 2, 'grid: exact fit')

// ── bookmarks import ──
const withBm = await importBookmarks(await makePdf([[612, 792], [612, 792], [612, 792]]), [
  { title: 'Intro', page: 0 },
  { title: 'Part 1', page: 1, children: [{ title: 'Section 1.1 — Ünïcode ✓', page: 2 }] },
])
ok(withBm.count === 3, 'bookmarks: 3 entries created')
const d5 = await PDFDocument.load(await withBm.blob.arrayBuffer())
ok(d5.catalog.has(PDFName.of('Outlines')), 'bookmarks: catalog has Outlines')

// verify via pdf.js that the outline is readable and destinations resolve
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs' as any)
;(pdfjs as any).GlobalWorkerOptions.workerSrc = '/tmp/ce/node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs'
const pj = await (pdfjs as any).getDocument({ data: await withBm.blob.arrayBuffer() }).promise
const outline = await pj.getOutline()
ok(outline?.length === 2 && outline[0].title === 'Intro' && outline[1].title === 'Part 1', 'bookmarks: pdf.js reads top-level outline')
ok(outline[1].items?.length === 1 && outline[1].items[0].title.includes('Ünïcode'), 'bookmarks: nested unicode child survives')
const rawDest = outline[1].dest
const destArr = Array.isArray(rawDest) ? rawDest : (typeof rawDest === 'string' ? await pj.getDestination(rawDest) : null)
if (destArr) {
  const idx = await pj.getPageIndex(destArr[0])
  ok(idx === 1, 'bookmarks: Part 1 points at page 2')
} else { ok(false, 'bookmarks: Part 1 destination resolvable') }
await pj.destroy()

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
