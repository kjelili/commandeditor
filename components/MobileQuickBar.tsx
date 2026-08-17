'use client'

import { useEffect, useState } from 'react'

/**
 * Mobile Quick Bar — v10 mobile-first gap fill.
 *
 * A thumb-reach bottom bar with the five highest-frequency actions,
 * rendered only on narrow viewports. Neutralises the "they have a mobile
 * app" advantage of upload-based rivals — as an installed PWA plus this
 * bar, the whole toolkit is a mobile app.
 */
export default function MobileQuickBar({ onTool }: { onTool: (tool: string) => void }) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  if (!isMobile) return null

  const items: Array<{ id: string; emoji: string; label: string }> = [
    { id: 'merge', emoji: '⊕', label: 'Merge' },
    { id: 'compress', emoji: '◎', label: 'Shrink' },
    { id: 'sign', emoji: '✍️', label: 'Sign' },
    { id: 'listen', emoji: '🎧', label: 'Listen' },
    { id: 'ocr', emoji: '🔎', label: 'OCR' },
  ]

  return (
    <nav
      aria-label="Quick actions"
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 45,
        display: 'flex', justifyContent: 'space-around',
        background: 'var(--navy)', borderTop: '1px solid var(--border)',
        padding: '6px 4px calc(6px + env(safe-area-inset-bottom))',
        backdropFilter: 'blur(12px)',
      }}
    >
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => onTool(it.id)}
          aria-label={it.label}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.85)', fontSize: 10, padding: '4px 10px',
          }}
        >
          <span style={{ fontSize: 18 }}>{it.emoji}</span>
          {it.label}
        </button>
      ))}
    </nav>
  )
}
