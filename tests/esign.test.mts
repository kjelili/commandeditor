// tests/esign.test.mts — regression tests for the flagship e-signature feature.
// Exercises the real cryptoSign code (ECDSA P-256 over the Web Crypto API,
// available in Node 20+) — sign/verify roundtrip, tamper detection, wrong-key
// rejection, and certificate hash verification.
import assert from 'node:assert'
import { cryptoSigner } from '../utils/cryptoSign'

let passed = 0
async function ok(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`) }
  catch (e: any) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1 }
}
const enc = (s: string) => new TextEncoder().encode(s)

console.log('e-signature (ECDSA P-256)')

await ok('generateIdentity yields a public key + fields', async () => {
  const id = await cryptoSigner.generateIdentity('Jelili', 'k@example.com')
  assert.ok(id.publicKeyJwk, 'missing public key')
  assert.equal(id.name, 'Jelili')
  assert.equal(id.email, 'k@example.com')
})

await ok('sign + verify a document → valid', async () => {
  const id = await cryptoSigner.generateIdentity('A', 'a@example.com')
  const bytes = enc('the quick brown fox — pdf bytes')
  const { signature, hash } = await cryptoSigner.signDocument(bytes)
  assert.ok(signature && hash, 'no signature/hash')
  assert.equal(await cryptoSigner.verifySignature(bytes, signature, id.publicKeyJwk), true)
})

await ok('tampered document → verification fails', async () => {
  const id = await cryptoSigner.generateIdentity('A', 'a@example.com')
  const { signature } = await cryptoSigner.signDocument(enc('original'))
  assert.equal(await cryptoSigner.verifySignature(enc('original!'), signature, id.publicKeyJwk), false)
})

await ok('wrong signer key → verification fails', async () => {
  await cryptoSigner.generateIdentity('A', 'a@example.com')
  const bytes = enc('a contract')
  const { signature } = await cryptoSigner.signDocument(bytes) // signed with A's key
  const other = await cryptoSigner.generateIdentity('B', 'b@example.com') // rotates the key
  assert.equal(await cryptoSigner.verifySignature(bytes, signature, other.publicKeyJwk), false)
})

await ok('certificate: hash matches, tamper detected', async () => {
  const id = await cryptoSigner.generateIdentity('A', 'a@example.com')
  const bytes = enc('contract v1')
  const cert = await cryptoSigner.createCertificate('contract.pdf', bytes, [id], [], [])
  assert.equal((await cryptoSigner.verifyCertificate(cert, bytes)).hashMatch, true)
  assert.equal((await cryptoSigner.verifyCertificate(cert, enc('contract v2'))).hashMatch, false)
})

console.log(`\n${passed} passed`)
