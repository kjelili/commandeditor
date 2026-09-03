// lib/seoTools.ts — curated, high-search-intent tool pages for programmatic SEO.
// Pure data (no browser imports) so it can drive static generation.
// `id` must match the TOOLS registry in components/PDFTools.tsx (deep link: /?tool=<id>).

export interface SeoTool {
  id: string
  /** Verb-led page title, e.g. "Merge PDF" */
  title: string
  /** One-sentence pitch used as meta description base */
  blurb: string
  steps: string[]
  faqs: { q: string; a: string }[]
  related: string[]
  keywords: string[]
}

const PRIVACY_FAQ = {
  q: 'Are my files uploaded?',
  a: 'No. CommandEditor runs entirely in your browser with WebAssembly — your file never leaves your device. You can verify it: open your browser\'s network inspector, or switch off Wi-Fi after the page loads; the tool still works.',
}

export const SEO_TOOLS: SeoTool[] = [
  {
    id: 'merge', title: 'Merge PDF', blurb: 'Combine multiple PDFs into one document, in your browser.',
    steps: ['Drop two or more PDF files onto the page', 'Drag to set the order (optional)', 'Press Merge and download the combined PDF'],
    faqs: [PRIVACY_FAQ, { q: 'Is there a file size or page limit?', a: 'No. Because nothing is uploaded, there are no server-side caps — the only limit is your device\'s memory, which handles even thousand-page documents.' }],
    related: ['split', 'rearrange', 'compress'], keywords: ['merge pdf', 'combine pdf', 'join pdf files'],
  },
  {
    id: 'split', title: 'Split PDF', blurb: 'Extract pages or ranges from a PDF into a new file.',
    steps: ['Drop a PDF onto the page', 'Click the pages you want in the preview', 'Press Split and download the extracted pages'],
    faqs: [PRIVACY_FAQ, { q: 'Can I split into several files at once?', a: 'Yes — use Split Every N Pages for fixed-size chunks, or Split by Bookmarks to split at each top-level outline entry.' }],
    related: ['merge', 'splitn', 'splitbm'], keywords: ['split pdf', 'extract pdf pages', 'pdf splitter'],
  },
  {
    id: 'compress', title: 'Compress PDF', blurb: 'Shrink PDF file size without uploading anything.',
    steps: ['Drop a PDF onto the page', 'Choose a quality level', 'Press Compress and download the smaller file'],
    faqs: [PRIVACY_FAQ, { q: 'How much smaller will my PDF get?', a: 'Scanned, image-heavy PDFs typically shrink 50–90%. Text-only PDFs are already compact, so gains there are smaller.' }],
    related: ['grayscale', 'scalepages', 'repair'], keywords: ['compress pdf', 'reduce pdf size', 'pdf optimizer'],
  },
  {
    id: 'convert', title: 'PDF to Word', blurb: 'Turn a PDF into an editable Word document with real headings, bold text and bullet lists.',
    steps: ['Drop a PDF onto the page', 'Choose WORD as the export format', 'Press Export and open the .docx in Word, Google Docs or LibreOffice'],
    faqs: [PRIVACY_FAQ, { q: 'Is the text really editable?', a: 'Yes. Unlike converters that paste page screenshots into a document, CommandEditor rebuilds the text layer: headings, bold and italic runs, bullet lists and paragraphs. Scanned pages without a text layer are kept as page images.' }],
    related: ['ocr', 'totext', 'toexcel'], keywords: ['pdf to word', 'convert pdf to docx', 'editable word from pdf'],
  },
  {
    id: 'ocr', title: 'OCR PDF', blurb: 'Make a scanned PDF searchable and selectable, on-device.',
    steps: ['Drop a scanned PDF onto the page', 'Pick the document language', 'Press OCR — the searchable PDF downloads when done'],
    faqs: [PRIVACY_FAQ, { q: 'Which OCR engine is used?', a: 'Tesseract.js running locally in your browser via WebAssembly. No page images are sent anywhere.' }],
    related: ['convert', 'scantopdf', 'totext'], keywords: ['ocr pdf', 'make pdf searchable', 'scanned pdf to text'],
  },
  {
    id: 'protect', title: 'Password Protect PDF', blurb: 'Encrypt a PDF with a real password using native 128-bit PDF encryption.',
    steps: ['Drop a PDF onto the page', 'Set the open password and optional permissions', 'Press Protect — readers will ask for the password on open'],
    faqs: [PRIVACY_FAQ, { q: 'Is this real encryption?', a: 'Yes — the PDF Standard Security Handler (RC4 128-bit), the same scheme Acrobat uses. The file is genuinely encrypted, not just flagged. You can restrict printing, copying and editing too.' }],
    related: ['unlock', 'aesencrypt', 'sanitize'], keywords: ['password protect pdf', 'encrypt pdf', 'lock pdf'],
  },
  {
    id: 'unlock', title: 'Unlock PDF', blurb: 'Remove a known password from a PDF you own.',
    steps: ['Drop the protected PDF onto the page', 'Enter its password', 'Download the unlocked copy'],
    faqs: [PRIVACY_FAQ, { q: 'Can it crack unknown passwords?', a: 'No — you must know the password. It removes protection from your own documents so you can print, archive or merge them.' }],
    related: ['protect', 'repair', 'sanitize'], keywords: ['unlock pdf', 'remove pdf password', 'pdf password remover'],
  },
  {
    id: 'sign', title: 'Sign PDF', blurb: 'Type, draw or upload your signature and place it on a PDF.',
    steps: ['Drop a PDF onto the page', 'Create your signature — type, draw or upload an image', 'Place it on the page and download the signed PDF'],
    faqs: [PRIVACY_FAQ, { q: 'Is this a legally binding e-signature?', a: 'A drawn signature image is accepted for most everyday agreements. For an audit-trailed, multi-party ceremony use the E-Signature Workflow tool, which adds cryptographic certificates.' }],
    related: ['esign', 'addimage', 'formfill'], keywords: ['sign pdf', 'add signature to pdf', 'esign pdf free'],
  },
  {
    id: 'esign', title: 'E-Signature Workflow', blurb: 'Multi-party signing with a cryptographic audit trail, fully on-device.',
    steps: ['Drop a PDF onto the page', 'Add signers and place their signature fields', 'Each signer signs in turn; download the signed PDF and its certificate'],
    faqs: [PRIVACY_FAQ, { q: 'What makes this different from drawing a signature?', a: 'Every signing event is hashed into a tamper-evident audit trail with signer identity and timestamps, and a verification certificate is issued with the document.' }],
    related: ['sign', 'notarize', 'hashcheck'], keywords: ['e-signature workflow', 'multi-party signing', 'sign pdf with audit trail'],
  },
  {
    id: 'redact', title: 'Redact PDF', blurb: 'Burn black redaction boxes into a PDF so the content is truly gone.',
    steps: ['Drop a PDF onto the page', 'Draw boxes over the content to hide', 'Press Redact — the underlying text is destroyed, not just covered'],
    faqs: [PRIVACY_FAQ, { q: 'Is redaction permanent?', a: 'Yes — redacted regions are burned into the page content stream. For documents that also need metadata, script and attachment scrubbing, run Sanitize afterwards.' }],
    related: ['sanitize', 'piiscan', 'protect'], keywords: ['redact pdf', 'black out pdf text', 'pdf redaction free'],
  },
  {
    id: 'sanitize', title: 'Sanitize PDF', blurb: 'Strip hidden metadata, JavaScript, embedded files and comments from a PDF.',
    steps: ['Drop a PDF onto the page', 'Choose what to remove (metadata, scripts, attachments, comments)', 'Download the sanitized copy with a report of what was removed'],
    faqs: [PRIVACY_FAQ, { q: 'What hidden data does a PDF carry?', a: 'Author names, edit history, XMP metadata, embedded files, JavaScript actions and comments. Sanitize removes them before you share the file.' }],
    related: ['redact', 'piiscan', 'metadata'], keywords: ['sanitize pdf', 'remove pdf metadata', 'pdf hidden data'],
  },
  {
    id: 'repair', title: 'Repair PDF', blurb: 'Fix damaged, truncated or mis-built PDFs that refuse to open.',
    steps: ['Drop the damaged PDF onto the page', 'Pick a repair mode — tolerant rebuild or rasterize', 'Download the repaired file'],
    faqs: [PRIVACY_FAQ, { q: 'What damage can be fixed?', a: 'Broken cross-reference tables, trailing garbage, missing EOF markers and malformed objects. Severely corrupted files can be rasterized page-by-page as a last resort.' }],
    related: ['compress', 'flatten', 'protect'], keywords: ['repair pdf', 'fix corrupted pdf', 'pdf won\'t open'],
  },
  {
    id: 'watermark', title: 'Watermark PDF', blurb: 'Stamp diagonal text like CONFIDENTIAL or DRAFT across every page.',
    steps: ['Drop a PDF onto the page', 'Type the watermark text and tune opacity/size', 'Download the watermarked PDF'],
    faqs: [PRIVACY_FAQ, { q: 'Can I watermark only some pages?', a: 'The watermark applies to all pages by design — for selective page text use the Header & Footer or Edit tools.' }],
    related: ['headfoot', 'pagenum', 'protect'], keywords: ['watermark pdf', 'add watermark to pdf', 'stamp pdf confidential'],
  },
  {
    id: 'rotate', title: 'Rotate PDF', blurb: 'Rotate all or selected pages by 90, 180 or 270 degrees.',
    steps: ['Drop a PDF onto the page', 'Choose the angle and (optionally) specific pages', 'Download the rotated PDF'],
    faqs: [PRIVACY_FAQ, { q: 'Is rotation lossless?', a: 'Yes — it flips the page rotation flag in the PDF structure. No re-rendering, no quality loss.' }],
    related: ['crop', 'rearrange', 'interleave'], keywords: ['rotate pdf', 'turn pdf pages', 'fix pdf orientation'],
  },
  {
    id: 'crop', title: 'Crop PDF', blurb: 'Trim margins from PDF pages by setting a crop box.',
    steps: ['Drop a PDF onto the page', 'Set the margins to remove', 'Download the cropped PDF'],
    faqs: [PRIVACY_FAQ, { q: 'Does cropping delete the trimmed content?', a: 'The crop box hides margins from view. To permanently destroy content, use Redact instead.' }],
    related: ['autocrop', 'rotate', 'scalepages'], keywords: ['crop pdf', 'trim pdf margins', 'pdf cropper'],
  },
  {
    id: 'pagenum', title: 'Add Page Numbers to PDF', blurb: 'Number PDF pages with position, format and start value control.',
    steps: ['Drop a PDF onto the page', 'Choose position and numbering style', 'Download the numbered PDF'],
    faqs: [PRIVACY_FAQ, { q: 'Can numbering start at a page other than 1?', a: 'Yes — set a start offset, or combine with Header & Footer for full control over placement.' }],
    related: ['headfoot', 'watermark', 'nup'], keywords: ['add page numbers to pdf', 'pdf page numbering', 'bates-lite numbering'],
  },
  {
    id: 'totext', title: 'PDF to Text', blurb: 'Extract all text from a PDF as .txt or Markdown.',
    steps: ['Drop a PDF onto the page', 'Choose plain text or Markdown', 'Download the extracted text'],
    faqs: [PRIVACY_FAQ, { q: 'The output is empty — why?', a: 'Your PDF is probably a scan (images, no text layer). Run OCR first, then extract.' }],
    related: ['ocr', 'convert', 'tojson'], keywords: ['pdf to text', 'extract text from pdf', 'pdf to markdown'],
  },
  {
    id: 'toexcel', title: 'PDF to Excel', blurb: 'Pull tabular data out of a PDF into Excel/CSV.',
    steps: ['Drop a PDF onto the page', 'Review the detected tables', 'Download the .xlsx or .csv'],
    faqs: [PRIVACY_FAQ, { q: 'How accurate is table detection?', a: 'Clean, ruled tables convert very well. Borderless multi-column layouts may need a quick tidy in Excel afterwards.' }],
    related: ['tojson', 'formextract', 'convert'], keywords: ['pdf to excel', 'pdf to csv', 'extract table from pdf'],
  },
  {
    id: 'topptx', title: 'PDF to PowerPoint', blurb: 'Turn PDF pages into an editable PowerPoint deck.',
    steps: ['Drop a PDF onto the page', 'Press Convert', 'Download the .pptx and open it in PowerPoint or Google Slides'],
    faqs: [PRIVACY_FAQ, { q: 'Are slides editable?', a: 'Pages become slide canvases with the page rendering as the background — ideal for reusing PDF decks without rebuilding them.' }],
    related: ['convert', 'present', 'extractimgs'], keywords: ['pdf to powerpoint', 'pdf to pptx', 'convert pdf to slides'],
  },
  {
    id: 'metadata', title: 'Edit PDF Metadata', blurb: 'View and rewrite a PDF\'s title, author, subject and keywords.',
    steps: ['Drop a PDF onto the page', 'Edit the metadata fields', 'Download the updated PDF'],
    faqs: [PRIVACY_FAQ, { q: 'Why edit metadata?', a: 'For SEO of published PDFs, correct document management, and privacy — or use Sanitize to strip it all in one pass.' }],
    related: ['sanitize', 'hashcheck', 'preflight'], keywords: ['edit pdf metadata', 'pdf properties editor', 'change pdf author'],
  },
  {
    id: 'flatten', title: 'Flatten PDF', blurb: 'Merge form fields, annotations and layers into static pages.',
    steps: ['Drop a PDF onto the page', 'Press Flatten', 'Download the flattened PDF — forms become read-only'],
    faqs: [PRIVACY_FAQ, { q: 'Why flatten a PDF?', a: 'To freeze filled forms and annotations so nobody can edit them, and to maximize compatibility with strict viewers and printers.' }],
    related: ['formfill', 'formextract', 'protect'], keywords: ['flatten pdf', 'merge pdf layers', 'make pdf read-only'],
  },
  {
    id: 'einvoice', title: 'Factur-X E-Invoice', blurb: 'Attach EN 16931 Factur-X XML to an invoice PDF — the EU e-invoicing standard.',
    steps: ['Drop your invoice PDF onto the page', 'Fill in seller, buyer and line items', 'Download the Factur-X/A-3 compliant PDF with embedded XML'],
    faqs: [PRIVACY_FAQ, { q: 'Which standard does it produce?', a: 'Factur-X / ZUGFeRD (EN 16931, Basic WL profile) embedded as an Alternative representation with PDF/A-3 style metadata — the format required by the German and French B2B e-invoicing mandates.' }],
    related: ['formextract', 'metadata', 'hashcheck'], keywords: ['factur-x', 'zugferd', 'e-invoice generator', 'en 16931', 'xrechnung'],
  },
  {
    id: 'scantopdf', title: 'Scan to PDF', blurb: 'Use your camera as a document scanner — no app install, no upload.',
    steps: ['Open the tool and allow camera access (or drop photos)', 'Capture each page; apply document filters', 'Download the assembled A4 PDF'],
    faqs: [PRIVACY_FAQ, { q: 'Where do the photos go?', a: 'Nowhere. Frames are processed on your device and assembled into the PDF locally — airplane mode works.' }],
    related: ['ocr', 'compress', 'extractimgs'], keywords: ['scan to pdf', 'camera scanner online', 'photo to pdf'],
  },
  {
    id: 'nup', title: 'N-up PDF', blurb: 'Place multiple PDF pages per sheet (2-up, 4-up, 6-up…) for handouts.',
    steps: ['Drop a PDF onto the page', 'Choose the grid (columns × rows)', 'Download the N-up PDF'],
    faqs: [PRIVACY_FAQ, { q: 'What is N-up used for?', a: 'Handouts, lecture notes and saving paper — four slides per sheet is the classic. For folded booklets use Booklet Imposition instead.' }],
    related: ['booklet', 'contactsheet', 'normalizesize'], keywords: ['n-up pdf', 'pdf 2 pages per sheet', 'pdf handout layout'],
  },
  {
    id: 'booklet', title: 'PDF Booklet', blurb: 'Rearrange pages into saddle-stitch imposition for folded booklets.',
    steps: ['Drop a PDF onto the page', 'Press Build Booklet', 'Print double-sided (flip on short edge), fold and staple'],
    faqs: [PRIVACY_FAQ, { q: 'My page count isn\'t a multiple of 4?', a: 'Blank pages are inserted automatically at the right spots so the imposition folds correctly.' }],
    related: ['nup', 'reverse', 'interleave'], keywords: ['pdf booklet', 'saddle stitch imposition', 'print pdf as booklet'],
  },
  {
    id: 'interleave', title: 'Interleave PDF (Duplex Fix)', blurb: 'Merge a front-side scan with a reversed back-side scan into one ordered PDF.',
    steps: ['Drop the fronts PDF and the backs PDF', 'Press Interleave — backs are reversed automatically if needed', 'Download the correctly ordered document'],
    faqs: [PRIVACY_FAQ, { q: 'Who needs this?', a: 'Anyone with a single-sided scanner digitizing double-sided documents: scan all fronts, flip the stack, scan all backs, then interleave.' }],
    related: ['merge', 'reverse', 'scantopdf'], keywords: ['interleave pdf', 'duplex scan fix', 'merge front back scans'],
  },
  {
    id: 'rmblank', title: 'Remove Blank Pages from PDF', blurb: 'Detect and delete empty pages left by scanners and exports.',
    steps: ['Drop a PDF onto the page', 'Review the pages detected as blank', 'Download the cleaned PDF'],
    faqs: [PRIVACY_FAQ, { q: 'How is "blank" detected?', a: 'A page counts as blank when it has no text and no drawn images or vector content. Conservative by design — pages with stamps or letterheads are kept.' }],
    related: ['split', 'reverse', 'compress'], keywords: ['remove blank pages pdf', 'delete empty pdf pages', 'clean scanned pdf'],
  },
  {
    id: 'reverse', title: 'Reverse PDF Page Order', blurb: 'Flip the page order of a PDF — last page first.',
    steps: ['Drop a PDF onto the page', 'Press Reverse', 'Download the flipped document'],
    faqs: [PRIVACY_FAQ, { q: 'When is this useful?', a: 'Printer output order fixes, duplex-scanning workflows, and documents scanned back-to-front.' }],
    related: ['rearrange', 'interleave', 'booklet'], keywords: ['reverse pdf pages', 'flip pdf page order', 'pdf backwards'],
  },
  {
    id: 'splitbm', title: 'Split PDF by Bookmarks', blurb: 'Split a PDF into one file per top-level bookmark, named after the outline.',
    steps: ['Drop a PDF with a table of contents onto the page', 'Press Split by Bookmarks', 'Download a ZIP of named section PDFs'],
    faqs: [PRIVACY_FAQ, { q: 'What if my PDF has no bookmarks?', a: 'Use Smart TOC to generate an outline first, or split by page ranges with the regular Split tool.' }],
    related: ['bookmarkio', 'bookmarks', 'split'], keywords: ['split pdf by bookmarks', 'split pdf by chapters', 'pdf outline split'],
  },
  {
    id: 'contactsheet', title: 'PDF Contact Sheet', blurb: 'Export a thumbnail overview grid of every page — the visual index.',
    steps: ['Drop a PDF onto the page', 'Pick the grid density', 'Download the contact-sheet PDF'],
    faqs: [PRIVACY_FAQ, { q: 'What is a contact sheet for?', a: 'Proofing long documents, archiving visual indexes, and spotting layout issues across hundreds of pages at a glance.' }],
    related: ['nup', 'booklet', 'pdfcompare'], keywords: ['pdf contact sheet', 'pdf thumbnail overview', 'pdf page grid'],
  },
  {
    id: 'bookmarkio', title: 'Import / Export PDF Bookmarks', blurb: 'Save a PDF outline to JSON and apply outlines to other copies.',
    steps: ['Drop a PDF onto the page', 'Export its bookmarks as JSON — or import a JSON outline', 'Download the PDF with the applied outline'],
    faqs: [PRIVACY_FAQ, { q: 'Why as JSON?', a: 'So outlines can be version-controlled, edited in bulk, translated, or transferred between document versions.' }],
    related: ['bookmarks', 'splitbm', 'tojson'], keywords: ['export pdf bookmarks', 'import pdf outline', 'edit pdf toc'],
  },
  {
    id: 'scalepages', title: 'Resize / Scale PDF Pages', blurb: 'Scale pages by percent or fit them to A4, Letter and other formats.',
    steps: ['Drop a PDF onto the page', 'Choose a percentage or a target page size', 'Download the resized PDF'],
    faqs: [PRIVACY_FAQ, { q: 'Does scaling keep quality?', a: 'Yes — content is scaled as vectors where possible, centered on the new page. To unify mixed page sizes, use the Mixed Page Size Normaliser.' }],
    related: ['normalizesize', 'crop', 'nup'], keywords: ['resize pdf', 'scale pdf pages', 'pdf to a4', 'pdf to letter size'],
  },
  {
    id: 'linkedit', title: 'Edit PDF Links', blurb: 'List, remove or add hyperlink annotations inside a PDF.',
    steps: ['Drop a PDF onto the page', 'Review existing links — remove any, or draw a region and add a new URL', 'Download the updated PDF'],
    faqs: [PRIVACY_FAQ, { q: 'Can I fix a broken link?', a: 'Yes — remove the old annotation and add the correct URL over the same region.' }],
    related: ['metadata', 'qrcode', 'bookmarkio'], keywords: ['edit pdf links', 'remove hyperlinks from pdf', 'add link to pdf'],
  },
  {
    id: 'formextract', title: 'Extract PDF Form Data', blurb: 'Export filled AcroForm fields to CSV or JSON.',
    steps: ['Drop a filled PDF form onto the page', 'Press Extract', 'Download the data as CSV or JSON'],
    faqs: [PRIVACY_FAQ, { q: 'Which field types are supported?', a: 'Text fields, checkboxes, radio groups, dropdowns, option lists and signature-field presence — detected by class, not by fragile name heuristics.' }],
    related: ['toexcel', 'tojson', 'formfill'], keywords: ['extract pdf form data', 'pdf form to csv', 'export pdf form fields'],
  },
  {
    id: 'hashcheck', title: 'PDF Integrity Hash (SHA-256)', blurb: 'Compute a SHA-256 fingerprint to prove a file is unchanged.',
    steps: ['Drop a PDF onto the page', 'Read the SHA-256 fingerprint', 'Compare it any time to detect tampering'],
    faqs: [PRIVACY_FAQ, { q: 'How do I prove a document existed at a point in time?', a: 'Pair the hash with the Notarize tool to anchor it to the Bitcoin blockchain via OpenTimestamps — independently verifiable forever.' }],
    related: ['notarize', 'tamperseal', 'sanitize'], keywords: ['pdf sha256', 'pdf checksum', 'verify pdf integrity'],
  },
  {
    id: 'grayscale', title: 'PDF to Grayscale', blurb: 'Convert color PDFs to black-and-white for print savings.',
    steps: ['Drop a PDF onto the page', 'Press Convert', 'Download the grayscale PDF'],
    faqs: [PRIVACY_FAQ, { q: 'Does it shrink the file too?', a: 'Usually, yes — and the Ink Coverage Estimator can tell you how much toner you save.' }],
    related: ['compress', 'inkestimate', 'preflight'], keywords: ['pdf to grayscale', 'pdf black and white', 'convert pdf to bw'],
  },
  {
    id: 'headfoot', title: 'PDF Header & Footer', blurb: 'Add running headers and footers with text and page numbers.',
    steps: ['Drop a PDF onto the page', 'Compose header/footer text', 'Download the updated PDF'],
    faqs: [PRIVACY_FAQ, { q: 'Can footers include page numbers?', a: 'Yes — page-number tokens are supported; for numbering alone, Add Page Numbers is the quicker tool.' }],
    related: ['pagenum', 'watermark', 'metadata'], keywords: ['pdf header footer', 'add footer to pdf', 'pdf running header'],
  },
  {
    id: 'aesencrypt', title: 'AES-256 File Encryption', blurb: 'Encrypt any file — not just PDFs — with AES-256 in your browser.',
    steps: ['Drop any file onto the page', 'Set a strong password', 'Download the .enc file; decrypt it here later'],
    faqs: [PRIVACY_FAQ, { q: 'Which algorithm?', a: 'AES-GCM 256-bit with PBKDF2 key derivation via the Web Crypto API — authenticated encryption, done locally.' }],
    related: ['protect', 'hashcheck', 'sanitize'], keywords: ['aes 256 encrypt file', 'encrypt file online no upload', 'file encryption browser'],
  },
  {
    id: 'qrcode', title: 'Add QR Code to PDF', blurb: 'Stamp a QR code linking to a URL onto PDF pages.',
    steps: ['Drop a PDF onto the page', 'Enter the target URL and position', 'Download the stamped PDF'],
    faqs: [PRIVACY_FAQ, { q: 'What is it for?', a: 'Linking printed documents to live pages — menus, posters, contracts and certificates.' }],
    related: ['linkedit', 'watermark', 'addimage'], keywords: ['add qr code to pdf', 'pdf qr code', 'qr stamp pdf'],
  },
  {
    id: 'pdfcompare', title: 'Compare Two PDFs', blurb: 'Diff two PDF versions — text changes highlighted side by side.',
    steps: ['Drop the old and new versions onto the page', 'Press Compare', 'Review the highlighted differences'],
    faqs: [PRIVACY_FAQ, { q: 'Text or visual diff?', a: 'Both — a text-level diff here, and pixel-perfect Visual PDF Comparison as a separate tool for layout changes.' }],
    related: ['visualdiff', 'redline', 'hashcheck'], keywords: ['compare pdf files', 'pdf diff', 'find changes between pdfs'],
  },
  {
    id: 'inplaceedit', title: 'Edit PDF', blurb: 'Click any text in a PDF and edit it directly — fix typos, change words, update dates — right in your browser.',
    steps: ['Drop a PDF onto the page', 'Click the text you want to change and type your edit', 'Download the edited PDF — the original font is matched automatically'],
    faqs: [PRIVACY_FAQ, { q: 'Can I edit a scanned PDF?', a: 'Scanned pages are images, so run OCR first to make the text selectable, then edit. Native (digital) PDFs can be edited directly.' }, { q: 'Will my edit match the original font?', a: 'CommandEditor detects the original font family (serif vs sans-serif) and embeds a close match, so your changes blend in.' }],
    related: ['ocr', 'totext', 'sign', 'merge'], keywords: ['edit pdf', 'edit pdf online', 'edit pdf text', 'free pdf editor', 'change text in pdf'],
  },
  {
    id: 'formfill', title: 'Fill PDF Forms', blurb: 'Fill in PDF form fields — or add text to a flat, non-interactive form — and download the completed document, in your browser.',
    steps: ['Drop your PDF form onto the page', 'Type into the detected fields, or click anywhere to add text on a flat form', 'Download the completed PDF'],
    faqs: [PRIVACY_FAQ, { q: 'My form has no fillable fields — can I still complete it?', a: 'Yes. CommandEditor detects flat (non-interactive) forms and lets you place text anywhere, so scanned or printed forms work too.' }, { q: 'Can I fill many copies from a spreadsheet?', a: 'Yes — Form Intelligence supports CSV mail-merge, producing one filled PDF per row.' }],
    related: ['sign', 'esign', 'formextract'], keywords: ['fill pdf form', 'pdf form filler', 'complete pdf form', 'fill out pdf online'],
  },
]

export const SEO_SLUGS = SEO_TOOLS.map(t => t.id)
export const getSeoTool = (slug: string) => SEO_TOOLS.find(t => t.id === slug)
