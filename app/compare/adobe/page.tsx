import type { Metadata } from 'next'
import ComparePage from '@/components/ComparePage'

export const metadata: Metadata = {
  title: 'CommandEditor vs Adobe Acrobat Online — free without the sign-in wall',
  description: 'Adobe Acrobat Online requires sign-in and uploads; Acrobat Pro costs $240/year. CommandEditor gives you 80+ PDF tools in-browser with zero uploads and zero cost.',
  alternates: { canonical: 'https://commandeditor.com/compare/adobe' },
}

export default function Page() {
  return (
    <ComparePage
      rival="Adobe Acrobat Online"
      tagline="The original PDF company — with a sign-in gate, server uploads, and the best features locked behind Acrobat Pro at ~$240/year."
      rows={[
        { feature: 'Sign-in required', ce: false, them: true },
        { feature: 'Files leave your device', ce: 'Never', them: 'Every task' },
        { feature: 'Full editing cost', ce: 'Free', them: '~$240/year (Pro)' },
        { feature: 'OCR free', ce: true, them: 'Paid' },
        { feature: 'Tool count (free)', ce: '80+', them: 'Handful (teaser tier)' },
        { feature: 'Offline / PWA', ce: true, them: false },
        { feature: 'Voice commands', ce: true, them: false },
        { feature: 'On-device AI', ce: true, them: 'Cloud AI (paid)' },
        { feature: 'Bates numbering', ce: true, them: 'Pro only' },
        { feature: 'Conversion fidelity (complex docs)', ce: 'Very good', them: 'Best in class' },
        { feature: 'Preflight / print production depth', ce: 'Good', them: 'Industry standard' },
      ]}
      verdict="For prepress houses and complex print production, Acrobat Pro remains the reference — CommandEditor doesn't pretend otherwise. But for the 95% of PDF work that is merging, splitting, signing, redacting, converting and automating, Adobe charges $240/year for what CommandEditor does free, privately, and offline. Keep Acrobat for the print shop; use CommandEditor for everything else."
    />
  )
}
