/**
 * On-device AI extensions — v10
 *
 * Summarize and Translate, both running 100% in the browser via
 * transformers.js. No API keys, no uploads; models are downloaded once
 * from HuggingFace and cached (the service worker keeps them offline).
 */

// Lazy-load transformers.js so merely importing this module (e.g. for
// TRANSLATION_PAIRS inside a server-rendered component) doesn't pull in the
// Node image backend (sharp) at build/prerender time. It loads on first use.
let tfP: Promise<typeof import('@xenova/transformers')> | null = null;
function tf() {
  if (!tfP) {
    tfP = import('@xenova/transformers').then((m) => {
      m.env.allowLocalModels = false;
      m.env.useBrowserCache = true;
      try {
        (m.env as any).backends.onnx.wasm.wasmPaths =
          'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/';
      } catch {}
      return m;
    });
  }
  return tfP;
}

// ─── SUMMARIZE ─────────────────────────────────────────────────────────────
// Extractive-first: reuse the tiny embedding model (all-MiniLM-L6-v2, ~23 MB)
// to rank sentences by centrality — fast and accurate for documents. The
// abstractive model is offered as an optional upgrade.

export interface SummaryResult {
  summary: string;
  keySentences: Array<{ sentence: string; score: number }>;
  wordsBefore: number;
  wordsAfter: number;
  method: 'extractive' | 'abstractive';
}

let embedderP: Promise<any> | null = null;
function getEmbedder() {
  if (!embedderP) embedderP = tf().then((m) => m.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true } as any));
  return embedderP;
}

function splitSentences(text: string): string[] {
  return (text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [])
    .map((s) => s.trim())
    .filter((s) => s.split(' ').length >= 5);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export async function summarizeOnDevice(
  text: string,
  ratio = 0.2,
  onProgress?: (msg: string) => void
): Promise<SummaryResult> {
  const sentences = splitSentences(text).slice(0, 400); // cap for speed
  if (sentences.length <= 3) {
    return { summary: sentences.join(' '), keySentences: sentences.map((s) => ({ sentence: s, score: 1 })), wordsBefore: text.split(' ').length, wordsAfter: sentences.join(' ').split(' ').length, method: 'extractive' };
  }
  onProgress?.('Loading embedding model (one-time download)…');
  const embedder: any = await getEmbedder();
  onProgress?.(`Embedding ${sentences.length} sentences…`);

  const vecs: number[][] = [];
  for (const s of sentences) {
    const out = await embedder(s, { pooling: 'mean', normalize: true });
    vecs.push(Array.from(out.data as Float32Array));
  }
  // Centroid = mean of all sentence vectors → rank by similarity to it
  const centroid = vecs[0].map((_, i) => vecs.reduce((a, v) => a + v[i], 0) / vecs.length);
  const scored = sentences.map((s, i) => ({ sentence: s, score: cosine(vecs[i], centroid), idx: i }));
  const keep = Math.max(2, Math.round(sentences.length * ratio));
  const top = [...scored].sort((a, b) => b.score - a.score).slice(0, keep);
  const ordered = top.sort((a, b) => a.idx - b.idx); // restore document order

  const summary = ordered.map((t) => t.sentence).join(' ');
  return {
    summary,
    keySentences: ordered,
    wordsBefore: text.split(/\s+/).length,
    wordsAfter: summary.split(/\s+/).length,
    method: 'extractive',
  };
}

// ─── TRANSLATE ─────────────────────────────────────────────────────────────
// Helsinki-NLP opus-mt models via transformers.js. One model per language
// pair, downloaded lazily (~300 MB first time per pair, cached after).

export const TRANSLATION_PAIRS: Array<{ id: string; label: string; model: string }> = [
  { id: 'en-es', label: 'English → Spanish', model: 'Xenova/opus-mt-en-es' },
  { id: 'es-en', label: 'Spanish → English', model: 'Xenova/opus-mt-es-en' },
  { id: 'en-fr', label: 'English → French', model: 'Xenova/opus-mt-en-fr' },
  { id: 'fr-en', label: 'French → English', model: 'Xenova/opus-mt-fr-en' },
  { id: 'en-de', label: 'English → German', model: 'Xenova/opus-mt-en-de' },
  { id: 'de-en', label: 'German → English', model: 'Xenova/opus-mt-de-en' },
  { id: 'en-it', label: 'English → Italian', model: 'Xenova/opus-mt-en-it' },
  { id: 'en-pt', label: 'English → Portuguese', model: 'Xenova/opus-mt-en-pt' },
  { id: 'en-zh', label: 'English → Chinese', model: 'Xenova/opus-mt-en-zh' },
];

const translators = new Map<string, Promise<any>>();
function getTranslator(model: string) {
  if (!translators.has(model)) translators.set(model, tf().then((m) => m.pipeline('translation', model, { quantized: true } as any)));
  return translators.get(model)!;
}

export interface TranslateResult { translated: string; chunks: number }

export async function translateOnDevice(
  text: string,
  pairId: string,
  onProgress?: (msg: string) => void
): Promise<TranslateResult> {
  const pair = TRANSLATION_PAIRS.find((p) => p.id === pairId);
  if (!pair) throw new Error('Unknown language pair');
  onProgress?.(`Loading ${pair.label} model (one-time download, ~300 MB)…`);
  const translator: any = await getTranslator(pair.model);

  // Chunk on sentence boundaries — opus models degrade on long inputs
  const sentences = splitSentences(text);
  const chunks: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + ' ' + s).length > 400) { chunks.push(cur); cur = s; } else cur = cur ? cur + ' ' + s : s;
  }
  if (cur) chunks.push(cur);

  const out: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    onProgress?.(`Translating… ${i + 1}/${chunks.length}`);
    const res = await translator(chunks[i]);
    out.push(res[0]?.translation_text || '');
  }
  return { translated: out.join(' '), chunks: chunks.length };
}

// ─── ON-DEVICE SPEECH RECOGNITION (Whisper) ────────────────────────────────
// Real voice input for Safari/Firefox, and offline voice for Chrome.
// whisper-tiny.en (~40 MB, cached) — opt-in beta.

let whisperP: Promise<any> | null = null;
export async function transcribeOnDevice(
  audio: Float32Array, // 16 kHz mono
  onProgress?: (msg: string) => void
): Promise<string> {
  onProgress?.('Loading Whisper (one-time ~40 MB download)…');
  if (!whisperP) whisperP = tf().then((m) => m.pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', { quantized: true } as any));
  const asr: any = await whisperP;
  onProgress?.('Transcribing…');
  const res = await asr(audio);
  return (res?.text || '').trim();
}

/** Record from the mic for up to maxMs, resampled to 16 kHz mono Float32Array. */
export async function recordAudio16k(maxMs = 8000): Promise<Float32Array> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  processor.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  source.connect(processor); processor.connect(ctx.destination);
  await new Promise((r) => setTimeout(r, maxMs));
  processor.disconnect(); source.disconnect();
  stream.getTracks().forEach((t) => t.stop());

  const raw = new Float32Array(chunks.reduce((a, c) => a + c.length, 0));
  let off = 0; for (const c of chunks) { raw.set(c, off); off += c.length; }
  const targetRate = 16000;
  const ratio = ctx.sampleRate / targetRate;
  await ctx.close();
  const out = new Float32Array(Math.floor(raw.length / ratio));
  for (let i = 0; i < out.length; i++) out[i] = raw[Math.floor(i * ratio)];
  return out;
}
