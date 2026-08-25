// tests/voiceCompound.test.mts — pure unit tests for multi-step voice parsing
//
// Mirrors the pure helpers in components/VoiceCommand.tsx so we can validate
// the compound-split / multi-step contract without pulling React or the full
// COMMAND_MAP into Node. Keep this in sync if the split regex changes.
import assert from 'node:assert'

let passed = 0
function ok(name: string, fn: () => void) {
  try {
    fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (e: any) {
    console.error(`  ✗ ${name}\n    ${e.message}`)
    process.exitCode = 1
  }
}

console.log('voiceCompound')

// ── Replicate pure helpers (must stay in sync with VoiceCommand.tsx) ──────
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/\bpee\s*dee\s*(ef|eff|fee)\b/gi, 'pdf')
    .replace(/\bpea\s*day\s*eff\b/gi, 'pdf')
    .replace(/\bhey\s*(ed\w*|editor?)\b/gi, '')
    .replace(/\bok(ay)?\s*(ed\w*|editor?)\b/gi, '')
    .replace(/\bhello\s*(ed\w*|editor?)\b/gi, '')
    .replace(/\b(please|can you|could you|i want to|i need to|i'?d like to|would you|will you)\s*/gi, '')
    .replace(/\bkompres\b/gi, 'compress')
    .replace(/\bkompress\b/gi, 'compress')
    .replace(/\bspelet\b/gi, 'split')
    .replace(/\bmerj\b/gi, 'merge')
    .replace(/\bsafe\s+the\b/gi, 'save the')
    .replace(/\bdownlod\b/gi, 'download')
    .replace(/\bdawnload\b/gi, 'download')
    .trim()
}

const COMPOUND_SPLIT =
  /\s*(?:,\s*(?:and\s+)?|(?:\band\s+then\b|\bthen\b|\band\s+after\s+that\b|\bafter\s+that\b|\band\s+also\b|\bfollowed\s+by\b|\bnext\b)\s+)/i

function splitCompoundUtterance(raw: string): string[] {
  const norm = normalise(raw)
  if (!norm || norm.length < 2) return []
  if (!COMPOUND_SPLIT.test(norm)) return [norm]
  return norm
    .split(COMPOUND_SPLIT)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2)
}

// Minimal keyword → action map for contract tests (subset of real COMMAND_MAP)
const MINI_MAP: Array<{ action: string; keywords: RegExp }> = [
  { action: 'merge', keywords: /\b(merge|join|combine)\b/i },
  { action: 'compress', keywords: /\b(compress|shrink|make it smaller)\b/i },
  { action: 'pagenum', keywords: /\b(page numbers?|number (the )?pages?)\b/i },
  { action: 'download', keywords: /\b(download|save)\b/i },
  { action: 'print', keywords: /\b(print)\b/i },
  { action: 'ocr', keywords: /\b(ocr|make searchable)\b/i },
  { action: 'watermark', keywords: /\b(watermark|stamp confidential)\b/i },
  { action: 'rotate', keywords: /\b(rotate|turn the pages)\b/i },
  { action: 'grayscale', keywords: /\b(grayscale|black and white)\b/i },
]

function scoreMini(segment: string): { action: string; score: number } | null {
  for (const cmd of MINI_MAP) {
    if (cmd.keywords.test(segment)) return { action: cmd.action, score: 0.95 }
  }
  return null
}

function parseCompound(raw: string): string[] {
  const segments = splitCompoundUtterance(raw)
  const steps: string[] = []
  for (const segment of segments) {
    const top = scoreMini(segment)
    if (top && top.score >= 0.85) {
      if (steps.length === 0 || steps[steps.length - 1] !== top.action) {
        steps.push(top.action)
      }
    }
  }
  return steps.slice(0, 5)
}

// ── normalise ─────────────────────────────────────────────────────────────
ok('normalise strips wake word "hey editor"', () => {
  assert.equal(normalise('hey editor merge the files'), 'merge the files')
})
ok('normalise strips politeness', () => {
  assert.equal(normalise('please can you compress this'), 'compress this')
})
ok('normalise fixes common mis-hearings', () => {
  assert.ok(normalise('kompres the pdf').includes('compress'))
  assert.ok(normalise('merj them').includes('merge'))
})

// ── splitCompoundUtterance ────────────────────────────────────────────────
ok('split keeps single phrase intact', () => {
  assert.deepEqual(splitCompoundUtterance('compress the pdf'), ['compress the pdf'])
})
ok('split on "and then"', () => {
  const s = splitCompoundUtterance('merge and then compress')
  assert.ok(s.length >= 2)
  assert.ok(s[0].includes('merge'))
  assert.ok(s[1].includes('compress'))
})
ok('bare "and" does not split tool phrases (black and white)', () => {
  const s = splitCompoundUtterance('black and white')
  assert.equal(s.length, 1)
  assert.ok(s[0].includes('black') && s[0].includes('white'))
})
ok('split on "then"', () => {
  assert.equal(splitCompoundUtterance('compress then watermark').length, 2)
})
ok('split on comma + and', () => {
  const s = splitCompoundUtterance('merge, number the pages, and download')
  assert.ok(s.length >= 3)
})
ok('split on "after that"', () => {
  assert.equal(splitCompoundUtterance('ocr after that download').length, 2)
})
ok('split on "next"', () => {
  assert.equal(splitCompoundUtterance('rotate next grayscale').length, 2)
})

// ── parseCompound (contract) ──────────────────────────────────────────────
ok('parse single command still works (regression)', () => {
  assert.deepEqual(parseCompound('merge the files'), ['merge'])
})
ok('parse two-step: compress then download', () => {
  assert.deepEqual(parseCompound('compress then download'), ['compress', 'download'])
})
ok('parse three-step: merge, page numbers, download', () => {
  const steps = parseCompound('merge them, number the pages, and download')
  assert.ok(steps.length >= 2)
  assert.ok(steps.includes('merge'))
  assert.ok(steps.includes('download') || steps.includes('pagenum'))
})
ok('parse drops low-confidence noise segments', () => {
  assert.deepEqual(parseCompound('xyzzy then compress'), ['compress'])
})
ok('parse dedupes consecutive identical actions', () => {
  assert.deepEqual(parseCompound('merge and combine the files'), ['merge'])
})
ok('parse caps at 5 steps', () => {
  const long =
    'merge then compress then watermark then rotate then grayscale then download then ocr'
  assert.ok(parseCompound(long).length <= 5)
})
ok('parse empty / too short returns []', () => {
  assert.deepEqual(parseCompound(''), [])
  assert.deepEqual(parseCompound('a'), [])
})
ok('parse OCR and then download', () => {
  const steps = parseCompound('OCR and then download')
  assert.ok(steps.includes('ocr'))
  assert.ok(steps.includes('download'))
})
ok('bare "and" stays single-command (regression for tool phrases)', () => {
  // Must NOT split into multiple steps; single-command path handles it
  const steps = parseCompound('black and white')
  assert.ok(steps.length <= 1, 'must not produce multi-step from tool phrase')
})
ok('parse print after download', () => {
  const steps = parseCompound('download then print')
  assert.deepEqual(steps, ['download', 'print'])
})

console.log(`\n${passed} tests passed`)
if (process.exitCode) process.exit(1)
