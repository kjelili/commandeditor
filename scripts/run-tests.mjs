#!/usr/bin/env node
// Runs every tests/*.test.mts via tsx and fails if any suite fails.
import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = join(root, 'tests')
const files = readdirSync(dir).filter(f => f.endsWith('.test.mts')).sort()

let failed = 0
for (const f of files) {
  console.log(`\n=== ${f} ===`)
  const r = spawnSync('npx', ['tsx', join(dir, f)], { stdio: 'inherit', cwd: root, shell: process.platform === 'win32' })
  if (r.status !== 0) { failed++; console.error(`FAILED: ${f}`) }
}
console.log(`\n${files.length - failed}/${files.length} suites passed`)
process.exit(failed ? 1 : 0)
