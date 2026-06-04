# CommandEditor v6

> **The first voice-controlled PDF toolkit. 50+ hands-free commands. 50+ tools. Zero servers. Every byte stays on your device.**

[Deploy to Vercel](DEPLOY-TO-VERCEL.md) · [Launch checklist](LAUNCH_CHECKLIST.md)

CommandEditor is a professional-grade PDF and document processing suite that runs entirely in the browser. No uploads, no accounts, no subscriptions, no data leaving your machine — ever. Built on Next.js 14, React 18, and TypeScript, it processes files using Web APIs, WebAssembly (pdf.js, pdf-lib), and the Web Crypto API.

---

## What makes CommandEditor different

Most online PDF tools are data pipelines. You upload your file to a server, a server processes it, a server stores it, and you hope it gets deleted. CommandEditor inverts this entirely. Every operation — compression, encryption, OCR, PII scanning, redaction, signature, AES-256 encryption — runs in your browser tab. The file never moves.

This isn't a constraint. It's the design. It means:

- **Legal and HR documents** can be processed without exposing them to a third party
- **PII scanning and redaction** can run on sensitive data without compliance risk
- **Offline operation** works once the page has loaded
- **No rate limits**, no file size tiers, no monthly quotas behind a paywall

---

## Getting started

```bash
# Clone or unzip the project
cd commandeditor

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build && npm start
```

Requires Node.js 18+. No environment variables or external services needed.

---

## All tools

### Core PDF operations

| Tool | What it does |
|------|-------------|
| **Merge** | Combine multiple PDFs into one document |
| **Split** | Extract selected pages into a new PDF |
| **Split by N** | Divide PDF into equal chunks of N pages |
| **Compress** | Reduce file size by resampling images and optimising structure |
| **Rotate** | Rotate individual pages or all pages |
| **Crop** | Trim margins by specifying points to remove from each edge |
| **Smart Auto-Crop** | Pixel-level content detection — automatically removes blank margins |
| **Rearrange** | Drag-and-drop page reordering |
| **Insert Page** | Add a blank page or duplicate an existing one at any position |
| **Flatten** | Rasterise all annotations, form fields, and overlays into pixels |
| **Grayscale** | Strip all colour, reduce ink usage, shrink file size |
| **Normalise Page Sizes** | Detect mixed page dimensions; unify all pages to A4, US Letter, or A3 |

### Conversion

| Tool | What it does |
|------|-------------|
| **PDF → Image** | Export pages as PNG, JPEG, or WebP |
| **PDF → Word** | Convert to editable .docx (text layer preserved) |
| **PDF → Excel / CSV** | Extract tables and structured data |
| **PDF → PowerPoint** | Convert slides-as-pages to editable .pptx |
| **PDF → Text** | Extract text layer as .txt or Markdown |
| **PDF → Structured JSON** | Export text with page numbers and positions — for developers and data pipelines |
| **PDF → Email HTML** | Convert a single-page PDF to inline-styled HTML ready for email marketing tools |
| **PDF → Podcast Script** | Reformat document text as a spoken-word script with pacing markers |
| **To PDF** | Convert images, Word docs, Markdown, HTML, and plain text to PDF |

### Security and integrity

| Tool | What it does |
|------|-------------|
| **AES-256 Encrypt** | True file encryption using Web Crypto API (PBKDF2 + AES-GCM). Not PDF password protection — the file itself is encrypted |
| **Password Protect** | Add open/owner passwords to a PDF |
| **Unlock PDF** | Remove a known password from a PDF |
| **Redact** | Draw black-out rectangles over sensitive content on any page |
| **Tamper-Evident Seal** | Generate a SHA-256 + timestamp cryptographic certificate for a file. Download as JSON, verify any time by dropping the file back in |
| **File Hash (SHA-256)** | Compute and display the SHA-256 hash of any file for integrity verification |

### Annotation and editing

| Tool | What it does |
|------|-------------|
| **Annotate** | Add text, freehand pen, highlights, lines, and rectangles directly on PDF pages |
| **Sign** | Type, draw, or upload a signature and place it on any page |
| **Add Image** | Insert a logo, photo, or stamp onto a page |
| **Add QR Code** | Embed a scannable QR code linked to any URL |
| **Watermark** | Add diagonal, centred, or positional text watermarks with custom opacity and colour |
| **Header / Footer** | Add custom text to the top and bottom of every page |
| **Add Page Numbers** | Stamp page numbers in any position and format |
| **Metadata** | Edit PDF title, author, subject, and keywords |
| **Bookmarks / TOC** | Visually define a table of contents and embed bookmark entries into the PDF |
| **Micro-Annotation Threads** | Pin text comments to page coordinates. Persisted locally by SHA-256 file hash — re-open the same file and your annotations reappear |

