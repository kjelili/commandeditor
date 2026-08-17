# CommandEditor Browser Extension

Right-click any PDF link → **"Open in CommandEditor"** — the PDF loads
straight into the private, in-browser toolkit. No uploads, ever.

## Install (developer mode, Chrome / Edge / Brave)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select this `extension/` folder

## What it does

- **Context menu on PDF links**: opens `commandeditor.com/?import=<url>` —
  the site fetches the bytes directly into your browser tab.
- **Context menu on any page**: "Edit this page as PDF" jumps to the
  Print-to-PDF tool.
- **Toolbar popup**: one-click shortcuts to Merge, Compress, Sign, OCR,
  and the Co-Review Room.

## Privacy

- `permissions` contains **only** `contextMenus` — no `host_permissions`,
  no content scripts, no access to any page's content.
- No analytics, no telemetry, no remote code, no network requests of its
  own. The only URL it constructs is `commandeditor.com`.
- Fully auditable: the entire extension is ~60 lines of JavaScript.

## Firefox

Firefox MV3 supports `contextMenus` identically; load via
`about:debugging` → "Load Temporary Add-on". A signed listing is planned.
