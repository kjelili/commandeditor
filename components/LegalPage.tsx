'use client'

import Link from 'next/link'
import { ReactNode } from 'react'

interface Props {
  title: string
  updated: string
  downloadHref: string
  downloadName: string
  children: ReactNode
}

/** Shared shell for the Terms and Privacy pages: readable column, back link,
 *  and a download button pointing at the plain-text version in /public. */
export default function LegalPage({ title, updated, downloadHref, downloadName, children }: Props) {
  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-0, #f8fafc)' }}>
      <nav style={{ background: 'var(--navy, #0b1220)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group" aria-label="CommandEditor — home">
            <span className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center">
              <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="w-full h-full">
                <defs><linearGradient id="ceGradLegal" x1="0" y1="0" x2="0" y2="40" gradientUnits="userSpaceOnUse"><stop stopColor="#131f37"/><stop offset="1" stopColor="#0a1120"/></linearGradient></defs>
                <rect x="1.5" y="1.5" width="37" height="37" rx="11" fill="url(#ceGradLegal)" stroke="#3f5fb0" strokeOpacity="0.85" strokeWidth="1.4"/>
                <g transform="translate(9,9) scale(0.917)" fill="none" stroke="#ffffff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/></g>
                
              </svg>
            </span>
            <span className="font-bold text-white group-hover:opacity-80 transition-opacity" style={{ fontFamily: 'Syne, sans-serif' }}>CommandEditor</span>
          </Link>
          <Link href="/" className="text-sm text-white/60 hover:text-white transition-colors">← Back to app</Link>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
          <h1 className="text-3xl font-bold" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--ink, #0f172a)' }}>{title}</h1>
          <a href={downloadHref} download={downloadName}
             className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-transform hover:scale-105"
             style={{ background: 'linear-gradient(135deg, #3B82F6, #2563EB)' }}>
            ⬇ Download
          </a>
        </div>
        <p className="text-sm mb-8" style={{ color: 'var(--ink-muted, #64748b)' }}>Last updated: {updated}</p>
        <div className="legal-body space-y-5 text-[15px] leading-7" style={{ color: 'var(--ink-soft, #334155)' }}>
          {children}
        </div>
      </main>
    </div>
  )
}
