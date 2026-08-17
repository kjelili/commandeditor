# Air-Gapped Deployment Guide

CommandEditor is one of the few document toolkits that can run in fully
air-gapped environments (legal discovery rooms, healthcare networks,
government facilities) — because there is no server component at all.

## Why it works air-gapped

- **No backend.** Every tool runs in the browser via JavaScript/WebAssembly.
  The "server" is any static file host.
- **No accounts, no telemetry calls** to CommandEditor infrastructure.
- **The pdf.js engine ships in `public/`** — not loaded from a CDN.
- **Optional AI models** (assistant, translation, Whisper voice) download
  once from HuggingFace; on an air-gapped station, either pre-seed the
  browser cache on a connected machine, or use the "Government / Air-gapped"
  policy preset which hides those tools.

## Deploying inside your network

```bash
npm ci
npm run build
npm start            # serves on :3000 — or
npx serve out        # if using static export
```

Any static server works equally well: nginx, IIS, Caddy, or even
`python3 -m http.server`. The only requirement is serving `public/` and the
`.next` build output over HTTP(S).

## Locking down

1. Enable the **Government / Air-gapped** policy preset (Tools → Policy) to
   hide cloud connectors, share-URL recipes, and model-downloading tools.
2. Optionally set CSP headers to `connect-src 'self'` — the app will keep
   working; only optional model downloads will be blocked.
3. The service worker caches the whole app on first load; after that, the
   station can be physically disconnected forever.

## Verifying privacy locally

Use **Tools → Proof of No Upload** to run a live egress audit during a
processing session, or inspect with your browser's DevTools Network tab —
you will see no document bytes leave, because there is nowhere for them to
go.
