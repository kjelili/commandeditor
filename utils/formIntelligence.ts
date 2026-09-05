// ─── FORM INTELLIGENCE ─────────────────────────────────────────────────────
// Detects *visual* form structure in flat (non-fillable) PDFs — ruled lines,
// drawn boxes, small checkbox squares, and "____" blanks — then synthesizes
// real AcroForm fields with pdf-lib, and drives CSV mail-merge.
//
// This is the gap every competitor leaves open: they can fill forms that
// already have fields; CommandEditor turns a scanned/flat government form
// into a fillable one, entirely on-device.

export interface DetectedField {
  id: string
  page: number          // 1-based
  type: 'text' | 'checkbox'
  x: number             // PDF points, bottom-left origin (pdf-lib space)
  y: number
  width: number
  height: number
  label: string         // nearest text label, may be ''
  name: string          // editable field name (defaults to label/id)
}

// ── Detection ───────────────────────────────────────────────────────────────

async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  return pdfjs
}

interface TextItem { str: string; x: number; y: number; w: number; h: number }

async function pageTextItems(page: any): Promise<TextItem[]> {
  const tc = await page.getTextContent()
  const out: TextItem[] = []
  for (const it of tc.items as any[]) {
    if (!it.str || !it.str.trim()) continue
    const t = it.transform
    const scale = Math.hypot(t[0], t[1]) || 1
    out.push({ str: it.str, x: t[4], y: t[5], w: (it.width || 0) * scale, h: (it.height || 0) * scale || 10 })
  }
  return out
}

function nearestLabel(rect: { x: number; y: number; w: number; h: number }, items: TextItem[]): string {
  let best = ''
  let bestScore = Infinity
  for (const it of items) {
    // Label candidates: left of the field on roughly the same line, or directly above
    const sameLine = Math.abs(it.y - rect.y) < rect.h + 4
    const left = it.x + it.w <= rect.x + 6 && it.x + it.w > rect.x - 260
    const above = it.x >= rect.x - 8 && it.x < rect.x + rect.w && it.y > rect.y && it.y < rect.y + rect.h + 28
    if (sameLine && left) {
      const d = rect.x - (it.x + it.w)
      if (d < bestScore) { bestScore = d; best = it.str }
    } else if (above) {
      const d = it.y - rect.y + 500
      if (d < bestScore) { bestScore = d; best = it.str }
    }
  }
  return best.replace(/[:_]+$/, '').trim().slice(0, 60)
}

