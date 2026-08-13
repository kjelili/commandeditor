/**
 * AI RAG Pipeline - Client-side document intelligence
 * Uses transformers.js for embeddings and text generation
 * Zero server calls. All processing in browser.
 * 
 * Dependencies: @xenova/transformers (npm install @xenova/transformers)
 */

import { pipeline, env, type FeatureExtractionPipeline } from '@xenova/transformers';
import type { DocumentChunk, AIQueryResult, ChatMessage } from '../types';

// Configure transformers.js to use local/remote models
env.allowLocalModels = true;
env.useBrowserCache = true;

const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
const CHAT_MODEL = 'Xenova/tinyllama-v1.1-chat-v1.0'; // ~600MB, runs in browser
const CHUNK_SIZE = 512;
const CHUNK_OVERLAP = 128;
const TOP_K = 5;

class VectorStore {
  private db: IDBDatabase | null = null;
  private readonly DB_NAME = 'CommandEditor_AI';
  private readonly STORE_NAME = 'document_chunks';

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
          store.createIndex('documentHash', 'documentHash', { unique: false });
        }
      };
    });
  }

  async saveChunks(documentHash: string, chunks: DocumentChunk[]): Promise<void> {
    if (!this.db) await this.init();
    const tx = this.db!.transaction(this.STORE_NAME, 'readwrite');
    const store = tx.objectStore(this.STORE_NAME);

    // Clear old chunks for this document
    const index = store.index('documentHash');
    await new Promise<void>((resolve, reject) => {
      const request = index.openCursor(documentHash);
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          store.delete(cursor.primaryKey);
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });

    // Save new chunks and wait for the transaction to commit
    for (const chunk of chunks) {
      store.put({ ...chunk, documentHash });
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getChunks(documentHash: string): Promise<DocumentChunk[]> {
    if (!this.db) await this.init();
    const tx = this.db!.transaction(this.STORE_NAME, 'readonly');
    const store = tx.objectStore(this.STORE_NAME);
    const index = store.index('documentHash');
    return new Promise((resolve, reject) => {
      const request = index.getAll(documentHash);
      request.onsuccess = () => resolve(request.result as DocumentChunk[]);
      request.onerror = () => reject(request.error);
    });
  }

  async clearDocument(documentHash: string): Promise<void> {
    if (!this.db) await this.init();
    const tx = this.db!.transaction(this.STORE_NAME, 'readwrite');
    const store = tx.objectStore(this.STORE_NAME);
    const index = store.index('documentHash');
    const request = index.openCursor(documentHash);
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        store.delete(cursor.primaryKey);
        cursor.continue();
      }
    };
  }
}

export class DocumentIntelligence {
  private embedder: FeatureExtractionPipeline | null = null;
  private vectorStore = new VectorStore();
  private chatPipeline: any = null;
  private documentHash: string = '';
  private isReady = false;

  async initialize(): Promise<void> {
    if (this.isReady) return;

    // Load embedding model (~20MB)
    this.embedder = await pipeline('feature-extraction', EMBEDDING_MODEL, {
      quantized: true,
      revision: 'main',
    });

    await this.vectorStore.init();
    this.isReady = true;
    console.log('[AI] Document intelligence initialized');
  }

  async loadDocument(textByPage: string[], fileName: string): Promise<void> {
    if (!this.isReady) await this.initialize();

    // Generate document hash for caching
    const encoder = new TextEncoder();
    const data = encoder.encode(fileName + textByPage.join(''));
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    this.documentHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Check if already indexed
    const existing = await this.vectorStore.getChunks(this.documentHash);
    if (existing.length > 0) {
      console.log('[AI] Document already indexed');
      return;
    }

    // Chunk the document
    const chunks = this.createChunks(textByPage);

    // Generate embeddings
    const chunksWithEmbeddings = await this.embedChunks(chunks);

    // Store in vector DB
    await this.vectorStore.saveChunks(this.documentHash, chunksWithEmbeddings);
    console.log(`[AI] Indexed ${chunksWithEmbeddings.length} chunks`);
  }

  private createChunks(textByPage: string[]): Omit<DocumentChunk, 'embedding'>[] {
    const chunks: Omit<DocumentChunk, 'embedding'>[] = [];

    for (let pageIndex = 0; pageIndex < textByPage.length; pageIndex++) {
      const text = textByPage[pageIndex];
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

      let currentChunk = '';
      let paragraphIndex = 0;

      for (const sentence of sentences) {
        if ((currentChunk + sentence).length > CHUNK_SIZE) {
          if (currentChunk) {
            chunks.push({
              id: `chunk_${pageIndex}_${paragraphIndex}_${chunks.length}`,
              text: currentChunk.trim(),
              pageIndex,
              metadata: {
                paragraphIndex,
                wordCount: currentChunk.split(/\s+/).length,
                isHeading: currentChunk.length < 100 && /^[A-Z]/.test(currentChunk),
              },
            });
          }
          currentChunk = sentence;
        } else {
          currentChunk += ' ' + sentence;
        }
      }

      if (currentChunk) {
        chunks.push({
          id: `chunk_${pageIndex}_${paragraphIndex}_${chunks.length}`,
          text: currentChunk.trim(),
          pageIndex,
          metadata: {
            paragraphIndex,
            wordCount: currentChunk.split(/\s+/).length,
            isHeading: currentChunk.length < 100 && /^[A-Z]/.test(currentChunk),
          },
        });
      }
    }

    return chunks;
  }

