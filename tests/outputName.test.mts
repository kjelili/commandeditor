// tests/outputName.test.mts — output filename derivation (node + tsx)
import { buildOutputName, stripKnownSuffixes, stripExtension, OUTPUT_SUFFIXES } from '../utils/outputName'

let passed = 0, failed = 0
function eq(a: string, b: string, name: string) {
  if (a === b) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name}  got "${a}" expected "${b}"`) }
}

console.log('outputName tests')

// extension handling
eq(stripExtension('a.pdf'), 'a', 'strip .pdf')
eq(stripExtension('my.file.PNG'), 'my.file', 'strip last ext only')
eq(stripExtension('noext'), 'noext', 'no extension untouched')

// the reported bug: cascading -converted must NOT accumulate
eq(buildOutputName('Driver Licence and Voters Card.png', 'converted'),
   'Driver Licence and Voters Card-converted', 'first conversion')
eq(buildOutputName('Driver Licence and Voters Card-converted.pdf', 'converted'),
   'Driver Licence and Voters Card-converted', 'no cascade on 2nd run')
eq(buildOutputName('Driver Licence and Voters Card-converted-converted-converted.pdf', 'converted'),
   'Driver Licence and Voters Card-converted', 'collapses deep cascade')

// different files keep their own names
eq(buildOutputName('pfmp cert.png', 'converted'), 'pfmp cert-converted', 'pfmp keeps its name')
eq(buildOutputName('pgmp cert.png', 'converted'), 'pgmp cert-converted', 'pgmp keeps its name')

// switching operations strips the previous op suffix, applies the new one
eq(buildOutputName('report-compressed.pdf', 'watermarked'), 'report-watermarked', 'compress->watermark')
eq(buildOutputName('report-merged.pdf', 'numbered'), 'report-numbered', 'merge->pagenum')

// multi-word suffix collapses correctly (longest-match first)
eq(buildOutputName('deck-contact-sheet.pdf', 'converted'), 'deck-converted', 'multi-word suffix stripped whole')

// does not strip non-suffix tails that merely resemble words
eq(buildOutputName('final-report.pdf', 'signed'), 'final-report-signed', 'real name preserved')

// empty / weird inputs
eq(buildOutputName('', 'converted'), 'output-converted', 'empty -> output base')
eq(stripKnownSuffixes('Driver-converted', OUTPUT_SUFFIXES), 'Driver', 'strip single suffix')

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
