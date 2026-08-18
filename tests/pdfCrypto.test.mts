// tests/pdfCrypto.test.mts — Stage 3 unit tests
import { PDFDocument } from 'pdf-lib'
import { md5, rc4, protectPDF } from '../utils/pdfCrypto'

let passed = 0, failed = 0
function ok(cond: boolean, name: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name}`) }
}
const hex = (u8: Uint8Array) => Array.from(u8, b => b.toString(16).padStart(2, '0')).join('')

console.log('pdfCrypto tests')

// ── primitive vectors (RFC 1321 / RC4 test vectors) ──
ok(hex(md5(new TextEncoder().encode('abc'))) === '900150983cd24fb0d6963f7d28e17f72', 'md5: "abc" vector')
ok(hex(md5(new TextEncoder().encode(''))) === 'd41d8cd98f00b204e9800998ecf8427e', 'md5: empty vector')
ok(hex(md5(new TextEncoder().encode('The quick brown fox jumps over the lazy dog'))) === '9e107d9d372bb6826bd81d3542a419d6', 'md5: fox vector')
ok(hex(rc4(new TextEncoder().encode('Key'), new TextEncoder().encode('Plaintext'))) === 'bbf316e8d940af0ad3', 'rc4: RFC 6229 vector')
ok(hex(rc4(new TextEncoder().encode('Wiki'), new TextEncoder().encode('pedia'))) === '1021bf0420', 'rc4: Wiki vector')

// ── build a PDF with strings, hex strings, and a stream ──
const doc = await PDFDocument.create()
doc.setTitle('Secret Document')
doc.setAuthor('Unit Test')
const page = doc.addPage([612, 792])
const font = await doc.embedFont('Helvetica')
page.drawText('Top secret content here', { x: 50, y: 700, size: 24, font })
const healthy = await doc.save()

// ── protect it ──
const protectedBlob = await protectPDF(
  new File([healthy as unknown as BlobPart], 'secret.pdf', { type: 'application/pdf' }),
  'open-sesame', { allowPrint: true, allowCopy: false })
const pbytes = new Uint8Array(await protectedBlob.arrayBuffer())
const ptext = new TextDecoder('latin1').decode(pbytes)
ok(ptext.includes('/Encrypt'), 'protect: /Encrypt in trailer')
ok(ptext.includes('/Filter /Standard'), 'protect: Standard filter declared')
ok(!ptext.includes('Secret Document'), 'protect: metadata strings encrypted')
ok(!ptext.includes('Top secret'), 'protect: content stream encrypted')

// ── pdf.js must open it with the right password, reject the wrong one ──
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs' as any)
;(pdfjs as any).GlobalWorkerOptions.workerSrc = '/tmp/ce/node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs'
let rejected = false
try {
  const bad = await (pdfjs as any).getDocument({ data: pbytes.slice(), password: 'wrong-password' }).promise
  await bad.getPage(1) // force decryption
  await bad.destroy()
} catch { rejected = true }
ok(rejected, 'decrypt: wrong password rejected')

const good = await (pdfjs as any).getDocument({ data: pbytes.slice(), password: 'open-sesame' }).promise
ok(good.numPages === 1, 'decrypt: correct password opens, page count intact')
const pg = await good.getPage(1)
const tc = await pg.getTextContent()
const text = tc.items.map((i: any) => i.str).join('')
ok(text.includes('Top secret'), 'decrypt: text layer readable after unlock')
await good.destroy()

// ── empty user password must be rejected by the tool itself ──
let threw = false
try { await protectPDF(new File([healthy as unknown as BlobPart], 'x.pdf'), '') } catch { threw = true }
ok(threw, 'protect: empty password rejected')

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
