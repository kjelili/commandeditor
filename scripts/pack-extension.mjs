// scripts/pack-extension.mjs — build the Chrome Web Store upload zip
// Usage: node scripts/pack-extension.mjs
// Output: extension/dist/commandeditor-extension-<version>.zip
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const extDir = join(root, 'extension')
const manifest = JSON.parse(readFileSync(join(extDir, 'manifest.json'), 'utf8'))

const FILES = [
  'manifest.json', 'background.js', 'popup.html',
  'icon16.png', 'icon32.png', 'icon48.png', 'icon128.png',
]

const JSZip = require('jszip')
const zip = new JSZip()
for (const f of FILES) {
  zip.file(f, readFileSync(join(extDir, f)))
}
const outDir = join(extDir, 'dist')
mkdirSync(outDir, { recursive: true })
const out = join(outDir, `commandeditor-extension-${manifest.version}.zip`)
writeFileSync(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
console.log(`✓ Packed ${out}`)
console.log('  Upload this file at https://chrome.google.com/webstore/devconsole')