### Document intelligence

| Tool | What it does |
|------|-------------|
| **Readability Score** | Flesch-Kincaid reading ease score, grade level, word count, average sentence length, estimated reading time, and top keywords |
| **Spell Check** | Detects common misspellings and doubled words across the text layer with page references and suggestions |
| **Document Tone Analyser** | Per-page sentiment heatmap — positive, negative, formal, aggressive — with overall sentiment and formality rating |
| **Language Detector** | Trigram-based identification across 20+ languages. Returns language name, flag, confidence score, and alternative candidates |
| **Semantic Page Grouping** | TF-IDF keyword clustering groups pages by topic. Click any group to split the PDF on those boundaries |
| **Timeline / Date Extractor** | Finds every date pattern in the document (ISO, written, relative) with the surrounding sentence as context |
| **Citation & Reference Extractor** | Identifies DOIs (with direct open link), URLs, author-year references, and numbered footnotes. Copy all as text |
| **Font Inspector** | Lists every font in the PDF: name, type (TrueType, OpenType, Type1), embedded or not. Warns on unembedded fonts that will cause print failures |

### Privacy and compliance

| Tool | What it does |
|------|-------------|
| **PII / Sensitive Data Scanner** | Scans the text layer for credit cards, Social Security / National Insurance numbers, IBANs, email addresses, phone numbers (UK and US), passport patterns, UK postcodes, dates of birth, and IP addresses. Severity-rated. One click to jump to Redact |
| **Accessibility Checker** | WCAG / PDF-UA audit: text layer present, document title set, images on page, file size. Pass/fail with critical / warning / info severity |
| **Redaction Verification** | After redacting, verify that no text layer remains beneath the blacked-out regions |

### Study and knowledge

| Tool | What it does |
|------|-------------|
| **PDF → Flashcards** | Extracts heading/body pairs from the document as interactive flip cards. Tap to reveal the answer. Navigate with prev/next |
| **PDF → Anki Deck** | Exports the same Q&A pairs as an Anki-compatible TSV file. Import via Anki's File → Import — no plugin needed |

### Print and production

| Tool | What it does |
|------|-------------|
| **Ink Coverage Estimator** | Renders each page to canvas and measures non-white pixel ratio. Shows per-page coverage percentage and estimated print cost in USD |
| **Print Preflight (PDF/X)** | Checks fonts, colour mode, resolution, bleed, and trim box against commercial print standards (ISO 15930 / PDF/X) |
| **Poster / Tile Print** | Tiles a single page across an N×M grid of A4 sheets with crop marks and alignment guides — for large-format printing without a plotter |

### Analysis and comparison

| Tool | What it does |
|------|-------------|
| **Compare Two PDFs** | Upload a second PDF and run a line-by-line text diff. Additions in green, removals in red, changes in amber |
| **OCR** | Make a scanned (image-only) PDF searchable and copy-pasteable using client-side OCR |
| **Extract Images** | Pull every embedded image from a PDF and download as a ZIP |

### Automation

| Tool | What it does |
|------|-------------|
| **Macro Recorder** | Record any sequence of tool operations, name the macro, and replay it on any PDF. Export as `.macro.json` to share with a colleague |
| **Conditional Batch Rules** | Define IF/THEN rules (e.g. IF size > 5 MB → compress; IF no text layer → run OCR) and apply them to all uploaded files in one run |
| **Semantic Page Grouping** | (Also listed under intelligence) — auto-split on detected topic boundaries |
| **Shareable Recipe URL** | Encode an operation chain as a URL. A colleague opens the link, uploads their PDF, and the same sequence runs automatically |

### Presentation

| Tool | What it does |
|------|-------------|
| **Presentation Mode** | Full-screen slideshow with keyboard navigation (← →), elapsed timer, and page counter. No PowerPoint needed |

### Batch and multi-file

| Tool | What it does |
|------|-------------|
| **Batch Process** | Apply compress, watermark, rotate, or page-number to multiple PDFs simultaneously |

---

## Voice commands

CommandEditor includes a comprehensive voice command system supporting natural language and accent variants. Click the microphone button and speak.

**50+ commands across the full tool set**, including:

