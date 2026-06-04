// documentIntelligence.ts — client-side PDF analysis utilities
// Covers: readability, PII scan, diff, tone, language detect, citations, timeline, font inspect

// ─── Readability Scorer ───────────────────────────────────────────────────────
export interface ReadabilityResult {
  score: number          // Flesch Reading Ease 0-100
  grade: string          // Grade level name
  wordCount: number
  sentenceCount: number
  avgWordsPerSentence: number
  avgSyllablesPerWord: number
  readingTimeMin: number
  topWords: Array<{ word: string; count: number }>
  suggestion: string
}

export function computeReadability(text: string): ReadabilityResult {
  const words = text.match(/\b[a-zA-Z]+\b/g) || []
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 2)
  const wordCount = words.length
  const sentenceCount = Math.max(1, sentences.length)

  const countSyllables = (w: string) => {
    w = w.toLowerCase()
    if (w.length <= 3) return 1
    const syl = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '')
    const m = syl.match(/[aeiouy]{1,2}/g)
    return Math.max(1, m ? m.length : 1)
  }
  const totalSyl = words.reduce((s, w) => s + countSyllables(w), 0)
  const avgSPW = wordCount / sentenceCount
  const avgSylPW = totalSyl / Math.max(1, wordCount)
  const flesch = 206.835 - 1.015 * avgSPW - 84.6 * avgSylPW
  const score = Math.max(0, Math.min(100, Math.round(flesch)))

  const grade = score >= 90 ? '5th grade' : score >= 80 ? '6th grade' : score >= 70 ? '7th grade'
    : score >= 60 ? '8th-9th grade' : score >= 50 ? '10th-12th grade' : score >= 30 ? 'College'
    : 'Post-graduate'

  const suggestion = score >= 70 ? 'Highly readable — suitable for general audiences.'
    : score >= 50 ? 'Moderately complex — suitable for educated readers.'
    : 'Difficult — consider simplifying sentence structure and vocabulary.'

  // Top words (exclude stopwords)
  const stop = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','is','are','was','were','be','been','this','that','it','as','by','from','they','we','you','he','she','has','have','had','not','all'])
  const freq: Record<string, number> = {}
  words.forEach(w => { const lw = w.toLowerCase(); if (!stop.has(lw) && lw.length > 2) freq[lw] = (freq[lw] || 0) + 1 })
  const topWords = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([word,count])=>({word,count}))

  return {
    score, grade, wordCount, sentenceCount,
    avgWordsPerSentence: Math.round(avgSPW * 10) / 10,
    avgSyllablesPerWord: Math.round(avgSylPW * 100) / 100,
    readingTimeMin: Math.ceil(wordCount / 200),
    topWords, suggestion
  }
}

// ─── PII / Sensitive Data Scanner ────────────────────────────────────────────
export interface PIIMatch {
  type: string
  value: string
  page: number
  context: string
  severity: 'high' | 'medium' | 'low'
}

export function scanForPII(textByPage: Array<{ page: number; text: string }>): PIIMatch[] {
  const patterns: Array<{ type: string; re: RegExp; severity: PIIMatch['severity'] }> = [
    { type: 'Credit Card',      re: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12})\b/g, severity: 'high' },
    { type: 'Social Security',  re: /\b(?!000|666|9\d{2})\d{3}[-\s]?(?!00)\d{2}[-\s]?(?!0000)\d{4}\b/g, severity: 'high' },
    { type: 'IBAN',             re: /\b[A-Z]{2}\d{2}[A-Z0-9]{4,30}\b/g, severity: 'high' },
    { type: 'Email',            re: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, severity: 'medium' },
    { type: 'UK NI Number',     re: /\b[A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/gi, severity: 'high' },
    { type: 'Phone (UK)',       re: /\b(?:0|\+44)\s?(?:\d\s?){9,10}\b/g, severity: 'medium' },
    { type: 'Phone (US)',       re: /\b(?:\+1\s?)?(?:\(\d{3}\)|\d{3})[\s.\-]?\d{3}[\s.\-]?\d{4}\b/g, severity: 'medium' },
    { type: 'Passport',        re: /\b[A-Z]{1,2}\d{6,9}\b/g, severity: 'medium' },
    { type: 'UK Postcode',     re: /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/gi, severity: 'low' },
    { type: 'Date of Birth',   re: /\b(?:dob|date of birth|born)[:\s]+\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/gi, severity: 'high' },
    { type: 'IPv4 Address',    re: /\b(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g, severity: 'low' },
  ]
  const results: PIIMatch[] = []
  for (const { page, text } of textByPage) {
    for (const { type, re, severity } of patterns) {
      let m; re.lastIndex = 0
      while ((m = re.exec(text)) !== null) {
        const start = Math.max(0, m.index - 30)
        const context = '…' + text.slice(start, m.index + m[0].length + 30).replace(/\n/g, ' ') + '…'
        results.push({ type, value: m[0], page, context, severity })
      }
    }
  }
  return results
}

