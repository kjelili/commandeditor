// ─── PDF STANDARD-FONT TEXT SAFETY ─────────────────────────────────────────
// pdf-lib's StandardFonts (Helvetica & friends) encode WinAnsi only. Drawing
// text outside that charset throws at save time — crashing exports whenever
// a document (or a user's redline proposal) contains Chinese, Arabic, emoji,
// or even some typographic characters. This maps text to the closest
// WinAnsi-safe representation so exports never crash.

const REPLACEMENTS: Record<string, string> = {
  '\u2018': "'", '\u2019': "'", '\u201A': "'", '\u201B': "'",
  '\u201C': '"', '\u201D': '"', '\u201E': '"',
  '\u2013': '-', '\u2014': '--', '\u2212': '-',
  '\u2026': '...', '\u2022': '*', '\u25CF': '*', '\u00B7': '*',
  '\u2192': '->', '\u2190': '<-', '\u2194': '<->',
  '\u2260': '!=', '\u2264': '<=', '\u2265': '>=',
  '\u00D7': 'x', '\u00F7': '/',
  '\u20AC': 'EUR', '\u00A3': 'GBP', '\u00A5': 'JPY',
  '\u00A9': '(c)', '\u00AE': '(r)', '\u2122': '(tm)',
  '\u00A0': ' ',
}

export function toWinAnsi(s: string): string {
  let out = ''
  for (const ch of s) {
    const code = ch.codePointAt(0)!
    if (REPLACEMENTS[ch] !== undefined) { out += REPLACEMENTS[ch]; continue }
    // Printable ASCII + Latin-1 supplement (WinAnsi covers both)
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa1 && code <= 0xff)) { out += ch; continue }
    if (ch === '\n' || ch === '\t') { out += ch; continue }
    out += '?' // anything else (CJK, emoji, …) degrades visibly but safely
  }
  return out
}
