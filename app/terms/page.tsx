import type { Metadata } from 'next'
import LegalPage from '@/components/LegalPage'

export const metadata: Metadata = {
  title: 'Terms of Service — CommandEditor',
  description: 'The terms governing your use of CommandEditor: a free, browser-based, zero-upload document toolkit provided as-is.',
}

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold pt-3" style={{ color: 'var(--ink, #0f172a)' }}>{children}</h2>
}

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="16 August 2026"
      downloadHref="/terms-of-service.txt" downloadName="CommandEditor-Terms-of-Service.txt">
      <p>Welcome to CommandEditor. By using the CommandEditor website and tools (the &quot;Service&quot;), you agree to these Terms. If you do not agree, please do not use the Service.</p>
      <H>1. The Service</H>
      <p>CommandEditor is a free, browser-based toolkit for viewing and editing PDF and document files. All document processing runs locally in your browser; CommandEditor does not upload or store your files.</p>
      <H>2. No warranty</H>
      <p>The Service is provided &quot;as is&quot; and &quot;as available&quot;, without warranties of any kind, whether express or implied, including but not limited to merchantability, fitness for a particular purpose, and non-infringement. We do not warrant that the Service will be uninterrupted, error-free, or that any operation will produce a particular result. You are responsible for keeping your own backups of important files.</p>
      <H>3. Your responsibilities</H>
      <p>You are solely responsible for the files you process and for ensuring you have the right to process them. You agree not to use the Service to violate any law or the rights of others, including intellectual-property, privacy, or data-protection rights.</p>
      <H>4. Not legal, financial or professional advice</H>
      <p>Some tools help extract or analyse content — for example citation, contract-clause, invoice, redaction and e-signature features. These are automated aids only. Their output may be incomplete or inaccurate and does not constitute legal, financial, or other professional advice. Do not rely on them as a substitute for a qualified professional. In particular, automated redaction and PII detection may miss sensitive content; always verify results before sharing a document.</p>
      <H>5. Electronic signatures</H>
      <p>CommandEditor&apos;s e-signature and certificate features are provided to help you sign documents. Whether a given electronic signature is legally binding depends on your jurisdiction and circumstances, which are your responsibility to determine.</p>
      <H>6. Limitation of liability</H>
      <p>To the maximum extent permitted by law, CommandEditor and its maintainers shall not be liable for any indirect, incidental, special, consequential or punitive damages, or for any loss of data, profits, or files, arising out of or related to your use of or inability to use the Service.</p>
      <H>7. Open source</H>
      <p>CommandEditor&apos;s source code is publicly available at <a href="https://github.com/kjelili/commandeditor" className="underline" style={{ color: '#2563EB' }}>github.com/kjelili/commandeditor</a> and is provided under the licence stated in that repository. These Terms govern your use of the hosted Service; the repository licence governs the source code.</p>
      <H>8. Changes to the Service and Terms</H>
      <p>We may modify or discontinue the Service, or update these Terms, at any time. Continued use after changes take effect constitutes acceptance of the updated Terms, indicated by the &quot;Last updated&quot; date above.</p>
      <H>9. Contact</H>
      <p>Questions about these Terms can be sent to us at <a href="mailto:hello@commandeditor.com" className="underline" style={{ color: '#2563EB' }}>hello@commandeditor.com</a>.</p>
      <p className="text-sm pt-4" style={{ color: 'var(--ink-muted, #64748b)' }}>This document is provided for transparency and does not constitute legal advice.</p>
    </LegalPage>
  )
}
