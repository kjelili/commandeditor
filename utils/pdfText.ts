// ─── PDF Text Layer Extraction (Feature 1: Search & Text Selection) ────────
// Uses pdfjs-dist to extract text items with their positions on each page.

export interface TextItem {
  text: string
  x: number      // 0-1 fraction of page width
  y: number      // 0-1 fraction of page height  
  width: number  // 0-1 fraction
  height: number // 0-1 fraction
  pageIndex: number
}

export interface PageTextLayer {
  pageIndex: number
  items: TextItem[]
}

/** 
 * Extract text with positions from all pages of a PDF.
 * Returns an array of PageTextLayer, one per page.
 */
export async function extractTextLayers(
  file: File,
  onProgress?: (page: number, total: number) => void
): Promise<PageTextLayer[]> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs'

  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
  const layers: PageTextLayer[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 1 })
    const textContent = await page.getTextContent()
    const items: TextItem[] = []

    for (const item of textContent.items) {
      const ti = item as any
      if (!ti.str || !ti.transform) continue
      // pdfjs transform: [scaleX, skewX, skewY, scaleY, translateX, translateY]
      const [, , , scaleY, tx, ty] = ti.transform
      const itemHeight = Math.abs(scaleY)
      const itemWidth = ti.width || 0
      items.push({
        text: ti.str,
        x: tx / viewport.width,
        y: 1 - (ty + itemHeight) / viewport.height,
        width: itemWidth / viewport.width,
        height: itemHeight / viewport.height,
        pageIndex: i - 1,
      })
    }

    layers.push({ pageIndex: i - 1, items })
    onProgress?.(i, pdf.numPages)
  }

  return layers
}

/** Search text layers for a query string. Returns matching items. */
export function searchTextLayers(
  layers: PageTextLayer[],
  query: string
): TextItem[] {
  if (!query.trim()) return []
  const q = query.toLowerCase()
  const results: TextItem[] = []
  for (const layer of layers) {
    for (const item of layer.items) {
      if (item.text.toLowerCase().includes(q)) {
        results.push(item)
      }
    }
  }
  return results
}
