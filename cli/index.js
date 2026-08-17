#!/usr/bin/env node
/* CommandEditor CLI — the same privacy-first toolkit, headless.
 *
 *   npx commandeditor merge a.pdf b.pdf -o out.pdf
 *   npx commandeditor split input.pdf --pages 1-3,7 -o out.pdf
 *   npx commandeditor rotate input.pdf --degrees 90 [--pages 2,4] -o out.pdf
 *   npx commandeditor pagenum input.pdf -o out.pdf
 *   npx commandeditor watermark input.pdf --text CONFIDENTIAL -o out.pdf
 *   npx commandeditor compress input.pdf -o out.pdf
 *   npx commandeditor hash input.pdf
 *   npx commandeditor info input.pdf
 *
 * Everything runs locally — files never leave the machine (same promise as
 * the web app). Requires Node 18+. Depends only on pdf-lib.
 */

const fs = require('fs')
const path = require('path')

const USAGE = `CommandEditor CLI — private, headless PDF tools

Usage: commandeditor <command> <files...> [options]

Commands:
  merge <a.pdf> <b.pdf> [...] -o out.pdf      Combine PDFs in order
  split <in.pdf> --pages 1-3,7 -o out.pdf     Extract page ranges
  rotate <in.pdf> --degrees 90 [--pages 2,4]  Rotate pages (90/180/270)
  pagenum <in.pdf> [-o out.pdf]               Add page numbers
  watermark <in.pdf> --text "CONFIDENTIAL"    Diagonal watermark on every page
  compress <in.pdf> -o out.pdf                Rebuild with object streams, wipe metadata
  hash <in.pdf>                               SHA-256 fingerprint
  info <in.pdf>                               Pages, size, metadata

Options:
  -o, --output <path>     Output file (default: <name>-<command>.pdf)
  --pages <spec>          e.g. 1-3,7,10-12 (1-based)
  --degrees <90|180|270>  Rotation angle
  --text <string>         Watermark text
`

function fail(msg) { console.error(`✗ ${msg}`); process.exit(1) }
function ok(msg) { console.log(`✓ ${msg}`) }

// pdf-lib standard fonts encode WinAnsi only — drawing anything else throws
// at save time. Map common typography, degrade the rest visibly but safely.
function toWinAnsi(s) {
  const rep = { '\u2018': "'", '\u2019': "'", '\u201C': '"', '\u201D': '"', '\u2013': '-', '\u2014': '--', '\u2026': '...', '\u2022': '*', '\u2192': '->', '\u20AC': 'EUR', '\u00A9': '(c)', '\u00AE': '(r)', '\u2122': '(tm)', '\u00A0': ' ' }
  let out = ''
  for (const ch of String(s)) {
    const c = ch.codePointAt(0)
    if (rep[ch] !== undefined) out += rep[ch]
    else if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa1 && c <= 0xff)) out += ch
    else out += '?'
  }
  return out
}

function parseArgs(argv) {
  const args = { _: [], flags: {} }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-o' || a === '--output') args.flags.output = argv[++i]
    else if (a === '--pages') args.flags.pages = argv[++i]
    else if (a === '--degrees') args.flags.degrees = parseInt(argv[++i], 10)
    else if (a === '--text') args.flags.text = argv[++i]
    else if (a.startsWith('-')) fail(`Unknown flag: ${a}\n\n${USAGE}`)
    else args._.push(a)
  }
  return args
}

function parsePageSpec(spec, total) {
  if (!spec || spec === 'all') return Array.from({ length: total }, (_, i) => i)
  const pages = new Set()
  for (const part of spec.split(',')) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/)
    if (!m) fail(`Bad page spec: "${part}" (use e.g. 1-3,7)`)
    const from = parseInt(m[1], 10)
    const to = m[2] ? parseInt(m[2], 10) : from
    if (from < 1 || to > total || from > to) fail(`Page range ${part} out of bounds (document has ${total} pages)`)
    for (let p = from; p <= to; p++) pages.add(p - 1)
  }
  return [...pages].sort((a, b) => a - b)
}

const readPdf = (f) => {
  if (!fs.existsSync(f)) fail(`File not found: ${f}`)
  return fs.readFileSync(f)
}
const defaultOut = (input, cmd, ext = '.pdf') =>
  input.replace(/\.pdf$/i, '') + `-${cmd}${ext}`

