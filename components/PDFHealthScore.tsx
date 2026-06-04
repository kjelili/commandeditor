'use client'

import { useEffect, useState } from 'react'

interface HealthData {
  pages: number
  sizeKB: number
  hasTextLayer: boolean
  isEncrypted: boolean
  imageCount: number
  isLinearized: boolean
  printSizeMM: string
}

interface Props {
  file: File
  onSuggestTools: (tools: string[]) => void
}

export default function PDFHealthScore({ file, onSuggestTools }: Props) {
  const [data, setData] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setData(null)
    ;(async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist')
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc)
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs'
        const buf = await file.arrayBuffer()
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise
        if (cancelled) return

        const page1 = await pdf.getPage(1)
        const vp = page1.getViewport({ scale: 1 })
        const widthMM = (vp.width * 25.4 / 72).toFixed(0)
        const heightMM = (vp.height * 25.4 / 72).toFixed(0)

        let hasText = false, imgCount = 0
        for (let i = 1; i <= Math.min(pdf.numPages, 5); i++) {
          const p = await pdf.getPage(i)
          const tc = await p.getTextContent()
          if ((tc.items as any[]).some((it: any) => it.str?.trim())) hasText = true
          const ops = await p.getOperatorList()
          imgCount += ops.fnArray.filter((f: number) => f === 85 || f === 83).length
        }
        if (cancelled) return

        const h: HealthData = {
          pages: pdf.numPages,
          sizeKB: Math.round(file.size / 1024),
          hasTextLayer: hasText,
          isEncrypted: false,
          imageCount: imgCount,
          isLinearized: false,
          printSizeMM: `${widthMM}×${heightMM} mm`,
        }
        setData(h)

        // Smart suggestions
        const suggestions: string[] = []
        if (!hasText) suggestions.push('ocr')
        if (file.size > 3 * 1024 * 1024) suggestions.push('compress')
        if (pdf.numPages > 10) suggestions.push('split')
        onSuggestTools(suggestions.slice(0, 3))
      } catch {
        if (!cancelled) setData(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [file])

  if (loading) return (
    <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs animate-pulse"
         style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="w-3 h-3 rounded-full border border-t-transparent animate-spin"
           style={{ borderColor: 'var(--border-strong)', borderTopColor: 'var(--blue-vivid)' }} />
      <span style={{ color: 'var(--ink-muted)' }}>Analysing file…</span>
    </div>
  )

  if (!data) return null

  const items = [
    { label: 'Pages', value: data.pages, icon: '📄' },
    { label: 'Size', value: `${data.sizeKB > 1024 ? (data.sizeKB/1024).toFixed(1)+' MB' : data.sizeKB+' KB'}`, icon: '📦' },
    { label: 'Text layer', value: data.hasTextLayer ? 'Yes ✓' : 'No — try OCR', icon: '📝', alert: !data.hasTextLayer },
    { label: 'Images', value: data.imageCount, icon: '🖼' },
    { label: 'Print size', value: data.printSizeMM, icon: '📐' },
  ]

  return (
    <div className="rounded-xl px-4 py-3 animate-fade-up"
         style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--ink-muted)' }}>File Analysis</span>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {items.map(it => (
          <div key={it.label} className="flex items-center gap-1.5">
            <span className="text-xs">{it.icon}</span>
            <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>{it.label}:</span>
            <span className="text-xs font-semibold" style={{ color: it.alert ? 'var(--accent)' : 'var(--ink)' }}>{String(it.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
