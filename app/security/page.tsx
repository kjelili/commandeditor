import type { Metadata } from 'next'
import LegalPage from '@/components/LegalPage'

export const metadata: Metadata = {
  title: 'Security & Compliance — CommandEditor',
  description: 'CommandEditor security architecture, cryptography, and data-protection posture: files are processed entirely in your browser and never uploaded.',
}

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold pt-3" style={{ color: 'var(--ink, #0f172a)' }}>{children}</h2>
}

export default function SecurityPage() {
  return (
    <LegalPage title="Security & Compliance" updated="26 August 2026"
      downloadHref="/security-compliance.txt" downloadName="CommandEditor-Security-Compliance.txt">
      <p>This page describes how CommandEditor protects documents and is intended to help security and procurement teams evaluate the product. The short version: because your files are processed entirely inside your browser and are never uploaded, most of the usual risk surface simply does not exist.</p>

      <H>1. Architecture — everything runs on your device</H>
      <p>CommandEditor is a client-side application. Merging, editing, converting, OCR, signing, redaction, encryption and every other operation execute in your browser using JavaScript and WebAssembly. The website is served as static files from a CDN; there is no server that receives, processes, or stores your documents. The optional desktop app (Windows, macOS, Linux) runs the same engine fully offline.</p>

      <H>2. Data handling — no uploads, verifiable</H>
      <p>Your documents are never transmitted to CommandEditor. To let you confirm this rather than take it on trust, the built-in &quot;Proof of No Upload&quot; tool monitors the page&apos;s outgoing network activity so you can see that your file bytes never leave the device. Small preferences (such as dark mode and recent file names) are kept only in your browser&apos;s local storage and can be cleared at any time.</p>

      <H>3. Cryptography</H>
      <p>Security features use standard, audited primitives provided by the browser&apos;s Web Crypto API: AES-256-GCM for encryption, PBKDF2 for password-based key derivation, ECDSA on the P-256 curve for e-signatures, and SHA-256 for integrity hashing. Blockchain notarization uses the open OpenTimestamps standard, where only a SHA-256 hash — never the document — is anchored.</p>

      <H>4. Application &amp; transport security</H>
      <p>The site is served exclusively over HTTPS with HSTS (preloaded). It ships a strict Content-Security-Policy, sets X-Frame-Options: DENY and frame-ancestors &apos;none&apos; (clickjacking protection), X-Content-Type-Options: nosniff, a restrictive Permissions-Policy, and object-src &apos;none&apos;. Untrusted HTML (for example, files you convert or AI output) is sanitized before rendering to prevent script injection. There are no third-party trackers or advertising scripts.</p>

      <H>5. Data protection &amp; GDPR</H>
      <p>CommandEditor collects no personal data on any server, has no user accounts, and performs no server-side logging of your files. Because processing is local, the product supports data-minimization and purpose-limitation principles by design. Standard technical request metadata (such as IP address) may be logged by the static host for reliability and security, and is never linked to document content, which never reaches the server.</p>

      <H>6. Healthcare (HIPAA) posture</H>
      <p>Protected health information (PHI) placed into CommandEditor is processed on your device and is never received by CommandEditor. Practically, this means a Business Associate Agreement is not applicable, because CommandEditor is a client-side utility rather than a business associate that handles your data on your behalf. CommandEditor is not itself a certified or covered entity; whether a given workflow is HIPAA-compliant depends on your own environment and controls. We are glad to support security questionnaires with the details on this page.</p>

      <H>7. Enterprise controls (no cloud account required)</H>
      <p>For regulated and enterprise use, CommandEditor provides on-device controls that need no backend: configurable policy presets, a chain-of-custody log, per-recipient document fingerprinting for leak attribution, tamper-evident seals, and a downloadable cryptographic audit trail for signatures. These operate entirely within your browser or the desktop app.</p>

      <H>8. What CommandEditor deliberately does not do</H>
      <p>No telemetry or analytics that report your activity, no advertising, no account requirement, no server-side copies of your files, and no transmission of document content to any third party (including for AI, which runs locally).</p>

      <H>9. Vulnerability disclosure</H>
      <p>We welcome responsible disclosure of security issues. Please email <a href="mailto:hello@commandeditor.com" className="underline" style={{ color: '#2563EB' }}>hello@commandeditor.com</a> with details and steps to reproduce; please avoid publicly disclosing an unpatched issue. A summary security policy is also published in the project repository.</p>

      <H>10. Contact</H>
      <p>Security and compliance questions can be sent to <a href="mailto:hello@commandeditor.com" className="underline" style={{ color: '#2563EB' }}>hello@commandeditor.com</a>.</p>

      <p className="text-sm pt-4" style={{ color: 'var(--ink-muted, #64748b)' }}>This document describes the product&apos;s design and controls for transparency and does not constitute legal or compliance advice or a warranty.</p>
    </LegalPage>
  )
}
