'use client'

import { useEffect, useState } from 'react'

/**
 * PWAInstaller — v9 gap fill.
 *
 * 1. Registers /sw.js so the entire toolkit works fully offline after the
 *    first visit (previously the "Offline-capable PWA" claim had no worker
 *    behind it). The install prompt itself is owned by app/page.tsx's
 *    banner — this component deliberately does not double-capture
 *    `beforeinstallprompt`.
 * 2. Shows a live status badge: "Offline-ready" once the worker is active,
 *    and "Offline — all tools still work" when the network drops, so users
 *    know the zero-upload architecture keeps functioning without it.
 */
export default function PWAInstaller() {
  const [online, setOnline] = useState(true)
  const [swReady, setSwReady] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(() => setSwReady(true))
        .catch(() => setSwReady(false))
    }

    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    const onInstalled = () => setInstalled(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener('appinstalled', onInstalled)
    setOnline(navigator.onLine)
    if (window.matchMedia('(display-mode: standalone)').matches) setInstalled(true)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  return (
    <>
      {!online && (
        <span
          className="badge text-xs animate-fade-up"
          style={{ background: 'rgba(217,119,6,0.15)', color: '#fbbf24', fontSize: '10px' }}
          title="No connection — every tool still works, all processing is on-device"
        >
          ⚡ Offline — all tools still work
        </span>
      )}
      {online && swReady && (
        <span
          className="badge hidden sm:inline-flex text-xs"
          style={{ background: 'rgba(5,150,105,0.15)', color: '#34d399', fontSize: '10px' }}
          title="Service worker active — this toolkit is cached for full offline use"
        >
          ● {installed ? 'Installed · offline-ready' : 'Offline-ready'}
        </span>
      )}
    </>
  )
}
