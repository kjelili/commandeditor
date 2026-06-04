'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { downloadBlob } from '@/utils/pdfOperations';

interface PDFViewerProps {
  files: File[];
  processedFile: Blob | null;
  selectedPages: number[];
  onPagesSelect: (pages: number[]) => void;
  editMode: boolean;
  onEditClick?: (pageIndex: number, x: number, y: number) => void;
  edits?: Array<{ pageIndex: number; text: string; x: number; y: number }>;
  onPageOrderChange?: (newOrder: number[]) => void;
  originalSize?: number;
  onDeletePages?: (pages: number[]) => void;
  onRotatePage?: (pageNum: number, direction: 'cw' | 'ccw') => void;
  thumbColsOverride?: number;
  outputName?: string;
}

interface PageThumb {
  pageNum: number;
  dataUrl: string;
  width: number;
  height: number;
  textItems?: Array<{ str: string; transform: number[]; width: number; height: number }>;
}

export default function PDFViewer({
  files, processedFile, selectedPages, onPagesSelect, editMode, onEditClick, edits = [], onPageOrderChange, originalSize,
  onDeletePages, onRotatePage, thumbColsOverride = 3, outputName
}: PDFViewerProps) {
  const [pages, setPages] = useState<PageThumb[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ pageNum: number; index: number; context: string }>>([]);
  const [currentSearchIdx, setCurrentSearchIdx] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const [dragOverPage, setDragOverPage] = useState<number | null>(null);
  const [draggingPage, setDraggingPage] = useState<number | null>(null);
  const [pageOrder, setPageOrder] = useState<number[]>([]);
  // ── New feature states ─────────────────────────────────────────────────
  const [zoomedPage, setZoomedPage] = useState<PageThumb | null>(null);
  const [copiedPage, setCopiedPage] = useState<number | null>(null);
  const [showBeforeAfter, setShowBeforeAfter] = useState(false);
  const [beforeThumb, setBeforeThumb] = useState<string | null>(null);
  const [afterThumb, setAfterThumb] = useState<string | null>(null);

  const renderingRef = useRef(false);
  const lastFileRef = useRef<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const pdfFile = files.find(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) || null;

  const initPdfjs = useCallback(async () => {
    const pdfjsLib = await import('pdfjs-dist');
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
      try { await fetch('https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs', { method: 'HEAD' }) }
      catch { pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs` }
    }
    return pdfjsLib;
  }, []);

  // ── Render a page to a thumb dataUrl at a given scale ─────────────────
  const renderPageThumb = useCallback(async (pdfjsLib: any, pdf: any, pageNum: number, scale: number): Promise<string> => {
    const page = await pdf.getPage(pageNum);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
    return canvas.toDataURL('image/jpeg', 0.85);
  }, []);

  const doRender = useCallback(async (arrayBuffer: ArrayBuffer, isProcessed = false) => {
    if (!isProcessed) {
      setLoading(true); setError(null); setPages([]); setTotalPages(0);
      setSearchResults([]); setSearchQuery('');
    }
    renderingRef.current = true;

    try {
      const hdr = new Uint8Array(arrayBuffer.slice(0, 5));
      if (!(hdr[0] === 0x25 && hdr[1] === 0x50 && hdr[2] === 0x44 && hdr[3] === 0x46)) {
        if (!isProcessed) setError('preview-not-pdf'); return;
      }
      const pdfjsLib = await initPdfjs();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;

      if (!isProcessed) {
        setTotalPages(pdf.numPages);
        const order = Array.from({ length: pdf.numPages }, (_, i) => i + 1);
        setPageOrder(order);

        // Capture before-thumbnail from page 1
        const bf = await renderPageThumb(pdfjsLib, pdf, 1, 0.4);
        setBeforeThumb(bf);

        const thumbs: PageThumb[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 0.6 });
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          canvas.width = viewport.width; canvas.height = viewport.height;
          await page.render({ canvasContext: ctx, viewport }).promise;
          let textItems: PageThumb['textItems'] = [];
          try {
            const tc = await page.getTextContent();
            textItems = (tc.items as any[]).map(item => ({
              str: item.str, transform: item.transform, width: item.width, height: item.height,
            }));
          } catch {}
          const thumb: PageThumb = { pageNum: i, dataUrl: canvas.toDataURL('image/jpeg', 0.82), width: viewport.width, height: viewport.height, textItems };
          thumbs.push(thumb);
          setPages(prev => [...prev, thumb]);
        }
      } else {
        // After processing: grab page 1 thumb for before/after
        const af = await renderPageThumb(pdfjsLib, pdf, 1, 0.4);
        setAfterThumb(af);
        setShowBeforeAfter(true);

        // Re-render full page list
        setPages([]);
        setTotalPages(pdf.numPages);
        const order = Array.from({ length: pdf.numPages }, (_, i) => i + 1);
        setPageOrder(order);
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 0.6 });
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          canvas.width = viewport.width; canvas.height = viewport.height;
          await page.render({ canvasContext: ctx, viewport }).promise;
          let textItems: PageThumb['textItems'] = [];
          try {
            const tc = await page.getTextContent();
            textItems = (tc.items as any[]).map(item => ({ str: item.str, transform: item.transform, width: item.width, height: item.height }));
          } catch {}
          setPages(prev => [...prev, { pageNum: i, dataUrl: canvas.toDataURL('image/jpeg', 0.82), width: viewport.width, height: viewport.height, textItems }]);
        }
      }
    } catch (err: any) {
      const msg = (err?.message || err?.name || String(err)).toLowerCase();
      if (!isProcessed) {
        if (msg.includes('password') || msg.includes('encrypt')) setError('preview-encrypted');
        else if (msg.includes('invalid') || msg.includes('corrupt') || msg.includes('stream')) setError('preview-corrupt');
        else setError('preview-unknown');
      }
    } finally {
      setLoading(false); renderingRef.current = false;
    }
  }, [initPdfjs, renderPageThumb]);

  useEffect(() => {
    if (!pdfFile) { setPages([]); setTotalPages(0); setError(null); setPageOrder([]); setShowBeforeAfter(false); return; }
    const key = `${pdfFile.name}-${pdfFile.size}`;
    if (key === lastFileRef.current) return;
    lastFileRef.current = key;
    setShowBeforeAfter(false); setAfterThumb(null);
    pdfFile.arrayBuffer().then(buf => doRender(buf, false));
  }, [pdfFile, doRender]);

  useEffect(() => {
    if (!processedFile || processedFile.size === 0) return;
    if (!processedFile.type.includes('pdf')) return;
    const t = setTimeout(() => {
      renderingRef.current = false;
      processedFile.arrayBuffer().then(buf => doRender(buf, true));
    }, 350);
    return () => clearTimeout(t);
  }, [processedFile, doRender]);

  // ── Search ─────────────────────────────────────────────────────────────
  const runSearch = useCallback((query: string) => {
    if (!query.trim() || pages.length === 0) { setSearchResults([]); return; }
    const q = query.toLowerCase();
    const results: typeof searchResults = [];
    pages.forEach(page => {
      if (!page.textItems) return;
      const fullText = page.textItems.map(t => t.str).join(' ').toLowerCase();
      let idx = fullText.indexOf(q), occurrence = 0;
      while (idx !== -1 && occurrence < 10) {
        results.push({ pageNum: page.pageNum, index: occurrence, context: fullText.slice(Math.max(0, idx - 20), idx + query.length + 20) });
        idx = fullText.indexOf(q, idx + 1); occurrence++;
      }
    });
    setSearchResults(results); setCurrentSearchIdx(0);
    if (results.length > 0) document.querySelector(`[data-page="${results[0].pageNum}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [pages]);

  useEffect(() => { const t = setTimeout(() => runSearch(searchQuery), 300); return () => clearTimeout(t); }, [searchQuery, runSearch]);

  const goToSearchResult = (delta: number) => {
    const next = (currentSearchIdx + delta + searchResults.length) % searchResults.length;
    setCurrentSearchIdx(next);
    document.querySelector(`[data-page="${searchResults[next].pageNum}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // ── Keyboard shortcuts ─────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); setShowSearch(s => !s); setTimeout(() => searchInputRef.current?.focus(), 100); }
      if (e.key === 'Escape') { setShowSearch(false); setSearchQuery(''); setZoomedPage(null); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showSearch]);

  // ── Drag reorder ───────────────────────────────────────────────────────
  const handleDragStart = (pageNum: number) => { setDraggingPage(pageNum); };
  const handleDragOver = (e: React.DragEvent, pageNum: number) => { e.preventDefault(); setDragOverPage(pageNum); };
  const handleDrop = (targetPageNum: number) => {
    if (draggingPage === null || draggingPage === targetPageNum) { setDraggingPage(null); setDragOverPage(null); return; }
    const newOrder = [...pageOrder];
    const fromIdx = newOrder.indexOf(draggingPage), toIdx = newOrder.indexOf(targetPageNum);
    newOrder.splice(fromIdx, 1); newOrder.splice(toIdx, 0, draggingPage);
    setPageOrder(newOrder);
    setPages(prev => { const map = new Map(prev.map(p => [p.pageNum, p])); return newOrder.map(n => map.get(n)!).filter(Boolean); });
    onPageOrderChange?.(newOrder);
    setDraggingPage(null); setDragOverPage(null);
  };

  // ── Page toggle ────────────────────────────────────────────────────────
  const togglePage = (pageNum: number) => {
    if (editMode) return;
    onPagesSelect(selectedPages.includes(pageNum) ? selectedPages.filter(p => p !== pageNum) : [...selectedPages, pageNum].sort((a, b) => a - b));
  };

  const handleThumbClick = (e: React.MouseEvent<HTMLDivElement>, page: PageThumb) => {
    if (editMode && onEditClick) {
      const rect = e.currentTarget.getBoundingClientRect();
      onEditClick(page.pageNum - 1, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
    } else { togglePage(page.pageNum); }
  };

  // ── Copy page to clipboard ─────────────────────────────────────────────
  const copyPageToClipboard = useCallback(async (page: PageThumb, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(page.dataUrl);
      const blob = await res.blob();
      await (navigator.clipboard as any).write([new (window as any).ClipboardItem({ 'image/png': blob })]);
      setCopiedPage(page.pageNum);
      setTimeout(() => setCopiedPage(null), 2000);
    } catch { /* browser may not support ClipboardItem — silently ignore */ }
  }, []);

  // ── Download ───────────────────────────────────────────────────────────
  const handleDownload = () => {
    if (!processedFile || processedFile.size === 0) return;
    const ext = processedFile.type.includes('word') ? 'docx' : processedFile.type.includes('zip') ? 'zip' : 'pdf';
    const baseName = (outputName && outputName.trim())
      ? outputName.trim()
      : (pdfFile?.name || files[0]?.name || 'output').replace(/\.[^.]+$/, '') + '-edited';
    downloadBlob(processedFile, `${baseName}.${ext}`);
  };

  const getSizeDiff = () => {
    if (!processedFile || !originalSize || processedFile.size === 0) return null;
    const diff = ((originalSize - processedFile.size) / originalSize) * 100;
    return { before: originalSize, after: processedFile.size, pct: diff };
  };
  const sizeDiff = getSizeDiff();

  const errorConfigs: Record<string, any> = {
    'preview-encrypted': { icon: '🔒', title: 'Password-protected PDF', detail: 'This file is encrypted.', tip: 'Use "Remove Password" then try again.', color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
    'preview-corrupt': { icon: '⚠️', title: 'File appears damaged', detail: 'PDF could not be parsed.', tip: 'Try re-saving from source.', color: '#991b1b', bg: '#fff1f2', border: '#fecaca' },
    'preview-not-pdf': { icon: '📄', title: 'Not a PDF file', detail: 'No valid PDF structure.', tip: 'Use "To PDF" to convert first.', color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
    'preview-unknown': { icon: '❌', title: 'Preview unavailable', detail: 'An unexpected error occurred.', tip: 'Tools above may still work.', color: '#6b21a8', bg: '#faf5ff', border: '#e9d5ff' },
  };

  const orderedPages = pageOrder.length > 0 ? pageOrder.map(n => pages.find(p => p.pageNum === n)).filter(Boolean) as PageThumb[] : pages;

  return (
    <div className="space-y-4">

      {/* ── Before / After comparison ─────────────────────────────────── */}
      {showBeforeAfter && beforeThumb && afterThumb && processedFile && processedFile.size > 0 && (
        <div className="card animate-scale-in" aria-label="Before and after comparison">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-base">🔍</span>
              <p className="font-semibold text-sm">Before vs After</p>
              {sizeDiff && Math.abs(sizeDiff.pct) > 1 && (
                <span className={`badge ${sizeDiff.pct > 0 ? 'badge-green' : 'badge-amber'}`}>
                  {sizeDiff.pct > 0 ? '↓' : '↑'} {Math.abs(sizeDiff.pct).toFixed(0)}% {sizeDiff.pct > 0 ? 'smaller' : 'larger'}
                </span>
              )}
            </div>
            <button onClick={() => setShowBeforeAfter(false)} className="btn-icon w-7 h-7" aria-label="Close comparison">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="split-panel">
              <div className="px-3 py-1.5 text-xs font-semibold border-b" style={{ borderColor: 'var(--border)', color: 'var(--ink-muted)' }}>
                BEFORE · {originalSize ? `${(originalSize/1024).toFixed(1)} KB` : ''}
              </div>
              <img src={beforeThumb} alt="Page 1 before processing" style={{ width: '100%', display: 'block' }} />
            </div>
            <div className="split-panel" style={{ borderColor: 'var(--green)' }}>
              <div className="px-3 py-1.5 text-xs font-semibold border-b" style={{ borderColor: 'var(--green)', color: 'var(--green)' }}>
                AFTER · {processedFile ? `${(processedFile.size/1024).toFixed(1)} KB` : ''}
              </div>
              <img src={afterThumb} alt="Page 1 after processing" style={{ width: '100%', display: 'block' }} />
            </div>
          </div>
        </div>
      )}

      {/* ── Download panel ─────────────────────────────────────────────── */}
      {processedFile && processedFile.size > 0 && (
        <div className="card animate-scale-in" role="region" aria-label="Download processed file"
             style={{ borderColor: 'rgba(5,150,105,0.3)', background: 'rgba(5,150,105,0.04)' }}>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--green-light)' }}>
                <svg className="w-5 h-5" style={{ color: 'var(--green)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm" style={{ color: 'var(--green)' }}>Document is ready</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs" style={{ color: 'rgba(15,23,42,0.45)' }}>
                    {(processedFile.size / 1024).toFixed(1)} KB · processed entirely in your browser
                  </p>
                  {sizeDiff && Math.abs(sizeDiff.pct) > 1 && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${sizeDiff.pct > 0 ? 'text-green-700' : 'text-orange-700'}`}
                          style={{ background: sizeDiff.pct > 0 ? 'var(--green-light)' : '#ffedd5' }}>
                      {sizeDiff.pct > 0 ? '↓' : '↑'} {Math.abs(sizeDiff.pct).toFixed(0)}%
                    </span>
                  )}
                </div>
                {sizeDiff && Math.abs(sizeDiff.pct) > 1 && (
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(15,23,42,0.4)' }}>
                    {(sizeDiff.before / 1024).toFixed(1)} KB → {(sizeDiff.after / 1024).toFixed(1)} KB
                  </p>
                )}
              </div>
            </div>
            <button data-download-btn onClick={handleDownload} className="btn-primary flex-shrink-0"
                    style={{ background: 'var(--green)' }} aria-label="Download processed file">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download
            </button>
          </div>
        </div>
      )}

      {/* ── Viewer card ─────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }} role="region" aria-label="PDF page preview">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <span className="section-label">Preview</span>
            {totalPages > 0 && <span className="badge badge-blue" aria-label={`${totalPages} pages`}>{totalPages} page{totalPages !== 1 ? 's' : ''}</span>}
            {pageOrder.length > 0 && JSON.stringify(pageOrder) !== JSON.stringify(Array.from({ length: pageOrder.length }, (_, i) => i + 1)) && (
              <span className="badge" style={{ background: '#ffedd5', color: '#c2410c' }}>Reordered</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {pages.length > 0 && (
              <>
                <button onClick={() => { setShowSearch(s => !s); setTimeout(() => searchInputRef.current?.focus(), 100); }}
                        className={`btn-icon ${showSearch ? 'active' : ''}`}
                        style={showSearch ? { background: 'var(--blue-pale)', color: 'var(--blue-vivid)' } : {}}
                        aria-label="Search text in PDF (Ctrl+F)" title="Search text (Ctrl+F)">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>
                <span className="text-xs px-2" style={{ color: 'var(--ink-muted)' }}>
                  {editMode ? '✐ Click to place text' : 'Click pages to select'}
                </span>
                {selectedPages.length > 0 && (
                  <>
                    <button onClick={() => onPagesSelect([])} className="btn-ghost text-xs px-2 py-1"
                            style={{ color: 'var(--ink-muted)' }} aria-label="Clear page selection">Clear</button>
                    {onDeletePages && (
                      <button onClick={() => { if (window.confirm(`Delete ${selectedPages.length} selected page(s)?`)) { onDeletePages(selectedPages); onPagesSelect([]); } }}
                              className="text-xs px-2.5 py-1 rounded-lg font-semibold"
                              style={{ background: '#fee2e2', color: '#dc2626' }}
                              aria-label={`Delete ${selectedPages.length} selected pages`}>
                        🗑 Delete {selectedPages.length}
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Search bar */}
        {showSearch && (
          <div className="px-5 py-3 border-b flex items-center gap-3 animate-slide-down"
               style={{ borderColor: 'var(--border)', background: 'var(--surface)' }} role="search">
            <svg className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input ref={searchInputRef} type="search" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                   placeholder="Search text in PDF…" className="input flex-1" aria-label="Search text in PDF"
                   style={{ padding: '6px 12px', fontSize: '13px' }} />
            {searchResults.length > 0 && (
              <span className="text-xs whitespace-nowrap" style={{ color: 'var(--ink-muted)' }} aria-live="polite">
                {currentSearchIdx + 1} / {searchResults.length}
              </span>
            )}
            {searchResults.length > 1 && (
              <>
                <button onClick={() => goToSearchResult(-1)} className="btn-icon w-7 h-7" aria-label="Previous search result">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
                </button>
                <button onClick={() => goToSearchResult(1)} className="btn-icon w-7 h-7" aria-label="Next search result">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </button>
              </>
            )}
            {searchQuery && searchResults.length === 0 && <span className="text-xs" style={{ color: '#dc2626' }} role="alert">No results</span>}
            <button onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }}
                    className="btn-icon w-7 h-7" aria-label="Close search">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        {/* Pages grid */}
        <div className="p-5">
          {loading && pages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-4" role="status" aria-label="Loading PDF preview">
              <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
                   style={{ borderColor: 'var(--border)', borderTopColor: 'var(--blue-vivid)' }} />
              <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>Loading preview…</p>
            </div>
          )}
          {error && (
            <div className="rounded-2xl p-5" role="alert"
                 style={{ background: errorConfigs[error]?.bg || '#faf5ff', border: `1px solid ${errorConfigs[error]?.border || '#e9d5ff'}` }}>
              <div className="flex items-start gap-3">
                <span className="text-2xl" aria-hidden="true">{errorConfigs[error]?.icon || '❌'}</span>
                <div>
                  <p className="font-semibold text-sm mb-0.5" style={{ color: errorConfigs[error]?.color }}>{errorConfigs[error]?.title}</p>
                  <p className="text-xs mb-1.5" style={{ color: errorConfigs[error]?.color, opacity: 0.8 }}>{errorConfigs[error]?.detail}</p>
                  <p className="text-xs" style={{ color: 'rgba(15,23,42,0.55)' }}>💡 {errorConfigs[error]?.tip}</p>
                </div>
              </div>
            </div>
          )}
          {orderedPages.length > 0 && (
            <>
              {pages.length > 1 && (
                <p className="text-xs mb-3" style={{ color: 'var(--ink-muted)' }}>
                  💡 Drag to reorder · Click to zoom · Hover for copy button
                </p>
              )}
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}
                   role="list" aria-label="PDF pages">
                {orderedPages.map((page) => {
                  const isSelected = selectedPages.includes(page.pageNum);
                  const isDragging = draggingPage === page.pageNum;
                  const isDragTarget = dragOverPage === page.pageNum;
                  const hasSearchHit = searchResults.some(r => r.pageNum === page.pageNum);
                  const isCurrentHit = searchResults[currentSearchIdx]?.pageNum === page.pageNum;
                  const wasCopied = copiedPage === page.pageNum;
                  return (
                    <div key={page.pageNum} data-page={page.pageNum} role="listitem"
                         draggable tabIndex={0}
                         aria-label={`Page ${page.pageNum}${isSelected ? ', selected' : ''}`}
                         aria-selected={isSelected}
                         onKeyDown={e => {
                           if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePage(page.pageNum) }
                           if (e.key === 'z' || e.key === 'Z') setZoomedPage(page)
                           if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); const idx = pages.indexOf(page); const next = pages[idx + 1]; if (next) (document.querySelector(`[data-page="${next.pageNum}"]`) as HTMLElement)?.focus() }
                           if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); const idx = pages.indexOf(page); const prev = pages[idx - 1]; if (prev) (document.querySelector(`[data-page="${prev.pageNum}"]`) as HTMLElement)?.focus() }
                         }}
                         onDragStart={() => handleDragStart(page.pageNum)}
                         onDragOver={(e) => handleDragOver(e, page.pageNum)}
                         onDragLeave={() => setDragOverPage(null)}
                         onDrop={() => handleDrop(page.pageNum)}
                         onDragEnd={() => { setDraggingPage(null); setDragOverPage(null); }}
                         className={`page-thumb${isSelected ? ' selected' : ''}${isDragging ? ' dragging-page' : ''}${isDragTarget ? ' drag-over' : ''}`}
                         style={{ outline: isCurrentHit ? '2px solid var(--accent)' : hasSearchHit ? '2px solid rgba(251,191,36,0.8)' : undefined, outlineOffset: '2px' }}>
                      <div onClick={(e) => handleThumbClick(e, page)} className="relative group cursor-pointer">
                        <img src={page.dataUrl} alt={`Page ${page.pageNum} thumbnail`}
                             style={{ width: '100%', display: 'block', borderRadius: '8px 8px 0 0' }}
                             loading="lazy" />
                        {/* Edit overlays */}
                        {editMode && edits.filter(ed => ed.pageIndex === page.pageNum - 1).map((ed, ei) => (
                          <div key={ei} className="absolute text-xs font-medium pointer-events-none"
                               style={{ left: `${ed.x * 100}%`, top: `${ed.y * 100}%`, color: 'var(--blue-vivid)', background: 'rgba(255,255,255,0.85)', padding: '1px 4px', borderRadius: 4, transform: 'translateY(-50%)', whiteSpace: 'nowrap' }}>
                            {ed.text}
                          </div>
                        ))}
                        {/* Hover overlay */}
                        <div className="absolute inset-0 rounded-t-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                             style={{ background: 'rgba(15,23,42,0.25)' }} aria-hidden="true">
                          <span className="text-white text-xs font-semibold">{editMode ? '+ Text' : isSelected ? '✓' : '🔍 Zoom'}</span>
                        </div>
                        {/* Zoom button */}
                        <button onClick={e => { e.stopPropagation(); setZoomedPage(page); }}
                                className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded-lg flex items-center justify-center"
                                style={{ background: 'rgba(15,23,42,0.7)', color: 'white' }}
                                aria-label={`Zoom page ${page.pageNum}`}>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                        </button>
                        {/* Copy to clipboard */}
                        {typeof window !== 'undefined' && (window as any).ClipboardItem && (
                          <button onClick={e => copyPageToClipboard(page, e)}
                                  className="copy-page-btn"
                                  aria-label={`Copy page ${page.pageNum} to clipboard`}>
                            {wasCopied ? '✓ Copied' : '📋 Copy'}
                          </button>
                        )}
                        {/* Per-page rotate buttons */}
                        {onRotatePage && (
                          <div className="absolute bottom-1.5 left-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={e => { e.stopPropagation(); onRotatePage(page.pageNum, 'ccw') }}
                                    className="w-5 h-5 rounded flex items-center justify-center text-xs"
                                    style={{background:'rgba(0,0,0,0.65)',color:'white'}}
                                    aria-label={`Rotate page ${page.pageNum} counter-clockwise`} title="Rotate CCW">↺</button>
                            <button onClick={e => { e.stopPropagation(); onRotatePage(page.pageNum, 'cw') }}
                                    className="w-5 h-5 rounded flex items-center justify-center text-xs"
                                    style={{background:'rgba(0,0,0,0.65)',color:'white'}}
                                    aria-label={`Rotate page ${page.pageNum} clockwise`} title="Rotate CW">↻</button>
                          </div>
                        )}
                        {/* Delete page button */}
                        {onDeletePages && (
                          <button onClick={e => { e.stopPropagation(); if (confirm(`Delete page ${page.pageNum}? This cannot be undone from the viewer.`)) onDeletePages([page.pageNum]) }}
                                  className="absolute top-1.5 left-1.5 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 rounded flex items-center justify-center text-xs"
                                  style={{background:'rgba(220,38,38,0.85)',color:'white'}}
                                  aria-label={`Delete page ${page.pageNum}`} title="Delete page">✕</button>
                        )}
                        {isSelected && (
                          <div className="absolute top-2 left-2 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs"
                               style={{ background: 'var(--blue-vivid)' }} aria-hidden="true">✓</div>
                        )}
                        {hasSearchHit && (
                          <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-xs"
                               style={{ background: isCurrentHit ? 'var(--accent)' : '#fbbf24', color: 'white' }} aria-hidden="true">🔍</div>
                        )}
                        {/* Drag handle */}
                        <div className="absolute top-1.5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-60 transition-opacity cursor-grab"
                             style={{ color: 'white' }} aria-hidden="true">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
                          </svg>
                        </div>
                      </div>
                      <div className="px-2 py-1.5 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)' }}>
                        <span className="text-xs font-medium" style={{ color: 'var(--ink-muted)' }}>p.{page.pageNum}</span>
                        {isSelected && <span className="text-xs font-semibold" style={{ color: 'var(--blue-vivid)' }}>✓</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Zoom lightbox ────────────────────────────────────────────────── */}
      {zoomedPage && (
        <div className="zoom-overlay animate-fade-in" role="dialog" aria-modal="true" aria-label={`Page ${zoomedPage.pageNum} zoomed view`}
             onClick={() => setZoomedPage(null)}>
          <div onClick={e => e.stopPropagation()} className="relative">
            <img src={zoomedPage.dataUrl} alt={`Page ${zoomedPage.pageNum} full view`} className="zoom-img" />
            <div className="absolute top-3 right-3 flex gap-2">
              {typeof window !== 'undefined' && (window as any).ClipboardItem && (
                <button onClick={e => copyPageToClipboard(zoomedPage, e)}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold"
                        style={{ background: 'rgba(0,0,0,0.7)', color: 'white', backdropFilter: 'blur(8px)' }}
                        aria-label="Copy page to clipboard">
                  {copiedPage === zoomedPage.pageNum ? '✓ Copied!' : '📋 Copy page'}
                </button>
              )}
              <button onClick={() => setZoomedPage(null)}
                      className="w-8 h-8 rounded-xl flex items-center justify-center"
                      style={{ background: 'rgba(0,0,0,0.7)', color: 'white', backdropFilter: 'blur(8px)' }}
                      aria-label="Close zoom view">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-xl text-xs font-medium"
                 style={{ background: 'rgba(0,0,0,0.6)', color: 'white', backdropFilter: 'blur(8px)' }}>
              Page {zoomedPage.pageNum} · Press Esc or click outside to close
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
