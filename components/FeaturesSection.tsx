'use client'

export default function FeaturesSection() {
  const features = [
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 7h12m0 0l-4-4m4 4l-4 4M4 17h12m0 0l-4-4m4 4l-4 4"/>
        </svg>
      ),
      color: 'gold',
      eyebrow: 'Core Tool',
      title: 'Merge PDFs',
      description: 'Combine multiple PDF files into a single document. Drag to reorder pages before merging.',
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v20M2 12h20"/>
        </svg>
      ),
      color: 'moss',
      eyebrow: 'Core Tool',
      title: 'Split & Extract',
      description: 'Select specific pages and extract them into a new PDF. Perfect for isolating sections.',
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
        </svg>
      ),
      color: 'azure',
      eyebrow: 'Core Tool',
      title: 'Smart Compress',
      description: 'Reduce file size with intelligent compression. Adjust quality to find the perfect balance.',
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/>
        </svg>
      ),
      color: 'ember',
      eyebrow: 'Core Tool',
      title: 'Edit & Annotate',
      description: 'Add text overlays anywhere on any page. Click to position, type to annotate.',
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
        </svg>
      ),
      color: 'gold',
      eyebrow: 'Convert',
      title: 'PDF to Image',
      description: 'Export any PDF page as PNG, JPG, or WebP. High-resolution output at 2x scale.',
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
      ),
      color: 'moss',
      eyebrow: 'Convert',
      title: 'Files to PDF',
      description: 'Convert images, Word docs, text, HTML, and Markdown files into polished PDFs.',
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
        </svg>
      ),
      color: 'azure',
      eyebrow: 'Accessibility',
      title: 'Voice Commands',
      description: 'Say "Hey Editor, merge PDFs" or "compress this" to trigger any tool hands-free.',
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      ),
      color: 'moss',
      eyebrow: 'Privacy',
      title: 'Zero Data Collection',
      description: 'No analytics, no tracking, no cookies. Your documents are yours, always.',
    },
  ]

  const colorMap: Record<string, { bg: string; text: string; border: string }> = {
    gold: { bg: 'rgba(196,154,46,0.10)', text: '#a67f20', border: 'rgba(196,154,46,0.20)' },
    moss: { bg: 'rgba(94,128,80,0.10)', text: '#456038', border: 'rgba(94,128,80,0.20)' },
    azure: { bg: 'rgba(61,110,158,0.10)', text: '#2a5280', border: 'rgba(61,110,158,0.20)' },
    ember: { bg: 'rgba(192,72,50,0.10)', text: '#a03020', border: 'rgba(192,72,50,0.20)' },
  }

  return (
    <section id="features" className="py-16 sm:py-24 border-t border-ink-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="max-w-xl mb-14">
          <span className="eyebrow text-gold-600 block mb-3">Everything you need</span>
          <h2 className="display-md text-ink-900 mb-4">
            A complete document toolkit
          </h2>
          <p className="body-md text-ink-500">
            Professional-grade tools for everyday document work, 
            all running locally in your browser without compromising your privacy.
          </p>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((feature, i) => {
            const colors = colorMap[feature.color]
            return (
              <div
                key={feature.title}
                className="card group hover:-translate-y-1 transition-all duration-300 hover:shadow-lift"
                style={{ animationDelay: `${i * 75}ms` }}
              >
                {/* Icon */}
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center mb-4 transition-transform duration-200 group-hover:scale-110"
                  style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
                >
                  <span style={{ color: colors.text }}>{feature.icon}</span>
                </div>

                {/* Eyebrow */}
                <span className="eyebrow text-ink-400 block mb-2">{feature.eyebrow}</span>

                {/* Title */}
                <h3 className="font-display font-semibold text-ink-900 text-lg mb-2">{feature.title}</h3>

                {/* Desc */}
                <p className="caption text-ink-500 leading-relaxed">{feature.description}</p>
              </div>
            )
          })}
        </div>

        {/* Bottom CTA */}
        <div className="mt-12 text-center">
          <a href="#workspace" className="btn-primary inline-flex">
            Try it now — no sign-up required
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="ml-1">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        </div>
      </div>
    </section>
  )
}
