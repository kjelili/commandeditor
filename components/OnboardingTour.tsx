'use client'

import { useState, useEffect, useRef } from 'react'

interface Step {
  target: string
  title: string
  body: string
  position: 'bottom' | 'top' | 'left' | 'right'
  emoji: string
}

const STEPS: Step[] = [
  { target: '#upload-zone', title: 'Upload your file', body: 'Drop a PDF, image, Word doc, or any supported file here — or click "Choose Files". Your file never leaves your device.', position: 'bottom', emoji: '📂' },
  { target: '#tool-grid', title: 'Pick a tool', body: 'Choose from 50+ tools. Search by name, or press a letter key (M = Merge, C = Compress…). Hover any tool for a description.', position: 'top', emoji: '🔧' },
  { target: '#pdf-viewer-section', title: 'Preview & interact', body: 'Pages appear here. Click to select, drag to reorder, hover for rotate/delete buttons. Use the search bar to find text.', position: 'top', emoji: '👁' },
  { target: '#download-btn', title: 'Download your result', body: 'Your processed file appears here. Rename it before downloading, or press Ctrl+S. The file is only on your device.', position: 'top', emoji: '⬇️' },
  { target: '#voice-btn', title: 'Voice commands', body: 'Click the mic and say things like "compress", "merge", or "make it grayscale". Supports accents and natural phrasing.', position: 'left', emoji: '🎙️' },
]

interface Props {
  onComplete: () => void
}

export default function OnboardingTour({ onComplete }: Props) {
  const [step, setStep] = useState(0)
  const [pos, setPos] = useState({ top: 0, left: 0, arrowSide: 'top' as string })
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const s = STEPS[step]
    const el = document.querySelector(s.target) as HTMLElement | null
    if (!el) return

    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // Add highlight ring
    el.setAttribute('data-tour-highlight', 'true')

    const rect = el.getBoundingClientRect()
    const boxH = 200, boxW = 340
    let top = 0, left = 0, arrowSide = s.position

    if (s.position === 'bottom') {
      top = rect.bottom + 16
      left = rect.left + rect.width / 2 - boxW / 2
    } else if (s.position === 'top') {
      top = rect.top - boxH - 16
      left = rect.left + rect.width / 2 - boxW / 2
    } else if (s.position === 'left') {
      top = rect.top + rect.height / 2 - boxH / 2
      left = rect.left - boxW - 16
    } else {
      top = rect.top + rect.height / 2 - boxH / 2
      left = rect.right + 16
    }

    // Clamp to viewport
    left = Math.max(12, Math.min(left, window.innerWidth - boxW - 12))
    top = Math.max(12, Math.min(top, window.innerHeight - boxH - 12))

    setPos({ top, left, arrowSide })

    return () => { el.removeAttribute('data-tour-highlight') }
  }, [step])

  const advance = () => {
    if (step < STEPS.length - 1) setStep(s => s + 1)
    else onComplete()
  }

  const current = STEPS[step]

  return (
    <>
      {/* Dimming overlay */}
      <div className="fixed inset-0 z-[90] pointer-events-none"
           style={{ background: 'rgba(13,27,62,0.55)', backdropFilter: 'blur(2px)' }} />

      {/* Tour box */}
      <div ref={boxRef}
           className="fixed z-[100] animate-scale-in"
           style={{ top: pos.top, left: pos.left, width: 340 }}>
        <div className="rounded-2xl p-5 shadow-2xl"
             style={{ background: 'var(--card-bg)', border: '1.5px solid var(--blue-vivid)', boxShadow: '0 0 0 3px rgba(37,99,235,0.15), 0 24px 48px rgba(0,0,0,0.25)' }}>
          <div className="flex items-start gap-3 mb-3">
            <span className="text-2xl flex-shrink-0">{current.emoji}</span>
            <div>
              <p className="font-bold text-sm mb-1" style={{ color: 'var(--ink)', fontFamily: 'Syne, sans-serif' }}>{current.title}</p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{current.body}</p>
            </div>
          </div>

          {/* Progress dots */}
          <div className="flex items-center gap-1.5 mb-4">
            {STEPS.map((_, i) => (
              <div key={i} className="rounded-full transition-all duration-300"
                   style={{ width: i === step ? 20 : 6, height: 6, background: i === step ? 'var(--blue-vivid)' : 'var(--border-strong)' }} />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={onComplete} className="btn-ghost text-xs px-3 py-2" style={{ color: 'var(--ink-muted)' }}>
              Skip tour
            </button>
            <div className="flex-1" />
            {step > 0 && (
              <button onClick={() => setStep(s => s - 1)}
                      className="text-xs px-3 py-2 rounded-xl font-semibold transition-all"
                      style={{ color: 'var(--ink-soft)', background: 'var(--surface-2)' }}>
                ← Back
              </button>
            )}
            <button onClick={advance} className="btn-primary text-xs px-4 py-2"
                    style={{ background: 'var(--blue-vivid)' }}>
              {step === STEPS.length - 1 ? '✓ Got it!' : 'Next →'}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        [data-tour-highlight="true"] {
          position: relative;
          z-index: 95;
          border-radius: 16px;
          box-shadow: 0 0 0 4px var(--blue-vivid), 0 0 0 8px rgba(37,99,235,0.25) !important;
        }
      `}</style>
    </>
  )
}
