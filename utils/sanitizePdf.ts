// utils/sanitizePdf.ts — Stage 4 gap-filler: Sanitize Document
//
// One-click strip of hidden data — the privacy counterpart to redaction:
// redaction hides VISIBLE content; sanitization removes what you can't see:
// metadata, XMP streams, JavaScript, auto-run actions, embedded files,
// XFA form data, page thumbnails, and (optionally) comments/annotations.

import { pdfBlob } from './blob'

export interface SanitizeOptions {
  metadata?: boolean      // default true — title/author/creator/producer/dates + XMP
  javascript?: boolean    // default true — /JavaScript name tree + OpenAction + AA
  embeddedFiles?: boolean // default true — /EmbeddedFiles name tree
  annotations?: boolean   // default true — comments, links stay (links are Nav, not Annots? links ARE annots — see below)
  formData?: boolean      // default true — XFA datasets inside AcroForm
  thumbnails?: boolean    // default true — embedded page thumbnail images
}

export interface SanitizeResult { blob: Blob; removed: string[] }

export async function sanitizePDF(file: File, opts: SanitizeOptions = {}): Promise<SanitizeResult> {
  const { PDFDocument, PDFName, PDFDict, PDFArray } = await import('pdf-lib')
  const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true } as any)
  const removed: string[] = []
  const o = { metadata: true, javascript: true, embeddedFiles: true, annotations: true, formData: true, thumbnails: true, ...opts }
  const catalog: any = doc.catalog

  // ── Metadata (Info dict + XMP stream) ──
  if (o.metadata) {
    const had = [doc.getTitle(), doc.getAuthor(), doc.getSubject(), doc.getCreator(), doc.getProducer()].some(v => v && v.length > 0)
    doc.setTitle(''); doc.setAuthor(''); doc.setSubject(''); doc.setKeywords([])
    doc.setCreator(''); doc.setProducer('')
    try { doc.setCreationDate(new Date(0)); doc.setModificationDate(new Date(0)) } catch {}
    if (catalog.has(PDFName.of('Metadata'))) { catalog.delete(PDFName.of('Metadata')); removed.push('XMP metadata stream') }
    if (had) removed.push('Document metadata (title, author, creator, producer, keywords)')
  }

  // ── JavaScript & auto-run actions ──
  if (o.javascript) {
    const names = catalog.lookup(PDFName.of('Names'))
    if (names instanceof PDFDict && names.has(PDFName.of('JavaScript'))) {
      names.delete(PDFName.of('JavaScript')); removed.push('Embedded JavaScript')
    }
    if (catalog.has(PDFName.of('OpenAction'))) { catalog.delete(PDFName.of('OpenAction')); removed.push('Auto-run action (OpenAction)') }
    if (catalog.has(PDFName.of('AA'))) { catalog.delete(PDFName.of('AA')); removed.push('Catalog auto-actions (AA)') }
    let pageAA = 0
    for (const page of doc.getPages()) {
      const node: any = page.node
      if (node.has?.(PDFName.of('AA'))) { node.delete(PDFName.of('AA')); pageAA++ }
    }
    if (pageAA > 0) removed.push(`Page auto-actions on ${pageAA} page${pageAA > 1 ? 's' : ''}`)
  }

  // ── Embedded files ──
  if (o.embeddedFiles) {
    const names = catalog.lookup(PDFName.of('Names'))
    if (names instanceof PDFDict && names.has(PDFName.of('EmbeddedFiles'))) {
      names.delete(PDFName.of('EmbeddedFiles')); removed.push('Embedded file attachments')
    }
  }

  // ── Annotations (comments, highlights — links are annots too; keep links
  //    by filtering rather than blanket-deleting the Annots array) ──
  if (o.annotations) {
    let count = 0
    for (const page of doc.getPages()) {
      const node: any = page.node
      const annots = node.lookup?.(PDFName.of('Annots'))
      if (!(annots instanceof PDFArray)) continue
      const keep: any[] = []
      for (let i = 0; i < annots.size(); i++) {
        const ref = annots.get(i)
        // resolve subtype via the document's object context
        let subtype = ''
        try {
          const d: any = (doc as any).context.lookup(ref)
          subtype = d?.get?.(PDFName.of('Subtype'))?.toString?.() ?? ''
        } catch {}
        if (subtype === '/Link') keep.push(ref)
        else count++
      }
      if (count > 0 && keep.length === 0) node.delete(PDFName.of('Annots'))
      else if (keep.length !== annots.size()) {
        const arr = (doc as any).context.obj(keep)
        node.set(PDFName.of('Annots'), arr)
      }
    }
    if (count > 0) removed.push(`${count} comment/markup annotation${count > 1 ? 's' : ''} (links preserved)`)
  }

  // ── XFA form data ──
  if (o.formData) {
    const acro = catalog.lookup(PDFName.of('AcroForm'))
    if (acro instanceof PDFDict && acro.has(PDFName.of('XFA'))) {
      acro.delete(PDFName.of('XFA')); removed.push('XFA form datasets')
    }
  }

  // ── Page thumbnails ──
  if (o.thumbnails) {
    let thumbs = 0
    for (const page of doc.getPages()) {
      const node: any = page.node
      if (node.has?.(PDFName.of('Thumb'))) { node.delete(PDFName.of('Thumb')); thumbs++ }
    }
    if (thumbs > 0) removed.push(`Embedded page thumbnails on ${thumbs} page${thumbs > 1 ? 's' : ''}`)
  }

  const bytes = await doc.save({ useObjectStreams: false })
  if (removed.length === 0) removed.push('Nothing hidden found — document was already clean')
  return { blob: pdfBlob(bytes), removed }
}
