import type { Metadata } from 'next'
import ComparePage from '@/components/ComparePage'

export const metadata: Metadata = {
  title: 'CommandEditor vs Smallpdf — the free-tier reality check',
  description: 'Smallpdf limits free users to a couple of tasks per day and uploads files. CommandEditor offers 110+ private in-browser tools with no daily limits, no account, and offline support.',
  alternates: { canonical: 'https://www.commandeditor.com/compare/smallpdf' },
}

export default function Page() {
  return (
    <ComparePage
      rival="Smallpdf"
      tagline="A polished interface wrapped around a hard paywall: the free tier is effectively a two-tasks-per-day trial, and every file is uploaded for processing."
      rows={[
        { feature: 'Daily free usage', ce: 'Unlimited', them: '~2 tasks/day' },
        { feature: 'Files leave your device', ce: 'Never', them: 'Every task' },
        { feature: 'Account wall', ce: 'None', them: 'Yes, for repeat use' },
        { feature: 'Pro price', ce: 'Free forever', them: '~$9–12/month' },
        { feature: 'Tool count', ce: '110+', them: '~20' },
        { feature: 'Offline / PWA', ce: true, them: false },
        { feature: 'Voice + typed commands', ce: true, them: false },
        { feature: 'On-device AI (summary, translate, Q&A)', ce: true, them: 'Cloud AI (paid)' },
        { feature: 'Chain-of-custody / forensic tools', ce: true, them: false },
        { feature: 'Batch automation + watch folder', ce: true, them: 'Limited (paid)' },
        { feature: 'UI polish', ce: 'Very good', them: 'Excellent' },
      ]}
      verdict="Smallpdf's design is genuinely lovely — but you are paying $100+/year for server round-trips your browser can do locally. CommandEditor matches the core tools, adds 60+ more (including categories Smallpdf doesn't have at all), never touches your files, and costs nothing. Smallpdf wins on brand polish alone."
    />
  )
}