  private async embedChunks(
    chunks: Omit<DocumentChunk, 'embedding'>[]
  ): Promise<DocumentChunk[]> {
    if (!this.embedder) throw new Error('Embedder not initialized');

    const result: DocumentChunk[] = [];

    for (const chunk of chunks) {
      const output = await this.embedder(chunk.text, {
        pooling: 'mean',
        normalize: true,
      });

      result.push({
        ...chunk,
        embedding: Array.from(output.data as Float32Array),
      });
    }

    return result;
  }

  async query(question: string): Promise<AIQueryResult> {
    if (!this.isReady) await this.initialize();

    const startTime = performance.now();

    // Embed the question
    const questionEmbedding = await this.embedder!(question, {
      pooling: 'mean',
      normalize: true,
    });
    const qVector = Array.from(questionEmbedding.data as Float32Array);

    // Retrieve relevant chunks
    const chunks = await this.vectorStore.getChunks(this.documentHash);
    const scored = chunks.map(chunk => ({
      chunk,
      score: this.cosineSimilarity(qVector, chunk.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);
    const topChunks = scored.slice(0, TOP_K).map(s => s.chunk);

    // Generate answer using retrieved context
    const context = topChunks.map(c => `[Page ${c.pageIndex + 1}]: ${c.text}`).join('\n\n');
    const answer = await this.generateAnswer(question, context);

    const processingTime = performance.now() - startTime;

    return {
      answer,
      relevantChunks: topChunks,
      confidence: scored[0]?.score || 0,
      processingTime,
    };
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private async generateAnswer(question: string, context: string): Promise<string> {
    // For now, use a template-based approach with the context
    // In production, load tinyllama for generation

    const prompt = `You are a helpful document assistant. Answer based ONLY on the provided context.

Context:
${context}

Question: ${question}

Answer:`;

    // If chat model is loaded, use it
    if (this.chatPipeline) {
      try {
        const result = await this.chatPipeline(prompt, {
          max_new_tokens: 256,
          temperature: 0.3,
          do_sample: true,
        });
        return result[0]?.generated_text?.replace(prompt, '').trim() || this.fallbackAnswer(question, context);
      } catch {
        return this.fallbackAnswer(question, context);
      }
    }

    return this.fallbackAnswer(question, context);
  }

  private fallbackAnswer(question: string, context: string): string {
    // Smart fallback: extract relevant sentences
    const sentences = context.split(/\n/).filter(s => s.trim());
    const keywords = question.toLowerCase().split(/\s+/).filter(w => w.length > 3);

    const scored = sentences.map(s => {
      const lower = s.toLowerCase();
      const score = keywords.reduce((acc, kw) => acc + (lower.includes(kw) ? 1 : 0), 0);
      return { sentence: s, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored.slice(0, 3).map(s => s.sentence.replace(/^\[Page \d+\]: /, ''));

    if (best.length === 0) return "I couldn't find relevant information in the document.";

    return `Based on the document:\n\n${best.join('\n\n')}`;
  }

  async summarize(pages?: number[]): Promise<string> {
    const chunks = await this.vectorStore.getChunks(this.documentHash);
    const relevant = pages 
      ? chunks.filter(c => pages.includes(c.pageIndex))
      : chunks;

    // Extract key sentences using TF-IDF-like scoring
    const allText = relevant.map(c => c.text).join(' ');
    const sentences = allText.match(/[^.!?]+[.!?]+/g) || [allText];

    // Simple extractive summarization: score by keyword density
    const wordFreq: Record<string, number> = {};
    const words = allText.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
    words.forEach(w => wordFreq[w] = (wordFreq[w] || 0) + 1);

    const scored = sentences.map(s => {
      const sWords = s.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
      const score = sWords.reduce((acc, w) => acc + (wordFreq[w] || 0), 0) / sWords.length;
      return { sentence: s.trim(), score: isNaN(score) ? 0 : score };
    });

    scored.sort((a, b) => b.score - a.score);
    const topSentences = scored.slice(0, 5).map(s => s.sentence);

    return topSentences.join(' ');
  }

  async loadChatModel(): Promise<void> {
    if (this.chatPipeline) return;
    console.log('[AI] Loading chat model...');
    this.chatPipeline = await pipeline('text-generation', CHAT_MODEL, {
      quantized: true,
      revision: 'main',
    });
    console.log('[AI] Chat model ready');
  }

  clear(): void {
    if (this.documentHash) {
      this.vectorStore.clearDocument(this.documentHash);
    }
    this.documentHash = '';
  }
}

export const documentAI = new DocumentIntelligence();