export async function detectFormFields(file: File): Promise<DetectedField[]> {
  // Fast path: if the PDF already has real AcroForm fields, surface those
  // directly (the visual scan below only finds drawn boxes/lines, so it would
  // miss already-fillable PDFs). Falls through to visual detection on any error
  // or when there are no AcroForm fields.
  try {
    const buf = await file.arrayBuffer()
    const { PDFDocument, PDFTextField, PDFCheckBox } = await import('pdf-lib')
    const adoc = await PDFDocument.load(buf, { ignoreEncryption: true })
    const aform = adoc.getForm()
    const apages = adoc.getPages()
    const acro: DetectedField[] = []
    for (const fld of aform.getFields()) {
      const isText = fld instanceof PDFTextField
      const isCheck = fld instanceof PDFCheckBox
      if (!isText && !isCheck) continue
      const widgets: any[] = (fld as any).acroField.getWidgets()
      widgets.forEach((w: any, i: number) => {
        let r: any; try { r = w.getRectangle() } catch { return }
        let pageIdx = 0
        try {
          const pr = w.P ? w.P() : (w.dict && w.dict.get ? w.dict.get((PDFDocument as any).PDFName?.of?.('P')) : null)
          const idx = apages.findIndex((pg: any) => pg.ref === pr)
          if (idx >= 0) pageIdx = idx
        } catch { /* default page 0 */ }
        acro.push({
          id: `acro-${fld.getName()}-${i}`,
          page: pageIdx + 1,
          type: isCheck ? 'checkbox' : 'text',
          x: r.x, y: r.y, width: r.width, height: r.height,
          label: fld.getName(),
          name: fld.getName(),
        })
      })
    }
    if (acro.length > 0) return acro.sort((a, b) => a.page - b.page || b.y - a.y)
  } catch { /* fall through to visual detection */ }

  const pdfjs = await loadPdfJs()
  const OPS = pdfjs.OPS
  const doc = await pdfjs.getDocument({ standardFontDataUrl: '/pdf-standard-fonts/', data: await file.arrayBuffer() }).promise
  const fields: DetectedField[] = []

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const items = await pageTextItems(page)
    const opList = await page.getOperatorList()
    const rects: { x: number; y: number; w: number; h: number }[] = []
    const lines: { x0: number; y0: number; x1: number; y1: number }[] = []

    const fn: number[] = opList.fnArray
    const args: any[] = opList.argsArray
    for (let i = 0; i < fn.length; i++) {
      if (fn[i] === OPS.rectangle) {
        const [x, y, w, h] = args[i]
        if (w > 0 && h > 0) rects.push({ x, y, w, h })
      } else if (fn[i] === OPS.constructPath) {
        const [ops, pts] = args[i]
        let cx = 0, cy = 0
        let pi = 0
        for (const op of ops) {
          if (op === OPS.moveTo) { cx = pts[pi++]; cy = pts[pi++] }
          else if (op === OPS.lineTo) {
            const nx = pts[pi++], ny = pts[pi++]
            if (Math.abs(ny - cy) < 1.5 && Math.abs(nx - cx) > 30) lines.push({ x0: cx, y0: cy, x1: nx, y1: ny })
            cx = nx; cy = ny
          }
          else if (op === OPS.closePath) { /* ignore */ }
          else if (op === OPS.rectangle) {
            const x = pts[pi++], y = pts[pi++], w = pts[pi++], h = pts[pi++]
            if (w > 0 && h > 0) rects.push({ x, y, w, h })
          }
          else if (op === OPS.curveTo) { pi += 6 }
          else if (op === OPS.curveTo2 || op === OPS.curveTo3) { pi += 4 }
          else { pi += 6 } // unknown op — conservative skip
        }
      }
    }

    // Small squares → checkboxes
    for (const r of rects) {
      if (r.w >= 6 && r.w <= 16 && Math.abs(r.w - r.h) < 3) {
        fields.push({
          id: `cb-p${p}-${fields.length}`, page: p, type: 'checkbox',
          x: r.x, y: r.y, width: Math.max(r.w, 10), height: Math.max(r.h, 10),
          label: nearestLabel({ x: r.x + r.w, y: r.y, w: 200, h: r.h }, items) || nearestLabel(r, items),
          name: '',
        })
      } else if (r.w > 40 && r.h >= 10 && r.h <= 40) {
        fields.push({
          id: `tx-p${p}-${fields.length}`, page: p, type: 'text',
          x: r.x, y: r.y, width: r.w, height: r.h,
          label: nearestLabel(r, items), name: '',
        })
      }
    }

    // Ruled lines → text fields sitting on the line
    for (const l of lines) {
      const x = Math.min(l.x0, l.x1), w = Math.abs(l.x1 - l.x0)
      const cand = { id: `ln-p${p}-${fields.length}`, page: p, type: 'text' as const,
        x, y: l.y0 + 1, width: w, height: 14, label: '', name: '' }
      // skip if an equivalent rect/field already covers this line
      const dup = fields.some(f => f.page === p && f.type === 'text' &&
        Math.abs(f.y - cand.y) < 6 && Math.abs(f.x - cand.x) < 12)
      if (!dup) {
        cand.label = nearestLabel({ x: cand.x, y: cand.y, w: cand.width, h: 14 }, items)
        fields.push(cand)
      }
    }

    // "______" blanks inside text runs
    for (const it of items) {
      const m = it.str.match(/_{3,}/)
      if (m) {
        const before = it.str.slice(0, m.index).trim()
        fields.push({
          id: `ul-p${p}-${fields.length}`, page: p, type: 'text',
          x: it.x, y: it.y, width: Math.max(it.w * ((m[0].length) / it.str.length), 60), height: Math.max(it.h, 12),
          label: before.split(/\s{2,}/).pop()?.replace(/[:.]+$/, '') || '', name: '',
        })
      }
    }

    page.cleanup()
  }
  await doc.destroy()

  // De-duplicate overlapping fields (same page, similar rect)
  const kept: DetectedField[] = []
  for (const f of fields) {
    const overlap = kept.some(k => k.page === f.page && k.type === f.type &&
      Math.abs(k.x - f.x) < 8 && Math.abs(k.y - f.y) < 8 &&
      Math.abs(k.width - f.width) < 20)
    if (!overlap) kept.push(f)
  }
  // Default names from labels
  const seen = new Map<string, number>()
  for (const f of kept) {
    let base = (f.label || (f.type === 'checkbox' ? 'checkbox' : 'field'))
      .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field'
    const n = (seen.get(base) || 0) + 1
    seen.set(base, n)
    f.name = n > 1 ? `${base}_${n}` : base
  }
  return kept.sort((a, b) => a.page - b.page || b.y - a.y)
}

