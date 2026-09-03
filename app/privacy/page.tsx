import type { Metadata } from 'next'
import LegalPage from '@/components/LegalPage'

export const metadata: Metadata = {
  title: 'Privacy Policy — CommandEditor',
  description: 'How CommandEditor handles your data: files never leave your browser. No accounts, no uploads, no data sales.',
}

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold pt-3" style={{ color: 'var(--ink, #0f172a)' }}>{children}</h2>
}

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="16 August 2026"
      downloadHref="/privacy-policy.txt" downloadName="CommandEditor-Privacy-Policy.txt">
      <p>CommandEditor is a browser-based document toolkit built around a simple principle: your files stay on your device. This policy explains what that means in practice and the few places where data does leave your browser.</p>
      <H>1. No accounts, no file uploads</H>
      <p>CommandEditor has no sign-up and no login. When you open, edit, convert, sign, redact or otherwise process a document, that work happens entirely inside your web browser using JavaScript and WebAssembly. Your files are never uploaded to, stored on, or seen by CommandEditor&apos;s servers, because there is no such server component for document processing.</p>
      <H>2. What we store on your device</H>
      <p>To make the app usable, CommandEditor saves small amounts of data in your browser&apos;s local storage — never on our servers. This can include your dark-mode preference, the names and sizes of recently opened files, fingerprint records you create, and similar settings. This data lives only in your browser and is removed if you clear your browser storage.</p>
      <H>3. Optional cloud connectors</H>
      <p>If you choose to connect Google Drive, Dropbox or OneDrive, authentication and file transfer happen directly between your browser and that provider. CommandEditor does not receive or store your cloud credentials or your files. Your use of those services is governed by their own privacy policies. If you never use a connector, no such connection is made.</p>
      <H>4. Optional AI assistant</H>
      <p>The in-browser AI assistant downloads its language model from a public CDN (Hugging Face) the first time you use it. Only the model files are downloaded to your browser; the content of your documents is analysed locally and is not sent to Hugging Face, CommandEditor, or any other party.</p>
      <H>5. Hosting and server logs</H>
      <p>The CommandEditor website is served as static files by our hosting provider. Like virtually all web hosts, it may automatically record standard technical request information (such as IP address, browser type and timestamps) for security and reliability. These logs are not used to identify you and are not linked to your documents, which never reach the server.</p>
      <H>6. Anonymous analytics, no sale of data, no advertising</H>
      <p>CommandEditor uses privacy-friendly, cookieless, aggregate web analytics (Vercel Web Analytics) to count anonymous page views and app installs, so we can understand adoption. These carry no file content and no personal data, set no cookies, and are never used for advertising or cross-site tracking; nothing is sent during document processing. CommandEditor does not sell, rent or trade personal information, and does not run third-party advertising.</p>
      <H>7. Children</H>
      <p>CommandEditor is a general-purpose tool and is not directed at children under 13. We do not knowingly collect personal information from children.</p>
      <H>8. Changes</H>
      <p>We may update this policy as the product evolves. Material changes will be reflected by the &quot;Last updated&quot; date above.</p>
      <H>9. Contact</H>
      <p>Questions about this policy can be sent to us at <a href="mailto:hello@commandeditor.com" className="underline" style={{ color: '#2563EB' }}>hello@commandeditor.com</a>.</p>
      <p className="text-sm pt-4" style={{ color: 'var(--ink-muted, #64748b)' }}>This document is provided for transparency and does not constitute legal advice.</p>
    </LegalPage>
  )
}
