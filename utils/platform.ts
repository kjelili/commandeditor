// Build-time platform flag.
//
// IS_DESKTOP is true only in the Tauri desktop bundle, which is built with
// NEXT_PUBLIC_TAURI_BUILD=1 (see .github/workflows/desktop.yml). Next.js inlines
// NEXT_PUBLIC_* variables at build time, so this is a compile-time constant:
// the web build (Vercel, no flag) keeps every cloud feature, while the desktop
// export has the cloud UI stripped out. No runtime detection, no hydration flash.
export const IS_DESKTOP = process.env.NEXT_PUBLIC_TAURI_BUILD === '1';
