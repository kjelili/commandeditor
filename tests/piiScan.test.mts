// tests/piiScan.test.mts — regression tests for the PII scanner, including the
// IPv4 fix (previously matched 2 octets, flagging "v2.4" as an IP address).
import assert from 'node:assert'
import { scanForPII } from '../utils/documentIntelligence'

let passed = 0
function ok(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { console.error(`  ✗ ${name}`); process.exitCode = 1 }
}
const scan = (t: string) => scanForPII([{ page: 1, text: t }])
const types = (t: string) => new Set(scan(t).map(m => m.type))

console.log('PII scanner')

ok('detects a real IPv4 address', types('server at 192.168.1.254 responded').has('IPv4 Address'))
ok('does NOT flag version numbers as IPv4', !types('upgraded to v2.4 today').has('IPv4 Address'))
ok('does NOT flag a 3-octet fragment as IPv4', !types('ratio 10.20.30 shown').has('IPv4 Address'))
ok('detects an email address', types('reach me at jane.doe@example.com please').has('Email'))
ok('detects a US SSN', types('SSN: 123-45-6789 on file').has('Social Security'))
ok('detects a Visa card number', types('card 4111111111111111 charged').has('Credit Card'))
ok('clean text yields no findings', scan('The quick brown fox jumps over the lazy dog.').length === 0)

console.log(`\n${passed} passed${process.exitCode ? ' (with failures)' : ', 0 failures'}`)
