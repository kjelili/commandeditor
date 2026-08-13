# CommandEditor Desktop (Tauri) — scaffold

Native desktop wrapper for CommandEditor using [Tauri](https://tauri.app)
(~600 KB bundle vs ~150 MB for Electron; Rust backend, no Node attack surface).

**Status: scaffold.** Not yet part of CI; the web app is unaffected.

## Prerequisites
- Rust toolchain (`rustup`), plus Tauri OS deps: https://tauri.app/start/prerequisites/
- `cargo install tauri-cli`

## Development
```bash
# from the repo root — terminal 1:
npm run dev
# terminal 2:
cd desktop/src-tauri && cargo tauri dev
```

## Production build
Tauri bundles a static export of the site. Add `output: 'export'` to
next.config.js (or a separate export config), run `next build`, then:
```bash
cd desktop/src-tauri && cargo tauri build
```

`src/tauri-bridge.js` exposes native file open/save dialogs to the web app
when running inside Tauri; in the browser it no-ops and the web file inputs
are used instead.
