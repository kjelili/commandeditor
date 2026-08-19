# Chrome Web Store listing — CommandEditor extension

Upload package: `extension/dist/commandeditor-extension-1.1.0.zip`
(build with `node scripts/pack-extension.mjs`; validated by `tests/extension.test.mts`)

## Store name
CommandEditor — Open PDFs in your private editor

## Short description (≤132 chars, matches manifest)
Right-click any PDF link to open it in CommandEditor — private, in-browser PDF tools. No uploads, no accounts, no tracking.

## Category
Productivity

## Detailed description
CommandEditor is the PDF toolkit that never sees your files. Every one of the
110+ tools — merge, split, compress, OCR, sign, redact, convert, protect —
runs entirely inside your browser. Nothing is uploaded, ever.

This extension puts that toolkit one right-click away:

• Right-click any link to a PDF → "Open in CommandEditor" — the file is
  fetched straight into your browser and opened in the toolkit.
• Right-click any page → "Edit this page as PDF in CommandEditor" — jump
  into Print-to-PDF and turn the page into a document.
• Click the toolbar icon for one-tap shortcuts to Merge, Compress, Sign,
  OCR, and Co-Review.

Why it's different:
• Zero upload — files are processed on your device with WebAssembly.
• Zero access — the extension requests no permission to read page content.
  The only permission is "contextMenus" (to add the right-click entries).
• Zero tracking — no analytics, no network calls, no accounts, free forever.

Open source: https://github.com/kjelili/commandeditor

## Permission justifications (store review form)
- contextMenus: "Needed to add the 'Open in CommandEditor' right-click entry
  on PDF links. This is the extension's only function."
- Host access: "The extension requests NO host permissions. It never reads
  page content; it only opens commandeditor.com in a new tab with the
  link's URL as a parameter."
- Remote code: "This extension does not execute remote code. All logic is in
  the bundled background.js service worker."

## Screenshots to capture (1280×800 or 640×400)
1. Right-click menu on a PDF link showing "Open in CommandEditor".
2. The toolbar popup with the six shortcuts.
3. A PDF opened in CommandEditor after the handoff (?import= flow),
   with the tool grid visible.

## After publish
Update extension/README.md "Install" section with the store URL, and add the
Chrome Web Store badge to README.md and the site footer.
