# CommandEditor Desktop (Tauri)

Native desktop wrapper for CommandEditor using [Tauri](https://tauri.app)
(~600 KB bundle vs ~150 MB for Electron; Rust backend, no Node attack surface).

**Status: CI-ready.** The release workflow lives at `desktop/desktop.yml` —
copy it to `.github/workflows/desktop.yml` (one click in the GitHub web UI:
*Add file → Create new file*, name `.github/workflows/desktop.yml`, paste)
because API tokens without the *Workflows* permission can't push workflow
files. Once in place it builds installer bundles for Linux (AppImage/deb),
Windows (msi/exe) and macOS (dmg) on every `desktop-v*` tag (draft GitHub
Release) or manual dispatch (artifacts only). `tests/desktop.test.mts`
validates the config before release.

## Release a desktop build

```bash
git tag desktop-v1.1.0 && git push origin desktop-v1.1.0
# → Actions → desktop-release → draft Release with installers attached
```

## How CI builds it

1. `TAURI_BUILD=1 pnpm build` at the repo root → static export to `out/`
   (next.config.js flips `output: 'export'` only when TAURI_BUILD is set;
   the Vercel web deployment is unaffected).
2. `tauri-action` compiles `desktop/src-tauri` and bundles `../../out/`
   (see `distDir`) into native installers.

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
