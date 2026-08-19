import { toWinAnsi } from '@/utils/pdfTextSafe'

// ─── ON-DEVICE AI ALT-TEXT ─────────────────────────────────────────────────
// Accessibility gap: most PDFs have images with no alternative text, making
// them unreadable to screen readers. This extracts embedded images, captions
// each one with a vision model running entirely in the browser
// (Xenova/vit-gpt2-image-captioning via transformers.js), lets the user edit
// the suggestions, then stamps the captions back into the PDF as invisible
// (but extractable / screen-reader-readable) text on the same page.

export interface PdfImage {
  id: string
  page: number
  objId: string
  width: number
  height: number
  dataUrl: string      // rendered to PNG data URL for the captioning model
  caption: string      // filled by the model, editable by the user
}

export async function extractImages(file: File, maxImages = 24): Promise<PdfImage[]> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  const doc = await pdfjs.getDocument({ standardFontDataUrl: '/pdf-standard-fonts/', data: await file.arrayBuffer() }).promise
  const images: PdfImage[] = []

  for (let p = 1; p <= doc.numPages && images.length < maxImages; p++) {
    const page = await doc.getPage(p)
    const opList = await page.getOperatorList()
    const OPS = pdfjs.OPS
    for (let i = 0; i < opList.fnArray.length && images.length < maxImages; i++) {
      if (opList.fnArray[i] !== OPS.paintImageXObject) continue
      const objId = opList.argsArray[i][0]
      try {
        const img: any = await new Promise((resolve, reject) => {
          try { page.objs.get(objId, resolve) } catch (e) { reject(e) }
          setTimeout(() => reject(new Error('timeout')), 8000)
        })
        if (!img || !img.data || !img.width || !img.height) continue
        if (img.width < 32 || img.height < 32) continue // skip icons/bullets

        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')!
        let rgba: Uint8ClampedArray
        if (img.data.length === img.width * img.height * 4) {
          rgba = new Uint8ClampedArray(img.data)
        } else if (img.data.length === img.width * img.height * 3) {
          rgba = new Uint8ClampedArray(img.width * img.height * 4)
          for (let s = 0, d = 0; s < img.data.length; s += 3, d += 4) {
            rgba[d] = img.data[s]; rgba[d + 1] = img.data[s + 1]; rgba[d + 2] = img.data[s + 2]; rgba[d + 3] = 255
          }
        } else continue // 1bpp masks and exotic formats — skip
        ctx.putImageData(new ImageData(rgba as unknown as Uint8ClampedArray<ArrayBuffer>, img.width, img.height), 0, 0)
        images.push({
          id: `img-p${p}-${images.length}`, page: p, objId,
          width: img.width, height: img.height,
          dataUrl: canvas.toDataURL('image/png'),
          caption: '',
        })
      } catch { /* unresolvable object — skip */ }
    }
    page.cleanup()
  }
  await doc.destroy()
  return images
}

let captionerPromise: Promise<any> | null = null

async function getCaptioner() {
  if (!captionerPromise) {
    captionerPromise = (async () => {
      const { pipeline, env } = await import('@xenova/transformers')
      env.allowLocalModels = false
      env.useBrowserCache = true
      try {
        ;(env as any).backends.onnx.wasm.wasmPaths =
          'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/'
      } catch {}
      return pipeline('image-to-text', 'Xenova/vit-gpt2-image-captioning')
    })()
  }
  return captionerPromise
}

export async function captionImages(
  images: PdfImage[],
  onProgress?: (done: number, total: number) => void,
): Promise<PdfImage[]> {
  const captioner = await getCaptioner()
  const out = [...images]
  for (let i = 0; i < out.length; i++) {
    onProgress?.(i, out.length)
    try {
      const res = await captioner(out[i].dataUrl)
      const text = Array.isArray(res) ? res[0]?.generated_text : (res as any)?.generated_text
      out[i] = { ...out[i], caption: (text || '').trim() }
    } catch { out[i] = { ...out[i], caption: '' } }
  }
  onProgress?.(out.length, out.length)
  return out
}

// Stamp captions as invisible text (screen readers and text extraction see
// it; sighted readers' layout is untouched). Plus a human-readable report.
export async function stampAltText(file: File, images: PdfImage[]): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true })
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const pages = doc.getPages()
  const byPage = new Map<number, PdfImage[]>()
  for (const img of images) {
    if (!img.caption.trim()) continue
    byPage.set(img.page, [...(byPage.get(img.page) || []), img])
  }
  for (const [p, imgs] of byPage) {
    const page = pages[p - 1]
    if (!page) continue
    let y = page.getHeight() - 12
    for (const img of imgs) {
      page.drawText(toWinAnsi(`[Image: ${img.caption.slice(0, 200)}]`), {
        x: 8, y, size: 6, font,
        color: rgb(1, 1, 1), opacity: 0, // invisible to the eye, present to readers
      })
      y -= 8
    }
  }
  // Mark the document as carrying accessibility content
  try { doc.setTitle(doc.getTitle() || file.name); doc.setSubject('Alt-text enriched (on-device AI)') } catch {}
  return doc.save()
}

export function altTextReportMarkdown(docName: string, images: PdfImage[]): string {
  return [
    `# Alt-text report — ${docName}`,
    ``,
    `Generated on-device. Review each caption before publishing.`,
    ``,
    ...images.map(img => `- **Page ${img.page}** (${img.width}×${img.height}px): ${img.caption || '_(no caption generated)_'}`),
  ].join('\n')
}
