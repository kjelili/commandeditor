import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Compare CommandEditor — honest head-to-heads with the big PDF tools',
  description: 'Side-by-side comparisons: CommandEditor vs iLovePDF, Smallpdf, and Adobe Acrobat Online. Privacy, limits, price, and features — fairly stated.',
  alternates: { canonical: 'https://commandeditor.com/compare' },
}

const COMPARISONS = [
  { slug: 'ilovepdf', name: 'iLovePDF', hook: 'The market leader — with server uploads and free-tier caps.' },
  { slug: 'smallpdf', name: 'Smallpdf', hook: 'Beautiful UI, two free tasks a day, ~$10/month after that.' },
  { slug: 'adobe', name: 'Adobe Acrobat Online', hook: 'The original — sign-in walls and a $240/year Pro tier.' },
  { slug: 'pdf24', name: 'PDF24', hook: 'Genuinely free — but uploads files online, shows ads, Windows-only desktop.' },
]

export default function CompareIndex() {
  return (
    <main className="min-h-screen" style={{ background: 'var(--navy, #0d1b3e)', color: 'white' }}>
      <div className="max-w-3xl mx-auto px-4 py-16">
        <Link href="/" className="text-sm" style={{ color: 'var(--blue-glow, #60a5fa)' }}>← CommandEditor</Link>
        <h1 className="text-3xl md:text-4xl font-bold mt-4 mb-2">Honest comparisons</h1>
        <p className="mb-10" style={{ color: 'rgba(255,255,255,0.7)' }}>
          We compare fairly — including where rivals genuinely win. That&apos;s what makes the wins for privacy credible.
        </p>
        <div className="space-y-4">
          {COMPARISONS.map((c) => (
            <Link key={c.slug} href={`/compare/${c.slug}`}
                  className="block p-5 rounded-2xl transition-transform hover:scale-[1.01]"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}>
              <p className="font-semibold">CommandEditor vs {c.name} →</p>
              <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.6)' }}>{c.hook}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
