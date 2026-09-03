import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Private AI for PDFs — on-device, no upload | CommandEditor',
  description: 'Chat with your PDF, summarize and ask questions — with AI that runs on your own device. Your document is never sent to a cloud model. Free, no sign-up, no AI credits.',
  keywords: ['private ai pdf', 'chat with pdf private', 'on-device ai', 'offline pdf ai', 'chatpdf alternative privacy'],
  alternates: { canonical: 'https://www.commandeditor.com/ai' },
}

export default function AiPage() {
  return (
    <main className="min-h-screen" style={{ background: 'var(--navy, #0d1b3e)', color: 'white' }}>
      <div className="max-w-3xl mx-auto px-4 py-16">
        <nav className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>
          <Link href="/" style={{ color: 'var(--blue-glow, #60a5fa)' }}>CommandEditor</Link>
          <span className="mx-2">/</span><span>On-device AI</span>
        </nav>

        <h1 className="text-3xl md:text-5xl font-bold mb-4">AI that never sees your file</h1>
        <p className="text-lg mb-8" style={{ color: 'rgba(255,255,255,0.75)' }}>
          Every other AI PDF tool — ChatPDF, Acrobat AI, Smallpdf AI — works by uploading your
          document to someone&apos;s cloud model. CommandEditor&apos;s assistant runs the model
          <b> on your device</b>. Summaries, Q&amp;A and extraction happen where the file already is.
        </p>

        <Link href="/?tool=summarize"
              className="inline-block px-8 py-4 rounded-2xl font-bold text-lg transition-transform hover:scale-[1.02]"
              style={{ background: 'var(--blue, #2563eb)', color: 'white' }}>
          Ask your PDF a question — privately →
        </Link>

        <div className="grid sm:grid-cols-2 gap-4 mt-12">
          {[
            ['🔒', 'Structurally private', 'The model downloads once from a public CDN and runs in WebAssembly/WebGPU on your machine. Your document is never part of any network request.'],
            ['💸', 'No AI credits, no tier', 'Adobe bundles AI at $24.99/month; others meter “AI credits”. On-device inference has no marginal cost — so it’s simply free.'],
            ['✈️', 'Works offline', 'After the first model download, the assistant keeps working with no connection at all.'],
            ['🗣', 'Voice-first', 'Ask by voice with on-device speech recognition — 60+ voice commands cover the whole toolkit too.'],
          ].map(([icon, h, b]) => (
            <div key={h} className="p-5 rounded-2xl" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <p className="text-2xl mb-2">{icon}</p>
              <p className="font-semibold mb-1">{h}</p>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>{b}</p>
            </div>
          ))}
        </div>

        <h2 className="text-xl font-bold mt-12 mb-4">The honest trade-off</h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.75)' }}>
          On-device models are smaller than frontier cloud models. For everyday summarizing,
          question-answering and data extraction they are more than good enough — and for
          confidential contracts, medical or financial documents, “good enough and private”
          beats “marginally smarter and uploaded”. If you need a frontier model, export the
          text with our Extract Text tool and paste it yourself — your choice, your control.
        </p>

        <p className="text-xs mt-12" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Verify the privacy claims yourself: <Link href="/no-upload" className="underline">Proof of no upload</Link>.
        </p>
      </div>
    </main>
  )
}
