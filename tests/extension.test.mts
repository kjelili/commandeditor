// tests/extension.test.mts — Chrome Web Store readiness checks
import assert from 'node:assert'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const extDir = join(process.cwd(), 'extension')
let passed = 0
function ok(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`  ✓ ${name}`) })
    .catch(e => { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1 })
}
function pngSize(path: string): [number, number] {
  const b = readFileSync(path)
  assert.equal(b.readUInt32BE(0), 0x89504e47, 'not a PNG')
  return [b.readUInt32BE(16), b.readUInt32BE(20)]
}

const manifest = JSON.parse(readFileSync(join(extDir, 'manifest.json'), 'utf8'))

console.log('extension store-readiness')
await ok('manifest v3 with required store fields', () => {
  assert.equal(manifest.manifest_version, 3)
  for (const k of ['name', 'version', 'description', 'icons', 'action']) assert.ok(manifest[k], `missing ${k}`)
  assert.ok(manifest.description.length <= 132, 'description exceeds store short-description limit')
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/)
})
await ok('minimal permissions — privacy posture intact', () => {
  assert.deepEqual(manifest.permissions, ['contextMenus'])
  assert.ok(!manifest.host_permissions, 'host_permissions must stay absent')
  assert.ok(!manifest.optional_permissions)
})
await ok('all referenced files exist on disk', () => {
  const refs = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
  ]
  for (const r of refs) assert.ok(existsSync(join(extDir, r as string)), `missing ${r}`)
})
await ok('icon set covers 16/32/48/128 at true sizes', () => {
  for (const size of [16, 32, 48, 128]) {
    const file = join(extDir, manifest.icons[String(size)])
    const [w, h] = pngSize(file)
    assert.equal(w, size, `${file} width`)
    assert.equal(h, size, `${file} height`)
  }
})
await ok('background service worker is syntactically valid', () => {
  execFileSync(process.execPath, ['--check', join(extDir, 'background.js')])
})
await ok('no remote code — popup links only to commandeditor.com', () => {
  const html = readFileSync(join(extDir, 'popup.html'), 'utf8')
  assert.ok(!/<script[^>]+src=/i.test(html), 'remote script in popup')
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1])
  for (const h of hrefs) assert.ok(h.startsWith('https://commandeditor.com'), `unexpected link ${h}`)
  const bg = readFileSync(join(extDir, 'background.js'), 'utf8')
  assert.ok(!/fetch\(|XMLHttpRequest|importScripts|WebSocket/i.test(bg), 'background makes network calls')
})
await ok('packaging script produces a valid store zip', async () => {
  execFileSync(process.execPath, [join(process.cwd(), 'scripts', 'pack-extension.mjs')], { stdio: 'pipe' })
  const zipPath = join(extDir, 'dist', `commandeditor-extension-${manifest.version}.zip`)
  assert.ok(existsSync(zipPath), 'zip not created')
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(readFileSync(zipPath))
  for (const f of ['manifest.json', 'background.js', 'popup.html', 'icon16.png', 'icon128.png']) {
    assert.ok(zip.file(f), `zip missing ${f}`)
  }
})

console.log(`\n${passed} passed, ${process.exitCode ? 'FAILURES' : '0 failures'}`)
