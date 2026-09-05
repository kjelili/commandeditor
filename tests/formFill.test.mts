// tests/formFill.test.mts — verifies the AcroForm fill primitive that the
// Form Intelligence / Voice-Fill tools rely on: create fields, fill by name,
// re-read the values back from the saved PDF.
import assert from 'node:assert'
import { PDFDocument, StandardFonts } from 'pdf-lib'

let passed = 0
async function ok(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`) }
  catch (e: any) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1 }
}

async function makeForm(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([420, 560])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  page.drawText('Registration', { x: 40, y: 510, size: 18, font })
  const form = doc.getForm()
  const name = form.createTextField('name'); name.addToPage(page, { x: 110, y: 452, width: 260, height: 20 })
  const email = form.createTextField('email'); email.addToPage(page, { x: 110, y: 412, width: 260, height: 20 })
  const sub = form.createCheckBox('subscribe'); sub.addToPage(page, { x: 110, y: 372, width: 16, height: 16 })
  return doc.save()
}

console.log('form fill')

await ok('fields are created and enumerable', async () => {
  const doc = await PDFDocument.load(await makeForm())
  const names = doc.getForm().getFields().map(f => f.getName()).sort()
  assert.deepEqual(names, ['email', 'name', 'subscribe'])
})

await ok('filled values round-trip through save/reload', async () => {
  const doc = await PDFDocument.load(await makeForm())
  const form = doc.getForm()
  form.getTextField('name').setText('Jelili Kazeem')
  form.getTextField('email').setText('kjelili@gmail.com')
  form.getCheckBox('subscribe').check()
  const out = await doc.save()
  // reload and confirm
  const doc2 = await PDFDocument.load(out)
  const f2 = doc2.getForm()
  assert.equal(f2.getTextField('name').getText(), 'Jelili Kazeem')
  assert.equal(f2.getTextField('email').getText(), 'kjelili@gmail.com')
  assert.equal(f2.getCheckBox('subscribe').isChecked(), true)
})

await ok('flatten bakes values in and drops interactivity', async () => {
  const doc = await PDFDocument.load(await makeForm())
  const form = doc.getForm()
  form.getTextField('name').setText('Baked In')
  form.flatten()
  const out = await doc.save()
  const doc2 = await PDFDocument.load(out)
  assert.equal(doc2.getForm().getFields().length, 0, 'fields should be gone after flatten')
})

await ok('detectFormFields surfaces existing AcroForm fields', async () => {
  const { detectFormFields } = await import('../utils/formIntelligence')
  const bytes = await makeForm()
  const file = new File([bytes as any], 'form.pdf', { type: 'application/pdf' })
  const fields = await detectFormFields(file)
  const names = fields.map(f => f.name).sort()
  assert.ok(names.includes('name') && names.includes('email'), `expected name+email, got ${names}`)
  const nameField = fields.find(f => f.name === 'name')!
  assert.ok(nameField.width > 0 && nameField.height > 0, 'field has geometry')
})

console.log(`\n${passed} passed${process.exitCode ? ' (with failures)' : ', 0 failures'}`)
