import Link from 'next/link'

export interface CompareRow { feature: string; ce: string | boolean; them: string | boolean }

interface Props {
  rival: string
  tagline: string
  rows: CompareRow[]
  verdict: string
}

function Cell({ v }: { v: string | boolean }) {
  if (v === true) return <td className="py-2.5 px-3 text-center">✅</td>
  if (v === false) return <td className="py-2.5 px-3 text-center">❌</td>
  return <td className="py-2.5 px-3 text-center text-sm">{v}</td>
}

/**
 * Shared layout for /compare/* pages — honest, side-by-side feature tables.
 * SEO play: people searching "iLovePDF alternative" or "Smallpdf vs" land
 * on a page that wins on the criteria they care about, fairly stated.
 */
export default function ComparePage({ rival, tagline, rows, verdict }: Props) {
  return (
    <main className="min-h-screen" style={{ background: 'var(--navy, #0d1b3e)', color: 'white' }}>
      <div className="max-w-4xl mx-auto px-4 py-16">
        <Link href="/" className="text-sm" style={{ color: 'var(--blue-glow, #60a5fa)' }}>← CommandEditor</Link>
        <h1 className="text-3xl md:text-4xl font-bold mt-4 mb-2">CommandEditor vs {rival}</h1>
        <p className="text-base mb-10" style={{ color: 'rgba(255,255,255,0.7)' }}>{tagline}</p>

        <div className="overflow-x-auto rounded-2xl" style={{ border: '1px solid rgba(255,255,255,0.12)' }}>
          <table className="w-full" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.06)' }}>
                <th className="text-left py-3 px-3 text-sm">Feature</th>
                <th className="py-3 px-3 text-sm">CommandEditor</th>
                <th className="py-3 px-3 text-sm">{rival}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.feature} style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <td className="py-2.5 px-3 text-sm font-medium">{r.feature}</td>
                  <Cell v={r.ce} />
                  <Cell v={r.them} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-sm mt-8 leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>{verdict}</p>
        <Link href="/" className="inline-block mt-6 px-6 py-3 rounded-xl font-semibold text-sm"
              style={{ background: '#2563eb' }}>
          Try CommandEditor free — no sign-up
        </Link>
        <p className="text-xs mt-8" style={{ color: 'rgba(255,255,255,0.45)' }}>
          Comparison based on publicly documented free-tier behaviour as of August 2026. Trademarks belong to their owners.
        </p>
      </div>
    </main>
  )
}