// ─── PDF Diff (compare text layers) ──────────────────────────────────────────
export interface DiffLine {
  type: 'equal' | 'added' | 'removed' | 'changed'
  pageA?: number
  pageB?: number
  text: string
}

export function diffPDFTexts(
  pagesA: Array<{ page: number; text: string }>,
  pagesB: Array<{ page: number; text: string }>
): DiffLine[] {
  const result: DiffLine[] = []
  const maxPages = Math.max(pagesA.length, pagesB.length)
  for (let i = 0; i < maxPages; i++) {
    const a = pagesA[i]?.text ?? ''
    const b = pagesB[i]?.text ?? ''
    if (!a && b) {
      result.push({ type: 'added', pageB: i+1, text: `[Page ${i+1} added] ${b.slice(0,200)}` })
    } else if (a && !b) {
      result.push({ type: 'removed', pageA: i+1, text: `[Page ${i+1} removed] ${a.slice(0,200)}` })
    } else {
      const aLines = a.split('\n').filter(Boolean)
      const bLines = b.split('\n').filter(Boolean)
      const allLines = new Set([...aLines, ...bLines])
      for (const line of allLines) {
        const inA = aLines.includes(line)
        const inB = bLines.includes(line)
        if (inA && inB) result.push({ type: 'equal', pageA: i+1, pageB: i+1, text: line })
        else if (inA) result.push({ type: 'removed', pageA: i+1, text: line })
        else result.push({ type: 'added', pageB: i+1, text: line })
      }
    }
  }
  return result
}

// ─── Document Tone Analyser ───────────────────────────────────────────────────
export interface ToneResult {
  overall: 'positive' | 'negative' | 'neutral' | 'formal' | 'aggressive'
  sentiment: number   // -1 to +1
  formality: number   // 0 to 1
  perPage: number[]   // sentiment per page -1..+1
}

const POS_WORDS = new Set(['good','great','excellent','outstanding','positive','success','improve','benefit','advantage','achieve','best','recommend','effective','efficient','clear','helpful','strong','growth','opportunity','support','innovative','quality','reliable','trustworthy','pleased','delighted','confident','appreciate','thank','well','fantastic','superior','approved','confirmed','agreed'])
const NEG_WORDS = new Set(['bad','poor','fail','failure','problem','issue','risk','concern','reject','deny','refuse','wrong','error','mistake','loss','damage','violation','breach','illegal','danger','threat','warning','urgent','immediately','unfortunately','regret','terminate','cancel','void','penalty','fine','lawsuit','complaint','dissatisfied','unacceptable','inadequate'])
const FORMAL_WORDS = new Set(['pursuant','herein','aforementioned','notwithstanding','whereas','therefore','henceforth','herewith','therein','aforesaid','stipulate','indemnify','remunerate','commence','terminate','execute','provision','jurisdiction','entity','obligation','accordance','compliance','contractual','statutory'])
const AGGRESSIVE = new Set(['demand','require','must','immediately','deadline','final','warning','legal action','court','terminate','breach','violation','penalty','immediately','non-negotiable','last chance'])

export function analyseTone(textByPage: Array<{ page: number; text: string }>): ToneResult {
  const perPage: number[] = []
  let totalPos = 0, totalNeg = 0, totalFormal = 0, totalAggressive = 0, totalWords = 0
  for (const { text } of textByPage) {
    const words = text.toLowerCase().match(/\b\w+\b/g) || []
    let pos = 0, neg = 0
    words.forEach(w => {
      if (POS_WORDS.has(w)) pos++
      if (NEG_WORDS.has(w)) neg++
      if (FORMAL_WORDS.has(w)) totalFormal++
      if (AGGRESSIVE.has(w)) totalAggressive++
    })
    totalPos += pos; totalNeg += neg; totalWords += words.length
    perPage.push(words.length > 0 ? (pos - neg) / Math.max(1, pos + neg) : 0)
  }
  const sentiment = (totalPos - totalNeg) / Math.max(1, totalPos + totalNeg)
  const formality = Math.min(1, totalFormal / Math.max(1, totalWords) * 50)
  const aggrScore = totalAggressive / Math.max(1, totalWords) * 100
  let overall: ToneResult['overall'] = 'neutral'
  if (aggrScore > 0.5) overall = 'aggressive'
  else if (formality > 0.6) overall = 'formal'
  else if (sentiment > 0.3) overall = 'positive'
  else if (sentiment < -0.2) overall = 'negative'
  return { overall, sentiment: Math.round(sentiment * 100) / 100, formality: Math.round(formality * 100) / 100, perPage }
}

