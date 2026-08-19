// tests/cloudConfig.test.mts — cloud import graceful-degradation checks
//
// Regression guard for the "Invalid client_id" failures: every OAuth launch
// path must be gated on a configured client ID, and the UI must hide
// unconfigured providers instead of sending users to provider error pages.
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

console.log('cloud config gating')

// --- lib/cloudConfig.ts behavior (functions read env lazily, so we can
// mutate process.env between assertions within one import) ---
await ok('no env vars → no provider configured', async () => {
  delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  delete process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID
  delete process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID
  const m = await import('../lib/cloudConfig')
  assert.equal(m.isCloudProviderConfigured('google_drive'), false)
  assert.equal(m.isCloudProviderConfigured('dropbox'), false)
  assert.equal(m.isCloudProviderConfigured('onedrive'), false)
  assert.equal(m.anyCloudProviderConfigured(), false)
})

await ok('env var set → that provider configured', async () => {
  process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID = 'test-app-key'
  const m = await import('../lib/cloudConfig')
  assert.equal(m.cloudClientId('dropbox'), 'test-app-key')
  assert.equal(m.isCloudProviderConfigured('dropbox'), true)
  assert.equal(m.isCloudProviderConfigured('google_drive'), false)
  assert.equal(m.anyCloudProviderConfigured(), true)
  delete process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID
})

await ok('filterConfiguredProviders preserves order, drops unconfigured', async () => {
  process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID = 'azure-id'
  const m = await import('../lib/cloudConfig')
  const all = [
    { id: 'google_drive' as const }, { id: 'dropbox' as const }, { id: 'onedrive' as const },
  ]
  assert.deepEqual(m.filterConfiguredProviders(all).map((p: any) => p.id), ['onedrive'])
  delete process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID
})

// --- CloudConnector.tsx source guards ---
const src = readFileSync(join(process.cwd(), 'components/CloudConnector.tsx'), 'utf8')

await ok('every auth function bails out on empty client id', () => {
  for (const env of ['NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'NEXT_PUBLIC_DROPBOX_CLIENT_ID', 'NEXT_PUBLIC_ONEDRIVE_CLIENT_ID']) {
    assert.ok(src.includes(env), `missing ${env} reference`)
  }
  // three auth functions, each with an early-return guard
  const guards = src.match(/if \(!clientId\)/g) || []
  assert.ok(guards.length >= 3, `expected >=3 clientId guards, found ${guards.length}`)
})

await ok('provider grid only renders configured providers', () => {
  assert.ok(src.includes('filterConfiguredProviders'), 'must import the filter helper')
  assert.ok(src.includes('CONFIGURED_PROVIDERS.map'), 'grid must map over configured subset')
  assert.ok(!src.includes('{PROVIDERS.map'), 'raw PROVIDERS list must not be rendered directly')
})

await ok('selection handler refuses unconfigured providers', () => {
  assert.ok(
    src.includes("if (!isCloudProviderConfigured(provider))"),
    'handleProviderSelect must gate on isCloudProviderConfigured',
  )
})

await ok('zero-config fallback panel exists and is honest', () => {
  assert.ok(src.includes("CONFIGURED_PROVIDERS.length === 0"), 'fallback branch missing')
  assert.ok(src.includes("isn't set up in this build"), 'fallback copy missing')
  assert.ok(src.includes('never leaves your machine'), 'must reaffirm local-only posture')
})

await ok('no OAuth URL is built before the clientId guard', () => {
  // in each auth function the window.open(url) must come after if (!clientId)
  for (const fn of ['authGoogleDrive', 'authDropbox', 'authOneDrive']) {
    const start = src.indexOf(`const ${fn} = () => {`)
    assert.ok(start > -1, `${fn} not found`)
    const body = src.slice(start, src.indexOf('\n  };', start))
    const guard = body.indexOf('if (!clientId)')
    const open = body.indexOf('window.open(')
    assert.ok(guard > -1, `${fn}: missing guard`)
    assert.ok(open > guard, `${fn}: popup opens before guard`)
  }
})

console.log(`\n${passed} passed`)
if (process.exitCode) process.exit(process.exitCode)
