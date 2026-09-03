import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Factur-X / ZUGFeRD e-invoice generator — free, EN 16931, no upload',
  description: 'Create Factur-X (ZUGFeRD) compliant e-invoices free: attach EN 16931 XML to your invoice PDF in your browser. Ready for the German and French B2B e-invoicing mandates. No upload, no account.',
  keywords: ['factur-x', 'zugferd', 'en 16931', 'xrechnung', 'e-invoice germany', 'e-invoicing mandate france', 'e-rechnung'],
  alternates: { canonical: 'https://www.commandeditor.com/factur-x' },
}

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question', name: 'What is Factur-X?',
      acceptedAnswer: { '@type': 'Answer', text: 'Factur-X (known as ZUGFeRD in Germany) is the European hybrid e-invoice standard: a human-readable PDF/A-3 with a machine-readable EN 16931 XML file embedded. It satisfies the B2B e-invoicing mandates rolling out in Germany and France.' },
    },
    {
      '@type': 'Question', name: 'When does e-invoicing become mandatory?',
      acceptedAnswer: { '@type': 'Answer', text: 'Germany requires all businesses to be able to receive structured e-invoices since 1 January 2025, with issuing obligations phasing in 2027–2028. France phases in mandatory B2B e-invoicing from 2026–2027. Other EU states are following under the ViDA programme.' },
    },
    {
      '@type': 'Question', name: 'Does my invoice data leave my device?',
      acceptedAnswer: { '@type': 'Answer', text: 'No. CommandEditor builds the EN 16931 XML and embeds it into your PDF entirely in your browser. Invoice contents are never transmitted anywhere.' },
    },
  ],
}

export default function FacturXPage() {
  return (
    <main className="min-h-screen" style={{ background: 'var(--navy, #0d1b3e)', color: 'white' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <div className="max-w-3xl mx-auto px-4 py-16">
        <nav className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>
          <Link href="/" style={{ color: 'var(--blue-glow, #60a5fa)' }}>CommandEditor</Link>
          <span className="mx-2">/</span><span>Factur-X</span>
        </nav>

        <h1 className="text-3xl md:text-5xl font-bold mb-4">Factur-X e-invoices — free, compliant, private</h1>
        <p className="text-lg mb-8" style={{ color: 'rgba(255,255,255,0.75)' }}>
          Europe is switching to structured e-invoicing. CommandEditor turns your existing
          invoice PDF into a compliant Factur-X / ZUGFeRD document — EN 16931 XML embedded
          as a PDF/A-3 attachment — entirely in your browser. Financial data never leaves your device.
        </p>

        <Link href="/?tool=einvoice"
              className="inline-block px-8 py-4 rounded-2xl font-bold text-lg transition-transform hover:scale-[1.02]"
              style={{ background: 'var(--blue, #2563eb)', color: 'white' }}>
          Create a Factur-X invoice now →
        </Link>

        <h2 className="text-xl font-bold mt-12 mb-4">The mandate timeline</h2>
        <div className="space-y-3">
          {[
            ['Germany — since 1 Jan 2025', 'Every business must be able to receive structured e-invoices (XRechnung, ZUGFeRD/Factur-X). Issuing obligations phase in 2027–2028 by turnover.'],
            ['France — from 2026–2027', 'B2B e-invoicing becomes mandatory in phases: all businesses must receive from September 2026; issuing obligations follow by company size.'],
            ['EU-wide — ViDA', 'The VAT in the Digital Age programme extends structured e-invoicing across the single market through 2030+.'],
          ].map(([h, b]) => (
            <div key={h} className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <p className="font-semibold">{h}</p>
              <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.7)' }}>{b}</p>
            </div>
          ))}
        </div>

        <h2 className="text-xl font-bold mt-12 mb-4">What CommandEditor produces</h2>
        <ul className="space-y-2 text-sm" style={{ color: 'rgba(255,255,255,0.8)' }}>
          <li>✓ EN 16931 CrossIndustryInvoice XML (Factur-X Basic WL profile)</li>
          <li>✓ Embedded with AFRelationship “Alternative” — the conformance requirement</li>
          <li>✓ XMP metadata declaring PDF/A-3 and the Factur-X schema</li>
          <li>✓ Seller, buyer, line items with VAT, totals computed and cross-checked</li>
          <li>✓ Built locally — invoice contents are never transmitted</li>
        </ul>

        <h2 className="text-xl font-bold mt-12 mb-4">Questions</h2>
        <div className="space-y-4">
          {faqJsonLd.mainEntity.map((f, i) => (
            <details key={i} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <summary className="font-semibold cursor-pointer">{f.name}</summary>
              <p className="text-sm mt-2" style={{ color: 'rgba(255,255,255,0.7)' }}>{f.acceptedAnswer.text}</p>
            </details>
          ))}
        </div>

        <p className="text-xs mt-12" style={{ color: 'rgba(255,255,255,0.4)' }}>
          This page is general information, not tax advice. Confirm profile and
          field requirements for your jurisdiction with your tax advisor.
        </p>
      </div>
    </main>
  )
}
