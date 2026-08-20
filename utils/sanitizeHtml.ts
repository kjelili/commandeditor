// Small, dependency-free HTML-escaping helper used wherever untrusted text
// (document content, AI output, user-supplied titles) is placed near HTML.
// For rich HTML that must keep structure (e.g. HTML->PDF), use DOMPurify
// instead — see utils/pdfOperations.ts.
export function escapeHtml(input: unknown): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
