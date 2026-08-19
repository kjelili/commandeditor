// ─── MULTI-DOCUMENT ON-DEVICE RAG ──────────────────────────────────────────
// Ask one question across a whole bundle of PDFs — case files, a semester of
// lecture notes, a tender with 12 annexes — and get an answer with per-source
// citations (document + page). Runs fully on-device: embeddings via
// transformers.js (Xenova/all-MiniLM-L6-v2, ~20 MB, cached by the browser),
// retrieval by cosine similarity, answers composed extractively so nothing
// hallucinates beyond the retrieved passages.

export interface CorpusChunk {
  id: string
  docName: string
  page: number        // 1-based
  text: string
  embedding?: number[]
}

export interface CorpusHit {
  chunk: CorpusChunk
  score: number
}

export interface MultiDocAnswer {
  answer: string
  citations: Array<{ docName: string; page: number; score: number }>
  confidence: number
}

const CHUNK_WORDS = 120
const CHUNK_STRIDE = 90
const TOP_K = 6

let embedderPromise: Promise<any> | null = null

async function getEmbedder() {
  if (!embedderPromise) {
    embedderPromise = (async () => {
      const { pipeline, env } = await import('@xenova/transformers')
      env.allowLocalModels = false
      env.useBrowserCache = true
      try {
        ;(env as any).backends.onnx.wasm.wasmPaths =
          'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/'
      } catch {}
      return pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
    })()
  }
  return embedderPromise
}

function chunkPageText(text: string): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ')
  if (words.length <= CHUNK_WORDS) return words.length > 20 ? [words.join(' ')] : []
  const out: string[] = []
  for (let i = 0; i < words.length; i += CHUNK_STRIDE) {
    out.push(words.slice(i, i + CHUNK_WORDS).join(' '))
    if (i + CHUNK_WORDS >= words.length) break
  }
  return out
}

export class MultiDocCorpus {
  chunks: CorpusChunk[] = []
  docs: string[] = []

  async addDocuments(
    files: File[],
    onProgress?: (msg: string) => void,
  ): Promise<number> {
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
    const embedder = await getEmbedder()
    let added = 0

    for (const file of files) {
      if (this.docs.includes(file.name)) continue
      onProgress?.(`Indexing ${file.name}…`)
      const doc = await pdfjs.getDocument({ standardFontDataUrl: '/pdf-standard-fonts/', data: await file.arrayBuffer() }).promise
      const docChunks: CorpusChunk[] = []
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p)
        const tc = await page.getTextContent()
        const text = tc.items.map((it: any) => it.str).join(' ')
        for (const piece of chunkPageText(text)) {
          docChunks.push({
            id: `${file.name}:p${p}:${docChunks.length}`,
            docName: file.name, page: p, text: piece,
          })
        }
        page.cleanup()
      }
      await doc.destroy()

      for (let i = 0; i < docChunks.length; i++) {
        if (i % 20 === 0) onProgress?.(`Embedding ${file.name} (${i}/${docChunks.length})…`)
        const out = await embedder(docChunks[i].text, { pooling: 'mean', normalize: true })
        docChunks[i].embedding = Array.from(out.data as Float32Array)
      }
      this.chunks.push(...docChunks)
      this.docs.push(file.name)
      added++
    }
    return added
  }

  private cosine(a: number[], b: number[]): number {
    let dot = 0, na = 0, nb = 0
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
    return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
  }

  async retrieve(question: string, k = TOP_K): Promise<CorpusHit[]> {
    const embedder = await getEmbedder()
    const out = await embedder(question, { pooling: 'mean', normalize: true })
    const qv = Array.from(out.data as Float32Array) as number[]
    return this.chunks
      .filter(c => c.embedding)
      .map(c => ({ chunk: c, score: this.cosine(qv, c.embedding!) }))
      .sort((x, y) => y.score - x.score)
      .slice(0, k)
  }

  async query(question: string): Promise<MultiDocAnswer> {
    if (!this.chunks.length) return { answer: 'No documents indexed yet.', citations: [], confidence: 0 }
    const hits = await this.retrieve(question)
    if (!hits.length || hits[0].score < 0.2) {
      return { answer: "I couldn't find anything relevant across the indexed documents.", citations: [], confidence: hits[0]?.score || 0 }
    }

    // Extractive answer: best-matching sentences from the top chunks,
    // ranked by question-term overlap plus embedding score.
    const qTerms = question.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 3)
    const scoredSentences: Array<{ s: string; score: number; doc: string; page: number }> = []
    for (const h of hits) {
      for (const s of h.chunk.text.split(/(?<=[.!?])\s+/)) {
        const lower = s.toLowerCase()
        const overlap = qTerms.filter(t => lower.includes(t)).length
        scoredSentences.push({ s, score: h.score + overlap * 0.05, doc: h.chunk.docName, page: h.chunk.page })
      }
    }
    scoredSentences.sort((a, b) => b.score - a.score)
    const picked = scoredSentences.slice(0, 4)

    const answer = picked.map(p => p.s).join(' ')
    const citations = Array.from(
      new Map(hits.slice(0, 5).map(h => [`${h.chunk.docName}:${h.chunk.page}`,
        { docName: h.chunk.docName, page: h.chunk.page, score: h.score }])).values()
    )
    return { answer, citations, confidence: hits[0].score }
  }
}
