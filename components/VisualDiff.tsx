'use client';

/**
 * VisualDiff - Pixel-level PDF comparison
 * Side-by-side and overlay diff modes
 * Highlights additions, removals, and modifications
 * 
 * Integration: Add as "Compare PDFs" tool enhancement
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as pdfjs from 'pdfjs-dist';

// Configure pdf.js worker (matches the rest of the app)
if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
}

import type { DiffResult, ComparisonSettings } from '../types';

interface Props {
  pdfABytes: Uint8Array;
  pdfBBytes: Uint8Array;
  fileAName: string;
  fileBName: string;
  onClose: () => void;
}

type DiffMode = 'side-by-side' | 'overlay' | 'heatmap';

const DEFAULT_SETTINGS: ComparisonSettings = {
  threshold: 30, // pixel difference threshold
  ignoreColors: false,
  ignoreAntialiasing: true,
  highlightColor: '#ef4444',
  overlayOpacity: 0.5,
};

export const VisualDiff: React.FC<Props> = ({ 
  pdfABytes, 
  pdfBBytes, 
  fileAName, 
  fileBName, 
  onClose 
}) => {
  const [mode, setMode] = useState<DiffMode>('side-by-side');
  const [currentPage, setCurrentPage] = useState(0);
  const [numPages, setNumPages] = useState({ a: 0, b: 0 });
  const [diffResults, setDiffResults] = useState<DiffResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [settings, setSettings] = useState<ComparisonSettings>(DEFAULT_SETTINGS);
  const [zoom, setZoom] = useState(1);
  const [showSettings, setShowSettings] = useState(false);

  const canvasARef = useRef<HTMLCanvasElement>(null);
  const canvasBRef = useRef<HTMLCanvasElement>(null);
  const canvasDiffRef = useRef<HTMLCanvasElement>(null);
  const canvasOverlayRef = useRef<HTMLCanvasElement>(null);

  const SCALE = 1.5;

  // Load and compare PDFs
  useEffect(() => {
    comparePDFs();
  }, []);

  const comparePDFs = async () => {
    setIsProcessing(true);
    try {
      const pdfA = await pdfjs.getDocument({ data: pdfABytes }).promise;
      const pdfB = await pdfjs.getDocument({ data: pdfBBytes }).promise;

      const maxPages = Math.max(pdfA.numPages, pdfB.numPages);
      setNumPages({ a: pdfA.numPages, b: pdfB.numPages });

      const results: DiffResult[] = [];

      for (let i = 0; i < maxPages; i++) {
        const result = await comparePage(pdfA, pdfB, i);
        results.push(result);
      }

      setDiffResults(results);
    } catch (error) {
      console.error('Comparison failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const comparePage = async (
    pdfA: pdfjs.PDFDocumentProxy,
    pdfB: pdfjs.PDFDocumentProxy,
    pageIndex: number
  ): Promise<DiffResult> => {
    const canvasA = document.createElement('canvas');
    const canvasB = document.createElement('canvas');

    // Render page A
    if (pageIndex < pdfA.numPages) {
      const pageA = await pdfA.getPage(pageIndex + 1);
      const viewportA = pageA.getViewport({ scale: SCALE });
      canvasA.width = viewportA.width;
      canvasA.height = viewportA.height;
      await pageA.render({ canvasContext: canvasA.getContext('2d')!, viewport: viewportA }).promise;
    }

    // Render page B
    if (pageIndex < pdfB.numPages) {
      const pageB = await pdfB.getPage(pageIndex + 1);
      const viewportB = pageB.getViewport({ scale: SCALE });
      canvasB.width = viewportB.width;
      canvasB.height = viewportB.height;
      await pageB.render({ canvasContext: canvasB.getContext('2d')!, viewport: viewportB }).promise;
    }

    // Normalize sizes
    const width = Math.max(canvasA.width, canvasB.width);
    const height = Math.max(canvasA.height, canvasB.height);

    // Create normalized canvases
    const normA = document.createElement('canvas');
    const normB = document.createElement('canvas');
    normA.width = width;
    normA.height = height;
    normB.width = width;
    normB.height = height;

    normA.getContext('2d')!.drawImage(canvasA, 0, 0);
    normB.getContext('2d')!.drawImage(canvasB, 0, 0);

    // Pixel comparison
    const ctxA = normA.getContext('2d')!;
    const ctxB = normB.getContext('2d')!;
    const imgA = ctxA.getImageData(0, 0, width, height);
    const imgB = ctxB.getImageData(0, 0, width, height);

    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = width;
    diffCanvas.height = height;
    const diffCtx = diffCanvas.getContext('2d')!;
    const diffImg = diffCtx.createImageData(width, height);

    let diffPixels = 0;
    const changedRegions: DiffResult['changedRegions'] = [];
    const visited = new Set<number>();

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;

        let rDiff = Math.abs(imgA.data[idx] - imgB.data[idx]);
        let gDiff = Math.abs(imgA.data[idx + 1] - imgB.data[idx + 1]);
        let bDiff = Math.abs(imgA.data[idx + 2] - imgB.data[idx + 2]);

        if (settings.ignoreColors) {
          // Convert to grayscale for comparison
          const grayA = (imgA.data[idx] + imgA.data[idx + 1] + imgA.data[idx + 2]) / 3;
          const grayB = (imgB.data[idx] + imgB.data[idx + 1] + imgB.data[idx + 2]) / 3;
          rDiff = gDiff = bDiff = Math.abs(grayA - grayB);
        }

        const pixelDiff = (rDiff + gDiff + bDiff) / 3;

        if (pixelDiff > settings.threshold) {
          diffPixels++;

          // Highlight in red
          diffImg.data[idx] = 239;     // R
          diffImg.data[idx + 1] = 68;  // G
          diffImg.data[idx + 2] = 68;  // B
          diffImg.data[idx + 3] = 200; // A

          // Track changed regions (simplified: just mark pixel)
          if (!visited.has(idx)) {
            // Simple region detection would go here
          }
        } else {
          // Show base image dimmed
          diffImg.data[idx] = imgA.data[idx];
          diffImg.data[idx + 1] = imgA.data[idx + 1];
          diffImg.data[idx + 2] = imgA.data[idx + 2];
          diffImg.data[idx + 3] = 100;
        }
      }
    }

    diffCtx.putImageData(diffImg, 0, 0);

    // Find connected regions (simplified blob detection)
    const regions = findChangedRegions(imgA, imgB, width, height, settings.threshold);

    const totalPixels = width * height;
    const similarityScore = 1 - (diffPixels / totalPixels);

    return {
      pageIndex,
      similarityScore,
      changedRegions: regions,
      diffCanvas,
    };
  };

  const findChangedRegions = (
    imgA: ImageData,
    imgB: ImageData,
    width: number,
    height: number,
    threshold: number
  ): DiffResult['changedRegions'] => {
    const regions: DiffResult['changedRegions'] = [];
    const visited = new Set<number>();
    const minRegionSize = 50;

    for (let y = 0; y < height; y += 4) {
      for (let x = 0; x < width; x += 4) {
        const idx = (y * width + x) * 4;
        if (visited.has(idx)) continue;

        const diff = (
          Math.abs(imgA.data[idx] - imgB.data[idx]) +
          Math.abs(imgA.data[idx + 1] - imgB.data[idx + 1]) +
          Math.abs(imgA.data[idx + 2] - imgB.data[idx + 2])
        ) / 3;

        if (diff > threshold) {
          // Flood fill to find region bounds
          let minX = x, maxX = x, minY = y, maxY = y;
          const queue = [[x, y]];
          visited.add(idx);
          let size = 0;

          while (queue.length > 0 && size < 10000) {
            const [cx, cy] = queue.pop()!;
            size++;

            minX = Math.min(minX, cx);
            maxX = Math.max(maxX, cx);
            minY = Math.min(minY, cy);
            maxY = Math.max(maxY, cy);

            // Check neighbors
            for (const [dx, dy] of [[-4, 0], [4, 0], [0, -4], [0, 4]]) {
              const nx = cx + dx;
              const ny = cy + dy;
              if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

              const nIdx = (ny * width + nx) * 4;
              if (visited.has(nIdx)) continue;

              const nDiff = (
                Math.abs(imgA.data[nIdx] - imgB.data[nIdx]) +
                Math.abs(imgA.data[nIdx + 1] - imgB.data[nIdx + 1]) +
                Math.abs(imgA.data[nIdx + 2] - imgB.data[nIdx + 2])
              ) / 3;

              if (nDiff > threshold) {
                visited.add(nIdx);
                queue.push([nx, ny]);
              }
            }
          }

          if (size >= minRegionSize) {
            regions.push({
              x: minX / SCALE,
              y: minY / SCALE,
              width: (maxX - minX) / SCALE,
              height: (maxY - minY) / SCALE,
              changeType: 'modified',
            });
          }
        }
      }
    }

    return regions;
  };

  // Render current page
  useEffect(() => {
    renderCurrentPage();
  }, [currentPage, diffResults, mode, zoom]);

  const renderCurrentPage = async () => {
    if (diffResults.length === 0) return;

    const result = diffResults[currentPage];
    if (!result) return;

    // Render original pages
    const pdfA = await pdfjs.getDocument({ data: pdfABytes }).promise;
    const pdfB = await pdfjs.getDocument({ data: pdfBBytes }).promise;

    if (currentPage < pdfA.numPages && canvasARef.current) {
      const page = await pdfA.getPage(currentPage + 1);
      const viewport = page.getViewport({ scale: SCALE * zoom });
      canvasARef.current.width = viewport.width;
      canvasARef.current.height = viewport.height;
      await page.render({ 
        canvasContext: canvasARef.current.getContext('2d')!, 
        viewport 
      }).promise;
    }

    if (currentPage < pdfB.numPages && canvasBRef.current) {
      const page = await pdfB.getPage(currentPage + 1);
      const viewport = page.getViewport({ scale: SCALE * zoom });
      canvasBRef.current.width = viewport.width;
      canvasBRef.current.height = viewport.height;
      await page.render({ 
        canvasContext: canvasBRef.current.getContext('2d')!, 
        viewport 
      }).promise;
    }

    // Render diff overlay
    if (result.diffCanvas && canvasDiffRef.current) {
      canvasDiffRef.current.width = result.diffCanvas.width * zoom;
      canvasDiffRef.current.height = result.diffCanvas.height * zoom;
      const ctx = canvasDiffRef.current.getContext('2d')!;
      ctx.drawImage(result.diffCanvas, 0, 0, canvasDiffRef.current.width, canvasDiffRef.current.height);
    }
  };

  const currentResult = diffResults[currentPage];
  const maxPages = Math.max(numPages.a, numPages.b);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #e5e7eb',
        background: '#f9fafb',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
      }}>
        <h3 style={{ margin: 0, fontSize: '16px' }}>Visual Diff</h3>

        <div style={{ display: 'flex', gap: '4px', background: '#e5e7eb', padding: '2px', borderRadius: '6px' }}>
          {(['side-by-side', 'overlay', 'heatmap'] as DiffMode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                padding: '6px 12px',
                borderRadius: '4px',
                border: 'none',
                background: mode === m ? 'white' : 'transparent',
                color: mode === m ? '#2563eb' : '#6b7280',
                fontSize: '13px',
                cursor: 'pointer',
                fontWeight: mode === m ? 500 : 400,
                boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {m.replace('-', ' ')}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} style={iconBtnStyle}>−</button>
          <span style={{ fontSize: '13px', minWidth: '48px', textAlign: 'center' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button onClick={() => setZoom(z => Math.min(3, z + 0.1))} style={iconBtnStyle}>+</button>
        </div>

        <div style={{ flex: 1 }} />

        {currentResult && (
          <div style={{
            padding: '6px 12px',
            background: currentResult.similarityScore > 0.95 ? '#f0fdf4' : 
                       currentResult.similarityScore > 0.8 ? '#fef3c7' : '#fef2f2',
            borderRadius: '20px',
            fontSize: '13px',
            fontWeight: 500,
            color: currentResult.similarityScore > 0.95 ? '#166534' :
                   currentResult.similarityScore > 0.8 ? '#92400e' : '#991b1b',
          }}>
            {Math.round(currentResult.similarityScore * 100)}% match
          </div>
        )}

        <button onClick={() => setShowSettings(!showSettings)} style={iconBtnStyle}>⚙️</button>
        <button onClick={onClose} style={{ ...btnStyle, background: '#f3f4f6', color: '#374151' }}>
          Close
        </button>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div style={{
          padding: '16px',
          background: '#f9fafb',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          gap: '24px',
          flexWrap: 'wrap',
        }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 500 }}>Pixel Threshold: {settings.threshold}</label>
            <input
              type="range"
              min="0"
              max="255"
              value={settings.threshold}
              onChange={e => setSettings(s => ({ ...s, threshold: parseInt(e.target.value) }))}
              style={{ display: 'block', width: '150px' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={settings.ignoreColors}
              onChange={e => setSettings(s => ({ ...s, ignoreColors: e.target.checked }))}
              id="ignoreColors"
            />
            <label htmlFor="ignoreColors" style={{ fontSize: '13px' }}>Ignore colors (grayscale)</label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={settings.ignoreAntialiasing}
              onChange={e => setSettings(s => ({ ...s, ignoreAntialiasing: e.target.checked }))}
              id="ignoreAA"
            />
            <label htmlFor="ignoreAA" style={{ fontSize: '13px' }}>Ignore antialiasing</label>
          </div>
        </div>
      )}

      {/* Page navigation */}
      <div style={{
        padding: '8px 16px',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        background: 'white',
      }}>
        <button 
          onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
          disabled={currentPage === 0}
          style={iconBtnStyle}
        >
          ←
        </button>
        <span style={{ fontSize: '14px' }}>
          Page {currentPage + 1} of {maxPages}
        </span>
        <button 
          onClick={() => setCurrentPage(Math.min(maxPages - 1, currentPage + 1))}
          disabled={currentPage === maxPages - 1}
          style={iconBtnStyle}
        >
          →
        </button>

        {currentResult && currentResult.changedRegions.length > 0 && (
          <span style={{ fontSize: '13px', color: '#6b7280' }}>
            {currentResult.changedRegions.length} change{currentResult.changedRegions.length !== 1 ? 's' : ''} detected
          </span>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', background: '#1f2937', padding: '24px' }}>
        {isProcessing ? (
          <div style={{ textAlign: 'center', padding: '80px', color: 'white' }}>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>🔍</div>
            <div>Comparing documents...</div>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '24px' }}>
            {mode === 'side-by-side' && (
              <>
                <div>
                  <div style={{ color: '#9ca3af', fontSize: '12px', marginBottom: '8px', textAlign: 'center' }}>
                    {fileAName}
                  </div>
                  <canvas
                    ref={canvasARef}
                    style={{
                      background: 'white',
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.3)',
                      maxWidth: '100%',
                    }}
                  />
                </div>
                <div>
                  <div style={{ color: '#9ca3af', fontSize: '12px', marginBottom: '8px', textAlign: 'center' }}>
                    {fileBName}
                  </div>
                  <canvas
                    ref={canvasBRef}
                    style={{
                      background: 'white',
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.3)',
                      maxWidth: '100%',
                    }}
                  />
                </div>
              </>
            )}

            {mode === 'overlay' && (
              <div style={{ position: 'relative' }}>
                <canvas
                  ref={canvasARef}
                  style={{
                    background: 'white',
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.3)',
                  }}
                />
                <canvas
                  ref={canvasDiffRef}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    opacity: 0.7,
                    pointerEvents: 'none',
                  }}
                />
                <div style={{
                  position: 'absolute',
                  bottom: '12px',
                  left: '12px',
                  background: 'rgba(0,0,0,0.7)',
                  color: 'white',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  fontSize: '12px',
                }}>
                  Red = differences
                </div>
              </div>
            )}

            {mode === 'heatmap' && (
              <div>
                <div style={{ color: '#9ca3af', fontSize: '12px', marginBottom: '8px', textAlign: 'center' }}>
                  Difference Heatmap
                </div>
                <canvas
                  ref={canvasDiffRef}
                  style={{
                    background: 'white',
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.3)',
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const btnStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: '6px',
  border: 'none',
  fontSize: '13px',
  fontWeight: 500,
  cursor: 'pointer',
};

const iconBtnStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: '4px',
  border: '1px solid #d1d5db',
  background: 'white',
  cursor: 'pointer',
};