// ─── Language Detector ────────────────────────────────────────────────────────
export interface LangResult {
  lang: string
  name: string
  confidence: number
  perPage: string[]
}

// Trigram frequency profiles for 12 common languages (simplified)
const LANG_PROFILES: Record<string, string[]> = {
  en: ['the','and','ing','ion','ent','for','tha','her','his','tio','ter','res','con','ver','hat'],
  fr: ['les','des','que','est','ent','ont','dans','pour','pas','sur','une','par','qui','tout','mais'],
  de: ['die','der','und','den','ein','ist','von','das','mit','dem','nicht','auch','ich','sie','war'],
  es: ['los','las','que','del','con','por','una','para','como','más','pero','sus','sobre','años','entre'],
  it: ['che','per','con','del','non','una','dei','nel','sono','questa','dalla','degli','anche','già','molto'],
  pt: ['que','com','por','para','uma','dos','das','não','mas','mais','isso','esse','esta','também','como'],
  nl: ['van','het','een','voor','met','zijn','niet','aan','ook','bij','heeft','worden','deze','jaar','werd'],
  pl: ['nie','jak','się','dla','jest','też','ale','być','tak','jego','jej','który','przez','tylko','gdy'],
  ru: ['не','на','что','это','как','из','он','она','они','был','что','или','при','но','по'],
  zh: ['的','是','在','了','和','有','大','这','中','来','上','为','个','与','人'],
  ja: ['の','に','は','を','が','で','と','から','も','です','この','ます','ない','それ','して'],
  ar: ['في','من','على','إلى','ما','هذا','كان','التي','كل','أن','مع','وقد','هو','لا','قد'],
}
const LANG_NAMES: Record<string, string> = {
  en:'English',fr:'French',de:'German',es:'Spanish',it:'Italian',pt:'Portuguese',
  nl:'Dutch',pl:'Polish',ru:'Russian',zh:'Chinese',ja:'Japanese',ar:'Arabic'
}

export function detectLanguage(text: string): LangResult {
  const lower = text.toLowerCase()
  const scores: Record<string, number> = {}
  for (const [lang, markers] of Object.entries(LANG_PROFILES)) {
    scores[lang] = markers.reduce((s, m) => s + (lower.split(m).length - 1), 0)
  }
  const sorted = Object.entries(scores).sort((a,b)=>b[1]-a[1])
  const top = sorted[0]
  const total = sorted.reduce((s,[,v])=>s+v,0)
  return {
    lang: top[0],
    name: LANG_NAMES[top[0]] || top[0],
    confidence: Math.min(99, Math.round((top[1] / Math.max(1, total)) * 100 * 5)),
    perPage: []
  }
}

// ─── Citation / Reference Extractor ──────────────────────────────────────────
export interface Citation {
  type: 'doi' | 'url' | 'isbn' | 'author-year' | 'numbered'
  raw: string
  page: number
  link?: string
}

