import type { Metadata } from 'next'
import ComparePage from '@/components/ComparePage'

export const metadata: Metadata = {
  title: 'CommandEditor vs iLovePDF — free, private PDF tools compared',
  description: 'iLovePDF uploads your files to its servers and caps the free tier. CommandEditor runs 110+ tools entirely in your browser — no uploads, no limits, no sign-up. See the honest comparison.',
  alternates: { canonical: 'https://commandeditor.com/compare/ilovepdf' },
}

export default function Page() {
  return (
    <ComparePage
      rival="iLovePDF"
      tagline="The biggest name in online PDF tools — but every file you process is uploaded to their servers, and the free tier caps file size and batch counts."
      rows={[
        { feature: 'Files leave your device', ce: 'Never', them: 'Every task' },
        { feature: 'Free tier file-size cap', ce: 'None (∞)', them: 'Yes (varies by tool)' },
        { feature: 'Sign-up required', ce: false, them: 'For unlimited use' },
        { feature: 'Ads on free tier', ce: false, them: true },
        { feature: 'Price for full access', ce: 'Free forever', them: '~$6.61/month' },
        { feature: 'Voice commands', ce: '60+ commands + on-device Whisper', them: false },
        { feature: 'On-device AI assistant', ce: true, them: false },
        { feature: 'Works fully offline (PWA)', ce: true, them: false },
        { feature: 'Bates numbering / legal tools', ce: true, them: false },
        { feature: 'Qualified eIDAS signatures', ce: 'TSP-ready export', them: true },
        { feature: 'Plugin SDK / marketplace', ce: true, them: false },
        { feature: 'Mobile apps', ce: 'Installable PWA', them: true },
      ]}
      verdict="If your documents are confidential — contracts, medical records, client files — the structural difference matters: iLovePDF's architecture requires uploading them; CommandEditor's makes uploading impossible. iLovePDF retains an edge in brand recognition, native mobile apps, and fully qualified eIDAS signatures out of the box; CommandEditor closes the legal gap with TSP-ready signature packages and beats it everywhere else, free."
    />
  )
}
