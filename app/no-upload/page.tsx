import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Proof of no upload — verify it yourself | CommandEditor',
  description: 'CommandEditor processes PDFs 100% in your browser. Don\'t take our word for it: three ways to verify that your files never leave your device — network inspector, offline test, and open source code.',
  alternates: { canonical: 'https://www.commandeditor.com/no-upload' },
}

export default function NoUploadPage() {
  return (
    <main className="min-h-screen" style={{ background: 'var(--navy, #0d1b3e)', color: 'white' }}>
      <div className="max-w-3xl mx-auto px-4 py-16">
        <nav className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>
          <Link href="/" style={{ color: 'var(--blue-glow, #60a5fa)' }}>CommandEditor</Link>
          <span className="mx-2">/</span><span>Proof of no upload</span>
        </nav>

        <h1 className="text-3xl md:text-5xl font-bold mb-4">“No upload” is a claim. Here&apos;s the proof.</h1>
        <p className="text-lg mb-10" style={{ color: 'rgba(255,255,255,0.75)' }}>
          Every online PDF tool says it cares about privacy. CommandEditor is architecturally
          incapable of seeing your files — and you don&apos;t have to trust us. Three checks,
          two minutes, no account.
        </p>

        <div className="space-y-6">
          <section className="p-6 rounded-2xl" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h2 className="text-xl font-bold mb-2">1 · Watch the network tab</h2>
            <ol className="list-decimal ml-5 space-y-1 text-sm" style={{ color: 'rgba(255,255,255,0.8)' }}>
              <li>Open your browser&apos;s developer tools (F12) → <b>Network</b> tab.</li>
              <li>Drop a PDF into CommandEditor and run any tool — merge, compress, sign.</li>
              <li>Watch: <b>zero requests carry your file</b>. The only traffic is static code and fonts, fetched once.</li>
            </ol>
          </section>

          <section className="p-6 rounded-2xl" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h2 className="text-xl font-bold mb-2">2 · Pull the plug</h2>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.8)' }}>
              Load CommandEditor, then <b>switch off your Wi-Fi</b>. Every tool still works —
              because the processing never needed a server. (The PWA service worker caches the
              app; the engines are WebAssembly running on your device.) An upload-based tool
              dies the moment you go offline. Ours doesn&apos;t notice.
            </p>
          </section>

          <section className="p-6 rounded-2xl" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h2 className="text-xl font-bold mb-2">3 · Read the code</h2>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.8)' }}>
              CommandEditor is open source:{' '}
              <a href="https://github.com/kjelili/commandeditor" className="underline" style={{ color: 'var(--blue-glow, #60a5fa)' }}>
                github.com/kjelili/commandeditor</a>.
              There is no upload endpoint to audit around — the architecture has no server-side
              document processing at all. The built-in Network Audit tool monitors outbound
              connections from within the app itself.
            </p>
          </section>
        </div>

        <div className="mt-10 p-6 rounded-2xl" style={{ background: 'rgba(37,99,235,0.15)', border: '1px solid rgba(96,165,250,0.3)' }}>
          <p className="font-semibold mb-2">What we do transmit</p>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.75)' }}>
            Nothing, by default. Optional features that visibly reach out are always initiated
            by you and labelled: P2P Co-Review (direct browser-to-browser WebRTC, no document
            server), blockchain notarization (a SHA-256 hash only — never the file), and the
            on-device AI assistant downloading its open model once from a CDN. Your documents
            are never part of any request.
          </p>
        </div>

        <Link href="/" className="inline-block mt-10 px-8 py-4 rounded-2xl font-bold text-lg transition-transform hover:scale-[1.02]"
              style={{ background: 'var(--blue, #2563eb)', color: 'white' }}>
          Try it with the network tab open →
        </Link>
      </div>
    </main>
  )
}
