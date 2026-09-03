import type { Metadata } from 'next'
import ComparePage from '@/components/ComparePage'

export const metadata: Metadata = {
  title: 'CommandEditor vs PDF24 — free PDF tools compared honestly',
  description: 'PDF24 is free but uploads your files to its servers and shows ads. CommandEditor runs 110+ tools entirely in your browser — no uploads, no ads, works offline. See the honest comparison.',
  alternates: { canonical: 'https://www.commandeditor.com/compare/pdf24' },
}

export default function Page() {
  return (
    <ComparePage
      rival="PDF24"
      tagline="The most generous of the free suites — no watermarks, no task limits — but the online tools upload your files, the interface is ad-supported, and the offline desktop app is Windows-only."
      rows={[
        { feature: 'Files leave your device', ce: 'Never', them: 'Every online task (desktop app is local)' },
        { feature: 'Ads', ce: false, them: 'On the web tools' },
        { feature: 'Task or file-size limits', ce: 'None', them: 'None — genuinely free' },
        { feature: 'Works offline', ce: 'Yes, in any browser on any OS', them: 'Windows desktop app only' },
        { feature: 'Voice commands', ce: '60+ commands + on-device Whisper', them: false },
        { feature: 'On-device AI assistant', ce: true, them: false },
        { feature: 'Native PDF password protection', ce: true, them: true },
        { feature: 'Factur-X e-invoices', ce: true, them: false },
        { feature: 'Open source', ce: true, them: false },
        { feature: 'Windows desktop app', ce: 'Tauri build (see Releases)', them: true },
        { feature: 'Price', ce: 'Free forever', them: 'Free (ad-funded)' },
      ]}
      verdict="Credit where due: PDF24 is the rare free suite with no watermarks and no task limits, and its Windows Creator app processes locally. But its online tools upload every file, the web UI is ad-supported, and Mac/Linux users get no offline option. CommandEditor matches the generosity, drops the ads, works offline in any browser on any OS, and adds voice control, on-device AI, Factur-X e-invoicing and blockchain notarization — all open source."
    />
  )
}
