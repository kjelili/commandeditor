// tests/sanitizePdf.test.mts — Stage 4 unit tests
import { PDFDocument, PDFName, PDFString } from 'pdf-lib'
import { sanitizePDF } from '../utils/sanitizePdf'

let passed = 0, failed = 0
function ok(cond: boolean, name: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name}`) }
}

console.log('sanitizePdf tests')

// Build a PDF carrying every category of hidden data
const doc = await PDFDocument.create()
doc.setTitle('Quarterly Layoffs Plan')
doc.setAuthor('HR Department')
doc.setProducer('LeakyApp 2.0')
const page = doc.addPage([612, 792])
page.drawText('visible content', { x: 50, y: 700 })

// comment annotation + a link annotation (links must survive)
const commentRef = doc.context.nextRef()
doc.context.assign(commentRef, doc.context.obj({
  Type: 'Annot', Subtype: 'Text', Rect: [0, 0, 100, 100], Contents: PDFString.of('internal note'),
}))
const linkRef = doc.context.nextRef()
doc.context.assign(linkRef, doc.context.obj({
  Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 50, 50],
}))
page.node.set(PDFName.of('Annots'), doc.context.obj([commentRef, linkRef]))

// XMP metadata + OpenAction + page thumbnail dummies
doc.catalog.set(PDFName.of('Metadata'), doc.context.obj({}))
doc.catalog.set(PDFName.of('OpenAction'), doc.context.obj({}))
page.node.set(PDFName.of('Thumb'), doc.context.obj({}))

const dirty = await doc.save()

const res = await sanitizePDF(new File([dirty as unknown as BlobPart], 'dirty.pdf'), {})
ok(res.removed.some(r => r.includes('metadata')), 'report: metadata removal reported')
ok(res.removed.some(r => r.includes('XMP')), 'report: XMP removal reported')
ok(res.removed.some(r => r.includes('OpenAction')), 'report: OpenAction removal reported')
ok(res.removed.some(r => r.includes('thumbnail')), 'report: thumbnail removal reported')
ok(res.removed.some(r => r.includes('1 comment')), 'report: 1 comment removed, link preserved')

// Verify by reloading the sanitized output
const clean = await PDFDocument.load(await res.blob.arrayBuffer())
ok(clean.getTitle() === '' && clean.getAuthor() === '', 'clean: Info metadata empty')
ok(!clean.catalog.has(PDFName.of('Metadata')), 'clean: XMP stream gone')
ok(!clean.catalog.has(PDFName.of('OpenAction')), 'clean: OpenAction gone')
const p0: any = clean.getPages()[0].node
ok(!p0.has(PDFName.of('Thumb')), 'clean: page thumbnail gone')
const annots = p0.lookup(PDFName.of('Annots'))
ok(annots && annots.size() === 1, 'clean: only the Link annotation remains')
const remaining: any = clean.context.lookup(annots.get(0))
ok(remaining.get(PDFName.of('Subtype'))?.toString() === '/Link', 'clean: remaining annotation is the link')

// pdf-lib stamps a Producer on save, so even a "plain" file carries metadata
const plainDoc = await PDFDocument.create(); plainDoc.addPage([100, 100])
const plain = await plainDoc.save()
const res2 = await sanitizePDF(new File([plain as unknown as BlobPart], 'plain.pdf'), {})
ok(res2.removed.length === 1 && res2.removed[0].includes('metadata'), 'report: plain file only has the producer stamp removed')

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
