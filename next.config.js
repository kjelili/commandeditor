/** @type {import('next').NextConfig} */

// CommandEditor — Vercel deployment configuration
//
// All file processing happens in the user's browser. Vercel just serves
// the bundled JS. No API routes, no SSR, no backend logic.
//
// HTTP security headers are configured in vercel.json (not here),
// because Vercel applies them at the edge before any Next.js code runs.
//
// The pdf.js worker is loaded from unpkg.com CDN at runtime, so it
// doesn't need to be in the public folder or bundled.
const nextConfig = {
  reactStrictMode: true,

  // Keep trailing slashes for URL consistency
  trailingSlash: true,

  // Static export only for the Tauri desktop bundle (TAURI_BUILD=1 pnpm build
  // → out/, consumed by desktop/src-tauri). Web/Vercel builds are unaffected.
  ...(process.env.TAURI_BUILD ? { output: 'export' } : {}),

  // Disable Next.js image optimization — we don't use next/image
  images: {
    unoptimized: true,
  },

  poweredByHeader: false,

  webpack: (config, { isServer }) => {
    // pdf.js conditionally references Node-only modules. Stub them
    // out for the browser bundle so webpack doesn't complain.
    config.resolve.alias.canvas = false

    // transformers.js (AI assistant) ships a Node backend we never use —
    // everything runs on the WASM/browser backend. Alias the Node-only
    // packages away so webpack doesn't try to bundle native binaries.
    config.resolve.alias['onnxruntime-node$'] = false
    config.resolve.alias['sharp$'] = false

    if (!isServer) {
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        canvas: false,
        fs: false,
        path: false,
      }
    }

    return config
  },
}

module.exports = nextConfig
