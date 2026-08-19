// tests/cloudDesktopAuth.test.mts — desktop OAuth loopback flow checks
//
// Guards the RFC 8252-style desktop sign-in: system browser → registered
// website callback page → relay to the Rust loopback listener on 127.0.0.1.
// Regression guard for "Google flagged tauri.localhost as invalid".
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let passed = 0
function ok(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`  ✓ ${name}`) })
    .catch(e => { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1 })
}

console.log('cloud desktop auth (loopback relay)')

// --- lib/cloudDesktopAuth.ts pure helpers ---
await ok('encodeDesktopState round-trips provider/port/desktop flag', async () => {
  const m = await import('../lib/cloudDesktopAuth')
  const encoded = m.encodeDesktopState('google_drive', 54321, 'abc123')
  const decoded = JSON.parse(atob(encoded))
  assert.equal(decoded.provider, 'google_drive')
  assert.equal(decoded.desktop, true)
  assert.equal(decoded.port, 54321)
  assert.equal(decoded.nonce, 'abc123')
})

await ok('parseLoopbackCallback extracts token + expiry', async () => {
  const m = await import('../lib/cloudDesktopAuth')
  const r = m.parseLoopbackCallback('/api/auth/google/callback?access_token=tok123&expires_in=3599')
  assert.equal(r.accessToken, 'tok123')
  assert.equal(r.expiresIn, 3599)
})

await ok('parseLoopbackCallback throws on provider error', async () => {
  const m = await import('../lib/cloudDesktopAuth')
  assert.throws(() => m.parseLoopbackCallback('/cb?error=access_denied'), /access_denied/)
})

await ok('parseLoopbackCallback throws when token missing', async () => {
  const m = await import('../lib/cloudDesktopAuth')
  assert.throws(() => m.parseLoopbackCallback('/cb?expires_in=100'), /access token/)
})

await ok('parseLoopbackCallback defaults expiry to 3600', async () => {
  const m = await import('../lib/cloudDesktopAuth')
  assert.equal(m.parseLoopbackCallback('/cb?access_token=x').expiresIn, 3600)
})

await ok('relay origin is the production site (registered callbacks)', async () => {
  const m = await import('../lib/cloudDesktopAuth')
  assert.equal(m.DESKTOP_RELAY_ORIGIN, 'https://commandeditor.com')
})

// --- Rust shell ---
const mainRs = readFileSync(join(process.cwd(), 'desktop/src-tauri/src/main.rs'), 'utf8')

await ok('Rust shell exposes loopback listener commands', () => {
  assert.ok(mainRs.includes('fn start_oauth_listener'), 'start_oauth_listener missing')
  assert.ok(mainRs.includes('fn await_oauth_callback'), 'await_oauth_callback missing')
  assert.ok(mainRs.includes('TcpListener::bind("127.0.0.1:0")'), 'must bind ephemeral loopback port')
  const handler = mainRs.slice(mainRs.indexOf('generate_handler!'))
  assert.ok(handler.includes('start_oauth_listener'), 'listener not registered in generate_handler')
  assert.ok(handler.includes('await_oauth_callback'), 'awaiter not registered in generate_handler')
})

await ok('listener never touches the network beyond loopback', () => {
  assert.ok(!mainRs.includes('reqwest'), 'no HTTP client dep needed — token comes via browser')
  assert.ok(mainRs.includes('recv_timeout'), 'must time out abandoned sign-ins')
})

// --- Tauri config ---
await ok('withGlobalTauri enabled (webview needs __TAURI__ bridge)', () => {
  const conf = JSON.parse(readFileSync(join(process.cwd(), 'desktop/src-tauri/tauri.conf.json'), 'utf8'))
  assert.equal(conf.build.withGlobalTauri, true)
  assert.ok(conf.tauri.allowlist.shell?.open, 'shell-open required to launch the system browser')
})

// --- CloudConnector desktop branches ---
const cc = readFileSync(join(process.cwd(), 'components/CloudConnector.tsx'), 'utf8')

await ok('all three providers route through the desktop flow in Tauri', () => {
  const branches = cc.match(/if \(isDesktopRuntime\(\)\)/g) || []
  assert.ok(branches.length >= 3, `expected >=3 desktop branches, found ${branches.length}`)
  for (const call of ["runDesktopOAuth('google_drive'", "runDesktopOAuth('dropbox'", "runDesktopOAuth('onedrive'"]) {
    assert.ok(cc.includes(call), `missing ${call}`)
  }
})

await ok('desktop flow uses the registered production callback, never tauri.localhost', () => {
  const codeOnly = cc.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  const desktopSection = codeOnly.slice(codeOnly.indexOf('isDesktopRuntime'))
  assert.ok(!desktopSection.includes('tauri.localhost'), 'desktop redirect must not use tauri.localhost')
  assert.ok(cc.includes('DESKTOP_RELAY_ORIGIN'), 'must route via the relay origin')
})

// --- callback pages relay ---
for (const prov of ['google', 'dropbox', 'onedrive']) {
  await ok(`${prov} callback page relays desktop flows to loopback`, () => {
    const page = readFileSync(join(process.cwd(), `app/api/auth/${prov}/callback/page.tsx`), 'utf8')
    assert.ok(page.includes('relayToDesktopIfNeeded'), 'relay call missing')
    const lib = readFileSync(join(process.cwd(), 'lib/cloudDesktopAuth.ts'), 'utf8')
    assert.ok(lib.includes('127.0.0.1'), 'relay must target loopback')
    assert.ok(lib.includes('state.desktop'), 'relay must key off the desktop state flag')
  })
}

console.log(`\n${passed} passed`)
if (process.exitCode) process.exit(process.exitCode)