// ── Field synthesis ─────────────────────────────────────────────────────────

export async function createFillablePdf(file: File, fields: DetectedField[]): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib')
  const bytes = await file.arrayBuffer()
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const form = doc.getForm()
  const pages = doc.getPages()
  for (const f of fields) {
    const page = pages[f.page - 1]
    if (!page) continue
    try {
      if (f.type === 'checkbox') {
        const cb = form.createCheckBox(f.name)
        cb.addToPage(page, { x: f.x, y: f.y, width: f.width, height: f.height, borderWidth: 0 })
      } else {
        const tf = form.createTextField(f.name)
        tf.addToPage(page, { x: f.x, y: f.y, width: f.width, height: f.height, borderWidth: 0 })
        tf.setFontSize(Math.min(12, Math.max(7, f.height - 4)))
      }
    } catch { /* name clash or degenerate rect — skip */ }
  }
  return doc.save()
}

// ── CSV mail-merge ──────────────────────────────────────────────────────────

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = []
  let cur: string[] = [], cell = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else inQ = false }
      else cell += c
    } else if (c === '"') inQ = true
    else if (c === ',') { cur.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      cur.push(cell); cell = ''
      if (cur.some(v => v !== '')) rows.push(cur)
      cur = []
    } else cell += c
  }
  cur.push(cell)
  if (cur.some(v => v !== '')) rows.push(cur)
  const headers = rows.shift() || []
  return { headers: headers.map(h => h.trim()), rows }
}

export interface MergeResult { fileName: string; bytes: Uint8Array }

export async function csvMailMerge(
  file: File,
  fields: DetectedField[],
  csvText: string,
  mapping: Record<string, string>,   // field.name → csv header ('' = skip)
  nameColumn: string,                // csv header used for output filename, or ''
): Promise<MergeResult[]> {
  const { headers, rows } = parseCsv(csvText)
  const colIndex = (h: string) => headers.indexOf(h)
  const results: MergeResult[] = []

  // Build the fillable base once, then fill per row
  const baseBytes = await createFillablePdf(file, fields)

  const { PDFDocument, PDFCheckBox, PDFTextField } = await import('pdf-lib')
  for (let r = 0; r < rows.length; r++) {
    const doc = await PDFDocument.load(baseBytes, { ignoreEncryption: true })
    const form = doc.getForm()
    for (const f of fields) {
      const col = mapping[f.name]
      if (!col) continue
      const ci = colIndex(col)
      if (ci < 0) continue
      const value = (rows[r][ci] || '').trim()
      try {
        const fld = form.getField(f.name)
        if (fld instanceof PDFCheckBox) {
          if (/^(y|yes|true|1|x|checked)$/i.test(value)) fld.check()
        } else if (fld instanceof PDFTextField) {
          fld.setText(value)
        }
      } catch { /* field may not exist — skip */ }
    }
    const nameCol = nameColumn ? colIndex(nameColumn) : -1
    const base = nameCol >= 0 ? (rows[r][nameCol] || `row-${r + 1}`) : `row-${r + 1}`
    const safe = base.replace(/[^\w.-]+/g, '-').slice(0, 60)
    results.push({ fileName: `${safe}.pdf`, bytes: await doc.save() })
  }
  return results
}

export async function zipResults(results: MergeResult[]): Promise<Blob> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  for (const r of results) zip.file(r.fileName, r.bytes)
  return zip.generateAsync({ type: 'blob' })
}

// ─── Direct value filling (voice-fill writes into this) ────────────────────

export async function fillFormValues(
  file: File,
  fields: DetectedField[],
  values: Record<string, string>,   // field.name → value
): Promise<Uint8Array> {
  const baseBytes = await createFillablePdf(file, fields)
  const { PDFDocument, PDFCheckBox, PDFTextField } = await import('pdf-lib')
  const doc = await PDFDocument.load(baseBytes, { ignoreEncryption: true })
  const form = doc.getForm()
  for (const f of fields) {
    const value = (values[f.name] || '').trim()
    if (!value) continue
    try {
      const fld = form.getField(f.name)
      if (fld instanceof PDFCheckBox) {
        if (/^(y|yes|true|1|x|checked|check)$/i.test(value)) fld.check()
      } else if (fld instanceof PDFTextField) {
        fld.setText(value)
      }
    } catch { /* skip */ }
  }
  return doc.save()
}
