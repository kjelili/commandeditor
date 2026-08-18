// tests/repairPdf.test.mts — Stage 2 unit tests (node, rebuild path only;
// rasterize path needs a browser canvas and is covered by build + UI checks)
import { PDFDocument } from 'pdf-lib'
import { repairPDF, sanitisePdfBytes } from '../utils/repairPdf'

let passed = 0, failed = 0
function ok(cond: boolean, name: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name}`) }
}

async function makePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) doc.addPage([612, 792])
  doc.setTitle('Repair Test Doc')
  return doc.save()
}

console.log('repairPdf tests')

// 1. healthy file roundtrips through rebuild
const healthy = await makePdf(3)
const r1 = await repairPDF(new File([healthy as unknown as BlobPart], 'a.pdf', { type: 'application/pdf' }), 'rebuild')
ok(r1.pages === 3 && r1.method === 'structure rebuild', 'rebuild: healthy file keeps all pages')
const check1 = await PDFDocument.load(await r1.blob.arrayBuffer())
ok(check1.getPageCount() === 3 && check1.getTitle() === 'Repair Test Doc', 'rebuild: output loads + metadata survives')

// 2. junk prefix (email-forward style corruption)
const junk = new TextEncoder().encode('-----BEGIN FORWARDED MESSAGE-----\r\nblah blah\r\n')
const prefixed = new Uint8Array(junk.length + healthy.length)
prefixed.set(junk, 0); prefixed.set(healthy, junk.length)
const san = sanitisePdfBytes(prefixed)
ok(san[0] === 0x25 && san[1] === 0x50, 'sanitise: junk prefix stripped')
const r2 = await repairPDF(new File([prefixed as unknown as BlobPart], 'b.pdf', { type: 'application/pdf' }), 'rebuild')
ok(r2.pages === 3, 'rebuild: prefixed file recovered')

// 3. trailing garbage after %%EOF
const trailer = new TextEncoder().encode('\nRANDOM TRAILING GARBAGE \x00\x01\x02 NOT PART OF PDF')
const tailed = new Uint8Array(healthy.length + trailer.length)
tailed.set(healthy, 0); tailed.set(trailer, healthy.length)
const r3 = await repairPDF(new File([tailed as unknown as BlobPart], 'c.pdf', { type: 'application/pdf' }), 'rebuild')
ok(r3.pages === 3, 'rebuild: trailing garbage recovered')

// 4. sanitise is a no-op on clean files (same reference semantics)
const untouched = sanitisePdfBytes(healthy)
ok(untouched.length === healthy.length, 'sanitise: clean file untouched')

// 5. truly unparseable input throws (no silent success)
let threw = false
try {
  await repairPDF(new File([new Uint8Array([1, 2, 3, 4, 5]) as unknown as BlobPart], 'x.pdf'), 'rebuild')
} catch { threw = true }
ok(threw, 'rebuild: garbage input throws (node: no rasterize fallback)')

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