| Say | Action |
|-----|--------|
| *"merge the files"* / *"join them"* / *"combine"* | Merge PDFs |
| *"squish it"* / *"make it smaller"* / *"compress"* | Compress PDF |
| *"stamp confidential"* / *"watermark"* | Add watermark |
| *"compare PDFs"* / *"find differences"* / *"diff"* | Compare two PDFs |
| *"spell check"* / *"check spelling"* / *"typos"* | Run spell check |
| *"PII scan"* / *"sensitive data"* / *"find emails"* | Scan for personal data |
| *"flashcards"* / *"study cards"* / *"quiz cards"* | Generate flashcards |
| *"podcast script"* / *"read aloud"* / *"narration"* | Format as podcast script |
| *"anki deck"* / *"spaced repetition"* / *"study deck"* | Export Anki cards |
| *"ink cost"* / *"print cost"* / *"how much ink"* | Estimate ink coverage |
| *"timeline"* / *"extract dates"* / *"chronology"* | Extract date timeline |
| *"tone analysis"* / *"sentiment"* / *"mood"* | Analyse document tone |
| *"detect language"* / *"what language"* | Identify language |
| *"citations"* / *"references"* / *"bibliography"* | Extract citations |
| *"record macro"* / *"record steps"* | Start macro recording |
| *"present"* / *"slideshow"* / *"presentation mode"* | Launch slideshow |
| *"tamper seal"* / *"seal the document"* / *"notarise"* | Create tamper seal |
| *"preflight"* / *"print ready"* / *"press ready"* | Run print preflight |
| *"AES encrypt"* / *"AES-256"* / *"strong encrypt"* | AES-256 encrypt |
| *"start over"* / *"clear all"* / *"fresh start"* | Reset everything |

---

## UX features

### Onboarding
- 5-step guided tour on first load (re-triggerable via 👋 button)
- Contextual next-step chips after every completed operation
- Smart suggestions from file analysis (e.g. "no text layer detected → try OCR")
- PDF health score card showing pages, size, text layer, image count, print dimensions

### Viewer
- Multi-page thumbnail strip with click-to-select and drag-to-reorder
- Keyboard navigation (arrow keys, Z to zoom)
- Thumbnail size slider (2 to 8 columns)
- Reading progress bar on long documents

### Workflow
- **Persistent defaults** — save your preferred compression level, watermark text, and page number position
- **Undo history** — step back through the last 5 processed outputs
- **Output filename control** — rename the file before downloading
- **Provenance audit trail** — collapsible log of every operation in the session with file sizes and timestamps
- **Tool search** — type to filter all tools by name
- **Session history** — time-stamped log of completed operations

### Mobile
- Bottom sheet tool picker for touch interfaces
- Large tap targets in mobile sheet
- Full responsive layout

### Accessibility
- ARIA labels throughout
- Keyboard-navigable tool grid (letter shortcuts: M = Merge, C = Compress, etc.)
- High-contrast design tokens

---

## Security model

**Zero-knowledge by design.** The security architecture is not a policy — it is a structural property of the application.

- No network requests are made during file processing. All operations run in the browser JavaScript engine or WebAssembly.
- AES-256 encryption uses the browser's native `crypto.subtle` API (PBKDF2 key derivation, 100,000 iterations, AES-GCM mode). The encrypted output contains a random 16-byte salt and 12-byte IV prepended to the ciphertext. There is no server to receive, log, or recover a password.
- The Tamper-Evident Seal uses `crypto.subtle.digest('SHA-256')` entirely client-side. The resulting certificate is downloaded to your machine — nothing is stored or transmitted.
- PII scanning, redaction verification, and accessibility checks all operate on the local file buffer.
- Micro-annotations are stored in `localStorage` keyed to the SHA-256 hash of the file. No annotation data is ever sent anywhere.
- HTTP security headers are set in `next.config.js`: strict Content-Security-Policy, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.

---

## Architecture

```
commandeditor/
├── app/
│   ├── page.tsx              # Root layout — state orchestration, voice routing, upload handling
│   ├── layout.tsx            # Next.js root layout with dark mode
│   └── globals.css           # Design tokens, component styles, animations
│
├── components/
│   ├── PDFTools.tsx          # All tool panels, handlers, and processing logic (~3,900 lines)
│   ├── PDFViewer.tsx         # Page thumbnail grid, selection, keyboard nav, minimap
│   ├── FileUpload.tsx        # Drop zone and file type detection
│   ├── VoiceCommand.tsx      # Web Speech API integration, command synonym map
│   ├── OnboardingTour.tsx    # 5-step guided tour with highlight rings
│   ├── PDFHealthScore.tsx    # Auto-analysis card (pages, size, text layer, images)
│   └── NextStepChips.tsx     # Contextual next-action suggestions per tool
│
└── utils/
    ├── pdfOperations.ts      # Core PDF operations (merge, split, compress, sign, OCR…)
    ├── advancedFeatures.ts   # v6 features (macro, batch rules, seal, annotations, tiling…)
    ├── documentIntelligence.ts # Analysis (readability, PII, diff, tone, language, citations…)
    ├── pdfText.ts            # Text extraction helpers
    ├── history.ts            # Undo stack management
    └── darkMode.ts           # System and manual dark mode detection
```

