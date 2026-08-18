// tests/pageOps.test.mts — Stage 1 unit tests (node + tsx, no browser needed)
import { PDFDocument } from 'pdf-lib'
import {
  reversePageOrder, removePagesByIndex, interleavePDFs, computeSplitRanges
} from '../utils/pageOps'

let passed = 0, failed = 0
function ok(cond: boolean, name: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name}`) }
}

async function makePdf(widths: number[]): Promise<File> {
  const doc = await PDFDocument.create()
  for (const w of widths) doc.addPage([w, 800])
  const bytes = await doc.save()
  return new File([bytes as unknown as BlobPart], 'test.pdf', { type: 'application/pdf' })
}

async function pageWidths(file: File | Blob): Promise<number[]> {
  const doc = await PDFDocument.load(await file.arrayBuffer())
  return doc.getPages().map(p => p.getSize().width)
}

console.log('pageOps tests')

// ── reverse ──
const r = await reversePageOrder(await makePdf([100, 200, 300]))
ok(JSON.stringify(await pageWidths(r)) === JSON.stringify([300, 200, 100]), 'reverse: order flipped')

// ── removePagesByIndex ──
const d = await removePagesByIndex(await makePdf([100, 200, 300, 400]), [1, 3])
ok(JSON.stringify(await pageWidths(d)) === JSON.stringify([100, 300]), 'remove: correct pages dropped')
let threw = false
try { await removePagesByIndex(await makePdf([100]), [0]) } catch { threw = true }
ok(threw, 'remove: refuses to delete every page')

// ── interleave ──
const il = await interleavePDFs(await makePdf([100, 200, 300]), await makePdf([10, 20, 30]), true)
ok(JSON.stringify(await pageWidths(il)) === JSON.stringify([100, 30, 200, 20, 300, 10]), 'interleave: reverse-B duplex order')
const il2 = await interleavePDFs(await makePdf([100, 200, 300]), await makePdf([10, 20, 30]), false)
ok(JSON.stringify(await pageWidths(il2)) === JSON.stringify([100, 10, 200, 20, 300, 30]), 'interleave: straight order')
const il3 = await interleavePDFs(await makePdf([100, 200, 300]), await makePdf([10]), false)
ok(JSON.stringify(await pageWidths(il3)) === JSON.stringify([100, 10, 200, 300]), 'interleave: uneven lengths keep remainder')

// ── computeSplitRanges (pure) ──
ok(JSON.stringify(computeSplitRanges([2, 5], 10)) === JSON.stringify([{ start: 0, end: 1 }, { start: 2, end: 4 }, { start: 5, end: 9 }]), 'ranges: mid cuts')
ok(JSON.stringify(computeSplitRanges([0, 4], 6)) === JSON.stringify([{ start: 0, end: 3 }, { start: 4, end: 5 }]), 'ranges: start at 0 ignored as boundary')
ok(JSON.stringify(computeSplitRanges([], 10)) === JSON.stringify([{ start: 0, end: 9 }]), 'ranges: no bookmarks → single range')
ok(JSON.stringify(computeSplitRanges([3, 3, 12], 10)) === JSON.stringify([{ start: 0, end: 2 }, { start: 3, end: 9 }]), 'ranges: dupes + out-of-bounds filtered')

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
