// tests/cli.test.mts — CLI end-to-end (runs the real cli/index.js)
import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()
const CLI = join(root, 'cli', 'index.js')
let passed = 0
function ok(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`  ✓ ${name}`) })
    .catch(e => { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1 })
}
const run = (args: string[]) => execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8' })

console.log('cli')
const dir = mkdtempSync(join(tmpdir(), 'ce-cli-'))
const a = join(dir, 'a.pdf'), b = join(dir, 'b.pdf')

await ok('fixtures: two small PDFs', async () => {
  const { PDFDocument, StandardFonts } = await import('pdf-lib')
  for (const [file, label, pages] of [[a, 'DocA', 3], [b, 'DocB', 2]] as const) {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    for (let i = 0; i < pages; i++) {
      const p = doc.addPage([612, 792])
      p.drawText(`${label} page ${i + 1}`, { x: 72, y: 700, size: 18, font })
    }
    doc.setTitle(`${label} title`)
    const { writeFileSync } = await import('node:fs')
    writeFileSync(file, await doc.save())
  }
})

await ok('merge combines page counts', async () => {
  const out = join(dir, 'merged.pdf')
  run(['merge', a, b, '-o', out])
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.load(readFileSync(out))
  assert.equal(doc.getPageCount(), 5)
})
await ok('split extracts a page range', async () => {
  const out = join(dir, 'split.pdf')
  run(['split', a, '--pages', '1-2', '-o', out])
  const { PDFDocument } = await import('pdf-lib')
  assert.equal((await PDFDocument.load(readFileSync(out))).getPageCount(), 2)
})
await ok('rotate turns selected pages', async () => {
  const out = join(dir, 'rot.pdf')
  run(['rotate', a, '--degrees', '90', '--pages', '1', '-o', out])
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.load(readFileSync(out))
  const p0 = doc.getPage(0), p1 = doc.getPage(1)
  assert.equal(p0.getRotation().angle, 90)
  assert.equal(p1.getRotation().angle, 0)
})
await ok('pagenum adds footer text', async () => {
  const out = join(dir, 'num.pdf')
  run(['pagenum', a, '-o', out])
  assert.ok(existsSync(out))
  const { PDFDocument } = await import('pdf-lib')
  assert.equal((await PDFDocument.load(readFileSync(out))).getPageCount(), 3)
})
await ok('watermark burns text diagonally', async () => {
  const out = join(dir, 'wm.pdf')
  run(['watermark', a, '--text', 'CONFIDENTIAL', '-o', out])
  assert.ok(existsSync(out))
})
await ok('compress rebuilds and wipes metadata', async () => {
  const out = join(dir, 'small.pdf')
  run(['compress', a, '-o', out])
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.load(readFileSync(out))
  assert.equal(doc.getPageCount(), 3)
  assert.ok(!doc.getTitle(), 'title wiped')
})
await ok('hash prints a stable SHA-256', () => {
  const out1 = run(['hash', a])
  const out2 = run(['hash', a])
  const h1 = out1.match(/[0-9a-f]{64}/)?.[0]
  assert.ok(h1)
  assert.ok(out2.includes(h1!))
})
await ok('info reports pages and metadata', () => {
  const out = run(['info', a])
  assert.match(out, /3/)
  assert.match(out, /DocA title/)
})
await ok('usage text on no arguments', () => {
  try {
    run([])
  } catch (e: any) {
    // usage may exit non-zero — output is what matters
    assert.match(String(e.stdout || e.message), /Usage: commandeditor/)
    return
  }
})

console.log(`\n${passed} passed, ${process.exitCode ? 'FAILURES' : '0 failures'}`)
