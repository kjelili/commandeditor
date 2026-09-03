import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SEO_TOOLS, getSeoTool } from '@/lib/seoTools'

export const dynamicParams = false

export function generateStaticParams() {
  return SEO_TOOLS.map(t => ({ slug: t.id }))
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const tool = getSeoTool(params.slug)
  if (!tool) return {}
  const title = `${tool.title} online — free, no upload, no sign-up | CommandEditor`
  const description = `${tool.blurb} 100% private: processed in your browser, files never leave your device. Free forever.`
  return {
    title,
    description,
    keywords: tool.keywords,
    alternates: { canonical: `https://commandeditor.com/tools/${tool.id}` },
    openGraph: { title, description, url: `https://commandeditor.com/tools/${tool.id}`, type: 'website' },
  }
}

export default function ToolLandingPage({ params }: { params: { slug: string } }) {
  const tool = getSeoTool(params.slug)
  if (!tool) notFound()

  const howToJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: `How to ${tool.title.toLowerCase()} without uploading`,
    step: tool.steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, text: s })),
  }
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'CommandEditor', item: 'https://commandeditor.com' },
      { '@type': 'ListItem', position: 2, name: 'Tools', item: 'https://commandeditor.com/tools' },
      { '@type': 'ListItem', position: 3, name: tool.title, item: `https://commandeditor.com/tools/${tool.id}` },
    ],
  }
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: tool.faqs.map(f => ({
      '@type': 'Question', name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }

  return (
    <main className="min-h-screen" style={{ background: 'var(--navy, #0d1b3e)', color: 'white' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(howToJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <div className="max-w-3xl mx-auto px-4 py-16">
        <nav className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>
          <Link href="/" style={{ color: 'var(--blue-glow, #60a5fa)' }}>CommandEditor</Link>
          <span className="mx-2">/</span>
          <Link href="/tools" style={{ color: 'var(--blue-glow, #60a5fa)' }}>Tools</Link>
          <span className="mx-2">/</span>
          <span>{tool.title}</span>
        </nav>

        <h1 className="text-3xl md:text-5xl font-bold mb-4">{tool.title} — free, private, in your browser</h1>
        <p className="text-lg mb-8" style={{ color: 'rgba(255,255,255,0.75)' }}>
          {tool.blurb} Unlike iLovePDF or Smallpdf, nothing is uploaded: the processing
          happens on your own device, so the tool works even with the Wi-Fi off.
        </p>

        <Link href={`/?tool=${tool.id}`}
              className="inline-block px-8 py-4 rounded-2xl font-bold text-lg transition-transform hover:scale-[1.02]"
              style={{ background: 'var(--blue, #2563eb)', color: 'white' }}>
          {tool.title} now — no sign-up →
        </Link>

        <h2 className="text-xl font-bold mt-12 mb-4">How it works</h2>
        <ol className="space-y-3">
          {tool.steps.map((s, i) => (
            <li key={i} className="flex gap-3 items-start">
              <span className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold"
                    style={{ background: 'rgba(96,165,250,0.2)', color: 'var(--blue-glow, #60a5fa)' }}>{i + 1}</span>
              <span style={{ color: 'rgba(255,255,255,0.8)' }}>{s}</span>
            </li>
          ))}
        </ol>

        <h2 className="text-xl font-bold mt-12 mb-4">Questions</h2>
        <div className="space-y-4">
          {tool.faqs.map((f, i) => (
            <details key={i} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <summary className="font-semibold cursor-pointer">{f.q}</summary>
              <p className="text-sm mt-2" style={{ color: 'rgba(255,255,255,0.7)' }}>{f.a}</p>
            </details>
          ))}
        </div>

        <h2 className="text-xl font-bold mt-12 mb-4">Related tools</h2>
        <div className="flex flex-wrap gap-3">
          {tool.related.map(r => {
            const rel = getSeoTool(r)
            return (
              <Link key={r} href={rel ? `/tools/${rel.id}` : `/?tool=${r}`}
                    className="px-4 py-2 rounded-xl text-sm font-semibold"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}>
                {rel ? rel.title : r}
              </Link>
            )
          })}
        </div>

        <p className="text-xs mt-12" style={{ color: 'rgba(255,255,255,0.4)' }}>
          CommandEditor is open source and free forever. 113 tools, 60+ voice commands,
          on-device AI — your files never leave your device.
        </p>
      </div>
    </main>
  )
}
