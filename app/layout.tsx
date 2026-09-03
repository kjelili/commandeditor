import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/react'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://commandeditor.com'),
  title: {
    default: 'CommandEditor — Free PDF Editor Online, No Upload (113 Tools)',
    template: '%s · CommandEditor',
  },
  description:
    'Free online PDF editor that never uploads your files. CommandEditor is a private, browser-based PDF & document toolkit with 113 tools — including an on-device AI assistant, cryptographic e-signatures, document fingerprinting, redaction, OCR, and 60+ hands-free voice commands. Everything runs in your browser; your files never leave your device.',
  keywords: [
    'PDF editor', 'free PDF tools', 'merge PDF', 'split PDF', 'compress PDF',
    'PDF voice commands', 'voice-controlled PDF', 'hands-free PDF', 'accessible PDF editor',
    'private PDF editor', 'browser PDF tools', 'no upload PDF',
    'OCR online', 'redact PDF', 'sign PDF', 'PDF to Word', 'CommandEditor',
  ],
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'CommandEditor' },
  applicationName: 'CommandEditor',
  authors: [{ name: 'CommandEditor' }],
  alternates: { canonical: 'https://commandeditor.com' },
  openGraph: {
    title: 'CommandEditor — Free PDF Editor Online, No Upload',
    description:
      '113 PDF tools, an on-device AI assistant, cryptographic e-signatures, and 60+ hands-free voice commands — zero uploads. Every operation runs in your browser; your documents never leave your device.',
    type: 'website',
    url: 'https://commandeditor.com',
    siteName: 'CommandEditor',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CommandEditor — Free PDF Editor Online, No Upload',
    description: 'A private PDF toolkit with 113 tools — AI assistant, e-signatures, redaction, and 60+ voice commands, all in your browser. No uploads, no sign-up, free forever.',
  },
  robots: { index: true, follow: true },
  // Search Console / Bing verification — set the codes as Vercel env vars
  // (NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION / NEXT_PUBLIC_BING_SITE_VERIFICATION);
  // the meta tags appear automatically, no code change needed.
  verification: {
    google: 'cBEp0vWlYdIqoybswdqSgIPhS09MN0gGNjN2o8pMW3E',
    other: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
      ? { 'msvalidate.01': process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION }
      : {},
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#2563eb',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        {/* JSON-LD: WebApplication schema helps search engines display the
            free-pricing badge and the privacy claim accurately. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebApplication',
              name: 'CommandEditor',
              url: 'https://commandeditor.com',
              applicationCategory: 'ProductivityApplication',
              operatingSystem: 'Any (browser-based)',
              description:
                'Private PDF and document toolkit. 113 tools — including an on-device AI assistant and cryptographic e-signatures — that run entirely in your browser. Your files never leave your device.',
              offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
              featureList: [
                'Merge, split, compress PDF',
                'OCR and text extraction',
                'PDF to Word, Excel, PowerPoint',
                'AES-256 encryption (client-side)',
                'PII scanner and redaction',
                'Voice commands',
                'Offline-capable PWA',
              ],
            }),
          }}
        />
      </head>
      <body>
        <div id="root">{children}</div>
        <Analytics />
      </body>
    </html>
  )
}