### Key dependencies

| Package | Purpose |
|---------|---------|
| `pdfjs-dist` | PDF rendering, text extraction, OCR prep, image detection |
| `pdf-lib` | PDF creation, modification, page manipulation, metadata |
| `mammoth` | Word (.docx) to HTML conversion for PDF generation |
| `fabric` | Canvas-based annotation and drawing layer |
| `jszip` | Multi-file ZIP output (image exports, batch processing) |
| `docx` | Word document generation |
| `jspdf` | PDF creation from canvas/images |
| `html2canvas` | Page-to-canvas rendering for flatten and grayscale |
| `react-colorful` | Colour picker for watermark, annotation, and signature colours |

---

## How specific features work

**Readability Score** — Implements the Flesch-Kincaid formula entirely in JavaScript. Extracts text via pdf.js, counts syllables with a regex heuristic, computes average words per sentence and syllables per word, applies the formula to yield a 0–100 score, then maps it to grade labels and top-word frequency analysis.

**PII Scanner** — Runs 11 compiled regex patterns against the text layer of each page: credit card (Luhn-pattern variants for Visa, Mastercard, Amex, Discover), US SSN, IBAN, email, UK National Insurance, UK phone, US phone, passport format, UK postcode, date-of-birth labelled strings, and IPv4. All matching is client-side.

**AES-256 Encryption** — Uses `crypto.subtle.importKey` with PBKDF2 to derive a 256-bit key from the user's password (100,000 iterations, SHA-256). Generates a cryptographically random 16-byte salt and 12-byte IV via `crypto.getRandomValues`. Encrypts with AES-GCM. Output format: `[16-byte salt][12-byte IV][ciphertext]`.

**Tamper-Evident Seal** — Reads the file as an `ArrayBuffer`, feeds it to `crypto.subtle.digest('SHA-256')`, captures `Date.now()` as the timestamp, and bundles them with file name and size into a JSON certificate. Verification re-hashes the target file and compares the hex digest.

**Ink Coverage Estimator** — Renders each page to a canvas at 0.5× scale (for speed), reads the RGBA pixel array, and counts pixels where average brightness < 240 (non-white). Coverage is expressed as a ratio of ink pixels to total pixels, converted to percentage and to an estimated cost at $0.02 per percentage point per page.

**Semantic Page Grouping** — Builds a TF-IDF matrix across all pages, computes cosine similarity between adjacent pages, and applies a threshold to form clusters. Pages within a cluster share dominant vocabulary; a different cluster begins where similarity drops below the threshold.

**Macro Recorder** — Wraps `handleToolAction` with a recording hook. When recording is active, each tool invocation is appended to an in-memory step array as `{ toolId, params, timestamp }`. On save, the macro is serialised to JSON and stored in `localStorage`. Replay iterates the steps with a 500ms inter-step delay, calling `handleToolAction` for each.

---

## Browser compatibility

Requires a modern browser with support for:
- Web Crypto API (`crypto.subtle`) — Chrome 37+, Firefox 34+, Safari 11+, Edge 79+
- Web Speech API (voice commands) — Chrome / Edge only; gracefully degraded on Firefox and Safari
- WebAssembly — all modern browsers
- `OffscreenCanvas` (used in some rendering paths) — Chrome 69+, Firefox 105+

---

## Customisation

**Persistent defaults** — Users can save preferred compression quality, watermark text, and page number position via the "Save as defaults" button. Stored in `localStorage` as `commandeditor-settings`.

**Macro sharing** — Macros export as `.macro.json` files. Share the file; a colleague imports it by dragging it into the Macro tool panel. The JSON schema is `{ id, name, steps: [{ toolId, params, timestamp }], created }`.

**Recipe URLs** — The Recipe tool encodes an operation chain into the URL fragment using `btoa` / `atob`. No server state is involved. The recipient opens the URL, uploads their PDF, and the tool sequence auto-applies.

---

## Roadmap

Features planned but not yet implemented:

- **Visual table extractor** — detect grid-layout text, render as editable HTML table, export to CSV/XLSX
- **Side-by-side diff viewer** — rendered page comparison (currently text-layer diff only)
- **Zoom/pan on processed result** — canvas-based magnification of output
- **Undo across sessions** — Blob → base64 serialisation with localStorage (limited by 10 MB cap)
- **Service Worker PDF polling** — watch a URL and notify on document change
- **Multi-party signing workflow** — peer-to-peer signing chain via URL-encoded PDF

---

## Licence

MIT. See LICENCE file.

---

*CommandEditor v6 — 50+ tools, 50+ voice commands, zero servers.*
