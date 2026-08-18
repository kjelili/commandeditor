// tests/einvoice.test.mts — Stage 10 unit tests
import { PDFDocument, PDFName } from 'pdf-lib'
import { buildFacturXXml, computeTotals, attachEInvoice, InvoiceData } from '../utils/einvoice'

let passed = 0, failed = 0
function ok(cond: boolean, name: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name}`) }
}

console.log('einvoice tests')

const data: InvoiceData = {
  number: 'INV-2026-001', issueDate: '2026-08-19',
  sellerName: 'Müller & Söhne <GmbH>', sellerVatId: 'DE123456789',
  buyerName: 'ACME "Corp"', currency: 'EUR',
  lines: [
    { description: 'Consulting, August', quantity: 10, unitPrice: 120, vatPercent: 20 },
    { description: 'Hosting', quantity: 1, unitPrice: 50, vatPercent: 20 },
  ],
}

// totals
const t = computeTotals(data.lines)
ok(Math.abs(t.net - 1250) < 0.001 && Math.abs(t.tax - 250) < 0.001 && Math.abs(t.gross - 1500) < 0.001, 'totals: net/tax/gross')

// XML structure + escaping
const xml = buildFacturXXml(data)
ok(xml.includes('<ram:ID>INV-2026-001</ram:ID>'), 'xml: invoice number')
ok(xml.includes('<udt:DateTimeString format="102">20260819</udt:DateTimeString>'), 'xml: date in 102 format')
ok(xml.includes('Müller &amp; Söhne &lt;GmbH&gt;'), 'xml: seller XML-escaped')
ok(xml.includes('ACME &quot;Corp&quot;'), 'xml: buyer XML-escaped')
ok(xml.includes('<ram:GrandTotalAmount>1500.00</ram:GrandTotalAmount>'), 'xml: grand total')
ok(xml.includes('<ram:TaxTotalAmount currencyID="EUR">250.00</ram:TaxTotalAmount>'), 'xml: tax total with currency')
ok(xml.includes('urn:factur-x.eu:1p0:basicwl'), 'xml: Factur-X guideline declared')
ok((xml.match(/<ram:IncludedSupplyChainTradeLineItem>/g) || []).length === 2, 'xml: 2 line items')

// embedding
const doc = await PDFDocument.create()
const p = doc.addPage([595, 842]); p.drawText('Invoice INV-2026-001', { x: 50, y: 780 })
const pdfFile = new File([await doc.save() as unknown as BlobPart], 'inv.pdf', { type: 'application/pdf' })
const out = await attachEInvoice(pdfFile, xml)
const outBytes = new Uint8Array(await out.arrayBuffer())
const outText = new TextDecoder('latin1').decode(outBytes)
ok(outText.includes('factur-x.xml'), 'embed: filename present')
ok(outText.includes('/AFRelationship'), 'embed: AF relationship declared')
ok(outText.includes('pdfaid'), 'embed: PDF/A-3 XMP marker present')
ok(outText.includes('CrossIndustryDocument'), 'embed: Factur-X XMP schema present')

// reload: attachment extractable + metadata registered
const reloaded = await PDFDocument.load(outBytes)
ok(reloaded.catalog.has(PDFName.of('Metadata')), 'embed: Metadata stream in catalog')
ok(reloaded.catalog.has(PDFName.of('Names')), 'embed: Names tree (attachments) present')

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
