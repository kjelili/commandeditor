import type { Metadata } from 'next'
import Link from 'next/link'
import { SEO_TOOLS } from '@/lib/seoTools'

export const metadata: Metadata = {
  title: 'Free PDF tools — no upload, no sign-up | CommandEditor',
  description: 'Every CommandEditor PDF tool runs entirely in your browser: merge, split, compress, PDF to Word, OCR, sign, redact, and 100+ more. Free forever, files never leave your device.',
  alternates: { canonical: 'https://www.commandeditor.com/tools' },
}

export default function ToolsIndex() {
  return (
    <main className="min-h-screen" style={{ background: 'var(--navy, #0d1b3e)', color: 'white' }}>
      <div className="max-w-4xl mx-auto px-4 py-16">
        <Link href="/" className="text-sm" style={{ color: 'var(--blue-glow, #60a5fa)' }}>← CommandEditor</Link>
        <h1 className="text-3xl md:text-4xl font-bold mt-4 mb-2">PDF tools that never see your files</h1>
        <p className="mb-10" style={{ color: 'rgba(255,255,255,0.7)' }}>
          Every tool below runs 100% in your browser. No uploads, no accounts, no limits — pick one and go.
          The full toolkit has 110+ tools; these guides cover the most popular.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          {SEO_TOOLS.map(t => (
            <Link key={t.id} href={`/tools/${t.id}`}
                  className="p-5 rounded-2xl transition-transform hover:scale-[1.01]"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}>
              <p className="font-semibold">{t.title} →</p>
              <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.6)' }}>{t.blurb}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
