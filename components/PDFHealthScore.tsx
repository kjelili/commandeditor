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
  files?: File[] // when multiple PDFs are loaded, analysis aggregates across them
  onSuggestTools: (tools: string[]) => void
}

export default function PDFHealthScore({ file, files, onSuggestTools }: Props) {
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
          pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

        // Analyse every loaded PDF; totals aggregate across all of them.
        const targets = (files && files.length > 0 ? files : [file])
          .filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
        if (targets.length === 0) { if (!cancelled) setData(null); return }

        let totalPages = 0, totalSize = 0, hasText = false, imgCount = 0
        let printSizeMM = ''
        let firstNumPages = 0
        for (let fi = 0; fi < targets.length; fi++) {
          const t = targets[fi]
          totalSize += t.size
          let pdf: any
          try { pdf = await pdfjsLib.getDocument({ standardFontDataUrl: '/pdf-standard-fonts/', data: await t.arrayBuffer() }).promise }
          catch { continue }
          if (cancelled) return
          totalPages += pdf.numPages
          if (fi === 0) {
            firstNumPages = pdf.numPages
            const page1 = await pdf.getPage(1)
            const vp = page1.getViewport({ scale: 1 })
            printSizeMM = `${(vp.width * 25.4 / 72).toFixed(0)}×${(vp.height * 25.4 / 72).toFixed(0)} mm`
          }
          for (let i = 1; i <= Math.min(pdf.numPages, 5); i++) {
            const pg = await pdf.getPage(i)
            const tc = await pg.getTextContent()
            if ((tc.items as any[]).some((it: any) => it.str?.trim())) hasText = true
            const ops = await pg.getOperatorList()
            imgCount += ops.fnArray.filter((f: number) => f === 85 || f === 83).length
          }
          if (cancelled) return
        }

        const h: HealthData = {
          pages: totalPages,
          sizeKB: Math.round(totalSize / 1024),
          hasTextLayer: hasText,
          isEncrypted: false,
          imageCount: imgCount,
          isLinearized: false,
          printSizeMM: printSizeMM || '—',
        }
        setData(h)

        // Smart suggestions
        const suggestions: string[] = []
        if (!hasText) suggestions.push('ocr')
        if (h.sizeKB > 3 * 1024) suggestions.push('compress')
        if (h.pages > 10) suggestions.push('split')
        onSuggestTools(suggestions.slice(0, 3))
      } catch {
        if (!cancelled) setData(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, (files || []).map(f => f.name + ':' + f.size).join('|')])

  if (loading) return (
    <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs animate-pulse"
         style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="w-3 h-3 rounded-full border border-t-transparent animate-spin"
           style={{ borderColor: 'var(--border-strong)', borderTopColor: 'var(--blue-vivid)' }} />
      <span style={{ color: 'var(--ink-muted)' }}>Analysing file…</span>
    </div>
  )

  if (!data) return null

  const pdfCount = (files || []).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')).length
  const items = [
    ...(pdfCount > 1 ? [{ label: 'Files', value: pdfCount, icon: '🗂️' }] : []),
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