async function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  if (!cmd || cmd === '-h' || cmd === '--help' || cmd === 'help') { console.log(USAGE); process.exit(0) }
  const { _: files, flags } = parseArgs(rest)
  const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib')

  switch (cmd) {
    case 'merge': {
      if (files.length < 2) fail('merge needs at least two PDFs')
      const out = await PDFDocument.create()
      for (const f of files) {
        const src = await PDFDocument.load(readPdf(f), { ignoreEncryption: true })
        const pages = await out.copyPages(src, src.getPageIndices())
        pages.forEach(p => out.addPage(p))
      }
      const outPath = flags.output || defaultOut(files[0], 'merged')
      fs.writeFileSync(outPath, await out.save())
      ok(`Merged ${files.length} files → ${outPath}`)
      break
    }
    case 'split': {
      if (!files[0]) fail('split needs an input PDF')
      const src = await PDFDocument.load(readPdf(files[0]), { ignoreEncryption: true })
      const keep = parsePageSpec(flags.pages, src.getPageCount())
      const out = await PDFDocument.create()
      const pages = await out.copyPages(src, keep)
      pages.forEach(p => out.addPage(p))
      const outPath = flags.output || defaultOut(files[0], 'split')
      fs.writeFileSync(outPath, await out.save())
      ok(`Extracted ${keep.length} pages → ${outPath}`)
      break
    }
    case 'rotate': {
      if (!files[0]) fail('rotate needs an input PDF')
      if (![90, 180, 270].includes(flags.degrees)) fail('--degrees must be 90, 180 or 270')
      const doc = await PDFDocument.load(readPdf(files[0]), { ignoreEncryption: true })
      const targets = parsePageSpec(flags.pages, doc.getPageCount())
      for (const i of targets) {
        const p = doc.getPage(i)
        p.setRotation(degrees((p.getRotation().angle + flags.degrees) % 360))
      }
      const outPath = flags.output || defaultOut(files[0], 'rotated')
      fs.writeFileSync(outPath, await doc.save())
      ok(`Rotated ${targets.length} page(s) by ${flags.degrees}° → ${outPath}`)
      break
    }
    case 'pagenum': {
      if (!files[0]) fail('pagenum needs an input PDF')
      const doc = await PDFDocument.load(readPdf(files[0]), { ignoreEncryption: true })
      const font = await doc.embedFont(StandardFonts.Helvetica)
      const pages = doc.getPages()
      pages.forEach((p, i) => {
        const label = `${i + 1} / ${pages.length}`
        const w = font.widthOfTextAtSize(label, 9)
        p.drawText(label, { x: (p.getWidth() - w) / 2, y: 20, size: 9, font, color: rgb(0.3, 0.3, 0.3) })
      })
      const outPath = flags.output || defaultOut(files[0], 'numbered')
      fs.writeFileSync(outPath, await doc.save())
      ok(`Numbered ${pages.length} pages → ${outPath}`)
      break
    }
    case 'watermark': {
      if (!files[0]) fail('watermark needs an input PDF')
      const text = toWinAnsi(flags.text || 'CONFIDENTIAL')
      const doc = await PDFDocument.load(readPdf(files[0]), { ignoreEncryption: true })
      const font = await doc.embedFont(StandardFonts.HelveticaBold)
      for (const p of doc.getPages()) {
        const size = Math.min(p.getWidth(), p.getHeight()) / (text.length * 0.55)
        const w = font.widthOfTextAtSize(text, size)
        p.drawText(text, {
          x: (p.getWidth() - w) / 2, y: p.getHeight() / 2 - size / 3,
          size, font, color: rgb(0.6, 0.1, 0.1), opacity: 0.25,
          rotate: degrees(-45),
        })
      }
      const outPath = flags.output || defaultOut(files[0], 'watermarked')
      fs.writeFileSync(outPath, await doc.save())
      ok(`Watermarked "${text}" → ${outPath}`)
      break
    }
    case 'compress': {
      if (!files[0]) fail('compress needs an input PDF')
      const input = readPdf(files[0])
      const doc = await PDFDocument.load(input, { ignoreEncryption: true })
      doc.setTitle(''); doc.setAuthor(''); doc.setSubject('')
      doc.setKeywords([]); doc.setProducer(''); doc.setCreator('')
      const outPath = flags.output || defaultOut(files[0], 'compressed')
      const bytes = await doc.save({ useObjectStreams: true })
      fs.writeFileSync(outPath, bytes)
      const saved = input.length - bytes.length
      ok(`${outPath} — ${(bytes.length / 1024).toFixed(0)} KB (${saved > 0 ? (saved / 1024).toFixed(0) + ' KB / ' + Math.round(saved / input.length * 100) + '% smaller' : 'already optimal'})`)
      break
    }
    case 'hash': {
      if (!files[0]) fail('hash needs an input PDF')
      const crypto = require('crypto')
      const hex = crypto.createHash('sha256').update(readPdf(files[0])).digest('hex')
      console.log(hex + '  ' + path.basename(files[0]))
      break
    }
    case 'info': {
      if (!files[0]) fail('info needs an input PDF')
      const bytes = readPdf(files[0])
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
      const p0 = doc.getPage(0)
      console.log(`File:     ${path.basename(files[0])}`)
      console.log(`Size:     ${(bytes.length / 1024).toFixed(1)} KB`)
      console.log(`Pages:    ${doc.getPageCount()}`)
      console.log(`Page 1:   ${p0.getWidth().toFixed(0)} × ${p0.getHeight().toFixed(0)} pt`)
      console.log(`Title:    ${doc.getTitle() || '—'}`)
      console.log(`Author:   ${doc.getAuthor() || '—'}`)
      console.log(`Created:  ${doc.getCreationDate()?.toISOString() || '—'}`)
      console.log(`Modified: ${doc.getModificationDate()?.toISOString() || '—'}`)
      break
    }
    default:
      fail(`Unknown command: ${cmd}\n\n${USAGE}`)
  }
}

main().catch(e => fail(e.message || String(e)))