export function extractCitations(textByPage: Array<{ page: number; text: string }>): Citation[] {
  const results: Citation[] = []
  const doiRe = /\b10\.\d{4,9}\/[-._;()/:a-zA-Z0-9]+/g
  const urlRe = /https?:\/\/[^\s<>"']{4,}/g
  const isbnRe = /\bISBN[-:\s]?(?:97[89][-\s]?)?\d{1,5}[-\s]?\d{1,7}[-\s]?\d{1,6}[-\s]?[\dX]\b/gi
  const authorYearRe = /\(([A-Z][a-z]+(?:\s+(?:&|and)\s+[A-Z][a-z]+)?),?\s+(19|20)\d{2}[a-z]?\)/g
  const numberedRe = /^\s*\[(\d+)\]\s+(.+)$/gm

  for (const { page, text } of textByPage) {
    let m: RegExpExecArray | null
    doiRe.lastIndex = 0
    while ((m = doiRe.exec(text)) !== null)
      results.push({ type: 'doi', raw: m[0], page, link: `https://doi.org/${m[0]}` })
    urlRe.lastIndex = 0
    while ((m = urlRe.exec(text)) !== null)
      results.push({ type: 'url', raw: m[0], page, link: m[0] })
    isbnRe.lastIndex = 0
    while ((m = isbnRe.exec(text)) !== null)
      results.push({ type: 'isbn', raw: m[0], page })
    authorYearRe.lastIndex = 0
    while ((m = authorYearRe.exec(text)) !== null)
      results.push({ type: 'author-year', raw: m[0], page })
    numberedRe.lastIndex = 0
    while ((m = numberedRe.exec(text)) !== null)
      results.push({ type: 'numbered', raw: m[0].trim(), page })
  }
  return results
}

// ─── Timeline / Date Extractor ───────────────────────────────────────────────
export interface TimelineEvent {
  date: string
  context: string
  page: number
  sortKey: string
}

export function extractTimeline(textByPage: Array<{ page: number; text: string }>): TimelineEvent[] {
  const events: TimelineEvent[] = []
  const patterns = [
    /\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\b/g,
    /\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\b/gi,
    /\b(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})\b/gi,
    /\b(\d{4}[-\/]\d{2}[-\/]\d{2})\b/g,
    /\b(Q[1-4]\s+\d{4}|H[12]\s+\d{4}|FY\s*\d{2,4})\b/gi,
  ]
  for (const { page, text } of textByPage) {
    for (const re of patterns) {
      re.lastIndex = 0; let m: RegExpExecArray | null
      while ((m = re.exec(text)) !== null) {
        const start = Math.max(0, m.index - 60)
        const end = Math.min(text.length, m.index + m[0].length + 60)
        const context = text.slice(start, end).replace(/\n/g, ' ').trim()
        events.push({ date: m[0], context, page, sortKey: m[0] })
      }
    }
  }
  // Deduplicate
  const seen = new Set<string>()
  return events.filter(e => {
    const k = `${e.date}:${e.page}`
    if (seen.has(k)) return false
    seen.add(k); return true
  })
}

// ─── Font Inspector ───────────────────────────────────────────────────────────
export interface FontInfo {
  name: string
  type: string
  embedded: boolean
  subtype?: string
}

export async function inspectFonts(file: File): Promise<FontInfo[]> {
  // Parse PDF cross-reference for font entries
  const text = await file.text().catch(() => '')
  const fontRe = /\/BaseFont\s+\/([^\s\/\]>]+)/g
  const typeRe = /\/Subtype\s+\/([A-Za-z0-9]+)/g
  const embeddedRe = /\/FontFile[23]?\s+\d+\s+\d+\s+R/g
  
  const names: string[] = []
  let m: RegExpExecArray | null
  fontRe.lastIndex = 0
  while ((m = fontRe.exec(text)) !== null) names.push(m[1])
  
  const types: string[] = []
  typeRe.lastIndex = 0
  while ((m = typeRe.exec(text)) !== null) types.push(m[1])
  
  const embeddedCount = (text.match(embeddedRe) || []).length
  
  const seen = new Set<string>()
  return names.filter(n => { if (seen.has(n)) return false; seen.add(n); return true })
    .map((name, i) => ({
      name: name.replace(/^[A-Z]{6}\+/, ''),  // strip subset prefix
      type: types[i] || 'Type1',
      embedded: i < embeddedCount,
      subtype: name.startsWith('ABCDEF') ? 'Subset' : 'Full'
    }))
}

// ─── Ink Coverage Estimator ───────────────────────────────────────────────────
export interface InkEstimate {
  totalCoverage: number  // 0-1
  coveragePercent: number
  perPage: number[]      // per-page 0-1
  estimatedCostUSD: number  // at £0.02 per % per page
  canReduce: boolean
}

export async function estimateInkCoverage(
  file: File,
  onProgress?: (p: number, t: number) => void
): Promise<InkEstimate> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs'
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
  const perPage: number[] = []
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const vp = page.getViewport({ scale: 0.5 })  // smaller for speed
    const canvas = document.createElement('canvas')
    canvas.width = vp.width; canvas.height = vp.height
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise
    const ctx = canvas.getContext('2d')!
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let inkPixels = 0
    for (let j = 0; j < data.length; j += 4) {
      const brightness = (data[j] + data[j+1] + data[j+2]) / 3
      if (brightness < 240) inkPixels++  // not white/near-white
    }
    perPage.push(inkPixels / (canvas.width * canvas.height))
    onProgress?.(i, pdf.numPages)
  }
  
  const totalCoverage = perPage.reduce((s,v)=>s+v,0) / perPage.length
  const estimatedCostUSD = perPage.reduce((s,v)=>s+(v*0.02),0)
  return {
    totalCoverage,
    coveragePercent: Math.round(totalCoverage * 100),
    perPage,
    estimatedCostUSD: Math.round(estimatedCostUSD * 100) / 100,
    canReduce: totalCoverage > 0.15
  }
}
