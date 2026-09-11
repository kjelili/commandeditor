// utils/outputName.ts — builds a stable download filename for a processed file.
//
// Fixes two problems in the multi-operation flow:
//  1. Cascading suffixes ("file-converted-converted-converted") caused by the
//     chained working document being re-suffixed on every run.
//  2. Different source files collapsing to one base name.
//
// Pure + dependency-free so it is unit-testable under node/tsx.

/** Distinct operation suffixes CommandEditor appends to output names. */
export const OUTPUT_SUFFIXES: string[] = [
  'merged', 'split', 'reversed', 'cleaned', 'interleaved', 'chapters', 'repaired',
  'protected', 'sanitized', 'scaled', 'with-links', 'contact-sheet', 'bookmarks',
  'nup', 'booklet', 'scanned', 'form-data', 'e-invoice', 'compressed', 'rotated',
  'cropped', 'reordered', 'pages-added', 'converted', 'tables', 'slides', 'text',
  'data', 'annotated', 'signed', 'watermarked', 'redacted', 'with-image', 'numbered',
  'with-header', 'with-qr', 'updated', 'flattened', 'grayscale', 'bookmarked',
  'resized', 'unlocked', 'encrypted', 'searchable', 'images', 'tiled', 'edited',
  'form', 'with-toc', 'with-barcode',
]

/** Remove the file extension, if any. */
export function stripExtension(name: string): string {
  return (name || '').replace(/\.[^./\\]+$/, '')
}

/**
 * Repeatedly strip trailing "-<knownSuffix>" tokens so a name that has already
 * been through one or more operations collapses back to its original base.
 * Longer suffixes are tried first so e.g. "-contact-sheet" isn't half-matched.
 */
export function stripKnownSuffixes(base: string, suffixes: string[] = OUTPUT_SUFFIXES): string {
  const ordered = [...suffixes].sort((a, b) => b.length - a.length)
  let b = base
  let changed = true
  while (changed) {
    changed = false
    for (const s of ordered) {
      const tail = '-' + s
      if (b.length > tail.length && b.slice(-tail.length).toLowerCase() === tail.toLowerCase()) {
        b = b.slice(0, -tail.length)
        changed = true
        break
      }
    }
  }
  return b
}

/**
 * Build the output base name for a processed file: take the source filename,
 * drop its extension, strip any accumulated operation suffixes, then append the
 * current operation's suffix exactly once.
 *
 * @param sourceName  the original source file's name (with or without extension)
 * @param suffix      the current operation's suffix (e.g. "converted")
 */
export function buildOutputName(sourceName: string, suffix: string, suffixes: string[] = OUTPUT_SUFFIXES): string {
  const clean = stripKnownSuffixes(stripExtension(sourceName), suffixes) || 'output'
  return suffix ? `${clean}-${suffix}` : clean
}
