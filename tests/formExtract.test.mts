// tests/formExtract.test.mts — Stage 8 unit tests
import { PDFDocument } from 'pdf-lib'
import { extractFormData, formDataToCsv } from '../utils/formExtract'

let passed = 0, failed = 0
function ok(cond: boolean, name: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name}`) }
}

console.log('formExtract tests')

// Build a PDF with a filled form
const doc = await PDFDocument.create()
const page = doc.addPage([612, 792])
const form = doc.getForm()
const name = form.createTextField('applicant.name')
name.setText('Ada Lovelace')
name.addToPage(page, { x: 50, y: 700, width: 200, height: 24 })
const check = form.createCheckBox('consent.gdpr')
check.addToPage(page, { x: 50, y: 650, width: 16, height: 16 })
check.check()
const drop = form.createDropdown('plan.tier')
drop.addOptions(['Free', 'Pro', 'Team'])
drop.select('Pro')
drop.addToPage(page, { x: 50, y: 600, width: 200, height: 24 })
const file = new File([await doc.save() as unknown as BlobPart], 'form.pdf', { type: 'application/pdf' })

const fields = await extractFormData(file)
ok(fields.length === 3, `extract: 3 fields found (got ${fields.length})`)
ok(fields.find(f => f.name === 'applicant.name')?.value === 'Ada Lovelace', 'extract: text value correct')
ok(fields.find(f => f.name === 'consent.gdpr')?.value === 'checked', 'extract: checkbox state correct')
ok(fields.find(f => f.name === 'plan.tier')?.value === 'Pro', 'extract: dropdown selection correct')

// CSV output handles commas/quotes in values
const csv = formDataToCsv([{ name: 'a', type: 'text', value: 'has, comma' }, { name: 'b', type: 'text', value: 'has "quote"' }])
ok(csv.includes('"has, comma"') && csv.includes('"has ""quote"""'), 'csv: escaping correct')
ok(csv.startsWith('name,type,value\n'), 'csv: header row')

// Formless PDF yields empty list, not a crash
const plain = await PDFDocument.create(); plain.addPage([100, 100])
const noFields = await extractFormData(new File([await plain.save() as unknown as BlobPart], 'p.pdf'))
ok(noFields.length === 0, 'extract: formless PDF → empty result')

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
