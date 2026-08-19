// tests/desktop.test.mts — Tauri desktop release-readiness checks
import assert from 'node:assert'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const root = process.cwd()
const tauriDir = join(root, 'desktop', 'src-tauri')
let passed = 0
function ok(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`  ✓ ${name}`) })
    .catch(e => { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1 })
}

const conf = JSON.parse(readFileSync(join(tauriDir, 'tauri.conf.json'), 'utf8'))
const cargo = readFileSync(join(tauriDir, 'Cargo.toml'), 'utf8')

console.log('desktop release-readiness')
await ok('tauri.conf.json is valid JSON with bundle identity', () => {
  assert.equal(conf.tauri.bundle.identifier, 'com.commandeditor.desktop')
  assert.ok(conf.tauri.windows.length >= 1)
})
await ok('every referenced bundle asset exists', () => {
  for (const icon of conf.tauri.bundle.icon) {
    assert.ok(existsSync(join(tauriDir, icon)), `missing icon ${icon}`)
  }
  assert.ok(existsSync(join(tauriDir, conf.tauri.systemTray.iconPath)), 'tray icon missing')
  assert.ok(readdirSync(join(tauriDir, 'resources')).length > 0, 'resources/ must not be empty (globbed by bundle)')
  assert.ok(existsSync(join(tauriDir, conf.tauri.bundle.macOS.entitlements)), 'entitlements.plist missing')
})
await ok('distDir matches the Next static export produced by CI', () => {
  assert.equal(conf.build.distDir, '../../out')
  // CI pre-builds the web app; tauri must not try to run npm itself
  assert.equal(conf.build.beforeBuildCommand, '')
  const next = readFileSync(join(root, 'next.config.js'), 'utf8')
  assert.ok(next.includes('TAURI_BUILD'), 'next.config.js must gate output:export on TAURI_BUILD')
})
await ok('updater disabled until a real endpoint exists', () => {
  assert.equal(conf.tauri.bundle.updater.active, false)
})
await ok('Cargo.toml metadata points at the real repo', () => {
  assert.ok(cargo.includes('repository = "https://github.com/kjelili/commandeditor"'))
  assert.ok(/tauri = \{ version = "1\.5"/.test(cargo))
})
await ok('release workflow exists with full OS matrix', () => {
  const wf = readFileSync(join(root, 'desktop', 'desktop.yml'), 'utf8')
  for (const os of ['ubuntu-22.04', 'windows-latest', 'macos-latest']) assert.ok(wf.includes(os), `missing ${os}`)
  assert.ok(wf.includes('tauri-apps/tauri-action@v0'))
  assert.ok(wf.includes('TAURI_BUILD'))
  assert.ok(wf.includes("tags:"), 'must build releases from tags')
  execFileSync(process.execPath, ['-e', `
    // minimal YAML sanity: no tabs, balanced top-level keys
    const s = ${JSON.stringify(readFileSync(join(root, 'desktop', 'desktop.yml'), 'utf8'))};
    if (/\\t/.test(s)) throw new Error('tabs in YAML');
    for (const k of ['name:', 'on:', 'jobs:']) if (!s.includes(k)) throw new Error('missing ' + k);
  `])
})
await ok('desktop package.json provides the tauri CLI', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'desktop', 'package.json'), 'utf8'))
  assert.ok(pkg.devDependencies['@tauri-apps/cli'])
})

console.log(`\n${passed} passed, ${process.exitCode ? 'FAILURES' : '0 failures'}`)
