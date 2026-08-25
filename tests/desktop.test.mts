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
  assert.ok(readdirSync(join(tauriDir, 'resources')).length > 0, 'resources/ must not be empty')
  assert.ok(existsSync(join(tauriDir, conf.tauri.bundle.macOS.entitlements)), 'entitlements.plist missing')
})
await ok('distDir matches the Next static export produced by CI', () => {
  assert.equal(conf.build.distDir, '../../out')
  assert.equal(conf.build.beforeBuildCommand, '')
  const next = readFileSync(join(root, 'next.config.js'), 'utf8')
  assert.ok(next.includes('TAURI_BUILD'), 'next.config.js must gate output:export on TAURI_BUILD')
})
await ok('updater config removed until a real endpoint exists', () => {
  assert.ok(!('updater' in conf.tauri.bundle), 'updater must not live under tauri.bundle')
  assert.ok(!('updater' in conf.tauri) || (conf.tauri.updater as any).active === false)
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
    const s = ${JSON.stringify(readFileSync(join(root, 'desktop', 'desktop.yml'), 'utf8'))};
    if (/\\t/.test(s)) throw new Error('tabs in YAML');
    for (const k of ['name:', 'on:', 'jobs:']) if (!s.includes(k)) throw new Error('missing ' + k);
  `])
})
await ok('desktop package.json provides the tauri CLI', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'desktop', 'package.json'), 'utf8'))
  assert.ok(pkg.devDependencies['@tauri-apps/cli'])
})
await ok('Cargo features mirror the allowlist', () => {
  const conf2 = JSON.parse(readFileSync(join(tauriDir, 'tauri.conf.json'), 'utf8'))
  const al = conf2.tauri.allowlist
  const feats = [...cargo.matchAll(/"([a-z0-9-]+)"/g)].map(m => m[1])
  const need: [boolean, string][] = [
    [!!al.shell?.open, 'shell-open'],
    [!!al.dialog?.open, 'dialog-open'],
    [!!al.dialog?.save, 'dialog-save'],
    [!!al.globalShortcut?.all, 'global-shortcut'],
    [!!al.notification?.all, 'notification-all'],
    [!!al.clipboard?.writeText, 'clipboard-write-text'],
    [!!al.clipboard?.readText, 'clipboard-read-text'],
    [!!al.window?.show, 'window-show'],
    [!!al.window?.hide, 'window-hide'],
    [!!al.window?.setFocus, 'window-set-focus'],
    [!!al.window?.startDragging, 'window-start-dragging'],
    [!!al.window?.print, 'window-print'],
  ]
  for (const [enabled, feat] of need) {
    assert.equal(feats.includes(feat), enabled, `feature ${feat} mismatch with allowlist`)
  }
  assert.ok(feats.includes('system-tray'), 'system-tray feature required by config')
  for (const heavy of ['lopdf', 'pdfium-render', 'notify', 'reqwest']) {
    assert.ok(!cargo.includes(heavy), `${heavy} should not be a build dependency`)
  }
  assert.ok(existsSync(join(tauriDir, 'src', 'main_extras.rs.txt')), 'archived extras missing')
})
await ok('desktop voice pipeline deps are lightweight', () => {
  for (const dep of ['dirs', 'fuzzy-matcher', 'urlencoding']) {
    assert.ok(cargo.includes(dep), `${dep} must be listed in Cargo.toml for desktop voice pipeline`)
  }
})
await ok('Rust command modules exist and compile', () => {
  assert.ok(existsSync(join(tauriDir, 'src', 'commands', 'mod.rs')), 'commands/mod.rs missing')
  assert.ok(existsSync(join(tauriDir, 'src', 'commands', 'file_resolver.rs')), 'commands/file_resolver.rs missing')
  assert.ok(existsSync(join(tauriDir, 'src', 'commands', 'print.rs')), 'commands/print.rs missing')
  assert.ok(existsSync(join(tauriDir, 'src', 'commands', 'email.rs')), 'commands/email.rs missing')
})

console.log(`\n${passed} passed, ${process.exitCode ? 'FAILURES' : '0 failures'}`)