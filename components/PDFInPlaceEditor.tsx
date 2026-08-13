'use client';

/**
 * PDFInPlaceEditor - True in-place PDF editing
 * Maps PDF text items to editable DOM overlays
 * Applies changes via pdf-lib on save
 * 
 * Integration: Drop into CommandEditor's tool grid as "Edit PDF"
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import * as pdfjs from 'pdfjs-dist';

// Configure pdf.js worker (matches the rest of the app)
if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
}

import { PDFDocument, PDFPage, PDFEmbeddedPage, StandardFonts, rgb } from 'pdf-lib';
import type { PDFTextItem, TextEditOperation, EditorState } from '../types';

interface Props {
  pdfBytes: Uint8Array;
  fileName: string;
  onSave: (newBytes: Uint8Array, newName: string) => void;
  onCancel: () => void;
}

const SCALE = 1.5; // Render scale for crisp editing

export const PDFInPlaceEditor: React.FC<Props> = ({ pdfBytes, fileName, onSave, onCancel }) => {
  const [pages, setPages] = useState<Array<{ width: number; height: number; textItems: PDFTextItem[] }>>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editorState, setEditorState] = useState<EditorState>({
    textEdits: [],
    imageEdits: [],
    deletedObjects: [],
    addedObjects: [],
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load PDF and extract text items
  useEffect(() => {
    loadPDF();
  }, []);

  const loadPDF = async () => {
    const pdf = await pdfjs.getDocument({ data: pdfBytes }).promise;
    const pageData: Array<{ width: number; height: number; textItems: PDFTextItem[] }> = [];

    for (let i = 0; i < pdf.numPages; i++) {
      const page = await pdf.getPage(i + 1);
      const viewport = page.getViewport({ scale: SCALE });
      const textContent = await page.getTextContent();

      const textItems: PDFTextItem[] = textContent.items.map((item: any, idx: number) => ({
        text: item.str,
        x: item.transform[4] * SCALE,
        y: viewport.height - (item.transform[5] * SCALE), // PDF coords are bottom-up
        width: item.width * SCALE,
        height: item.height * SCALE,
        fontName: item.fontName,
        fontSize: item.height * SCALE,
        pageIndex: i,
        transform: item.transform,
        hasEOL: item.hasEOL,
        dir: item.dir,
        id: `text_${i}_${idx}`,
      }));

      pageData.push({
        width: viewport.width,
        height: viewport.height,
        textItems,
      });

      // Render page to canvas
      setTimeout(() => {
        const canvas = canvasRefs.current[i];
        if (canvas) {
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d')!;
          page.render({ canvasContext: ctx, viewport }).promise;
        }
      }, 0);
    }

    setPages(pageData);
  };

  const handleTextClick = (item: PDFTextItem) => {
    // Check if already edited
    const existingEdit = editorState.textEdits.find(e => 
      e.textItem.pageIndex === item.pageIndex && 
      e.textItem.x === item.x && 
      e.textItem.y === item.y
    );

    setEditingItem(`${item.pageIndex}-${item.x}-${item.y}`);
    setEditValue(existingEdit ? existingEdit.newText : item.text);
  };

  const handleEditConfirm = () => {
    if (!editingItem) return;

    const [pageIdx, x, y] = editingItem.split('-').map(Number);
    const page = pages[pageIdx];
    const item = page.textItems.find(t => t.x === x && t.y === y);
    if (!item) return;

    const newEdit: TextEditOperation = {
      id: `edit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      pageIndex: pageIdx,
      originalText: item.text,
      newText: editValue,
      textItem: item,
      timestamp: Date.now(),
    };

    setEditorState(prev => ({
      ...prev,
      textEdits: [...prev.textEdits.filter(e => 
        !(e.pageIndex === pageIdx && e.textItem.x === x && e.textItem.y === y)
      ), newEdit],
    }));

    setEditingItem(null);
    setEditValue('');
  };

  const handleEditCancel = () => {
    setEditingItem(null);
    setEditValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEditConfirm();
    }
    if (e.key === 'Escape') {
      handleEditCancel();
    }
  };

  const applyEdits = async () => {
    setIsProcessing(true);
    try {
      const pdfDoc = await PDFDocument.load(pdfBytes);

      // Group edits by page
      const editsByPage = new Map<number, TextEditOperation[]>();
      editorState.textEdits.forEach(edit => {
        const existing = editsByPage.get(edit.pageIndex) || [];
        existing.push(edit);
        editsByPage.set(edit.pageIndex, existing);
      });

      // Apply edits page by page
      for (const [pageIndex, edits] of editsByPage) {
        const page = pdfDoc.getPage(pageIndex);
        const { width, height } = page.getSize();

        for (const edit of edits) {
          // Find and remove original text
          // Note: pdf-lib doesn't have direct text editing, so we draw over with white
          // and add new text. For production, use a more sophisticated approach.

          const item = edit.textItem;
          // Draw white rectangle over original text
          page.drawRectangle({
            x: item.transform[4],
            y: item.transform[5] - (item.transform[3] * 0.2), // slight adjustment
            width: item.width / SCALE + 2,
            height: item.height / SCALE + 2,
            color: rgb(1, 1, 1),
          });

          // Draw new text
          page.drawText(edit.newText, {
            x: item.transform[4],
            y: item.transform[5],
            size: item.fontSize / SCALE,
            font: await pdfDoc.embedFont(StandardFonts.Helvetica),
            color: rgb(0, 0, 0),
          });
        }
      }

      const newBytes = await pdfDoc.save();
      onSave(newBytes, fileName.replace('.pdf', '_edited.pdf'));
    } catch (error) {
      console.error('Edit failed:', error);
      alert('Failed to apply edits: ' + (error as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const getEditedText = (item: PDFTextItem): string => {
    const edit = editorState.textEdits.find(e => 
      e.pageIndex === item.pageIndex && 
      e.textItem.x === item.x && 
      e.textItem.y === item.y
    );
    return edit ? edit.newText : item.text;
  };

  const isEdited = (item: PDFTextItem): boolean => {
    return editorState.textEdits.some(e => 
      e.pageIndex === item.pageIndex && 
      e.textItem.x === item.x && 
      e.textItem.y === item.y
    );
  };

  return (
    <div className="pdf-in-place-editor" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Toolbar */}
      <div style={{ 
        padding: '12px 16px', 
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        background: '#f9fafb'
      }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Edit PDF</h3>
        <div style={{ flex: 1 }} />

        <span style={{ fontSize: '13px', color: '#6b7280' }}>
          {editorState.textEdits.length} edit{editorState.textEdits.length !== 1 ? 's' : ''}
        </span>

        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button 
            onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}
            style={iconButtonStyle}
          >−</button>
          <span style={{ fontSize: '13px', minWidth: '48px', textAlign: 'center' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button 
            onClick={() => setZoom(z => Math.min(3, z + 0.1))}
            style={iconButtonStyle}
          >+</button>
        </div>

        <button 
          onClick={onCancel}
          style={{ ...buttonStyle, background: '#f3f4f6', color: '#374151' }}
        >
          Cancel
        </button>
        <button 
          onClick={applyEdits}
          disabled={isProcessing || editorState.textEdits.length === 0}
          style={{ 
            ...buttonStyle, 
            background: isProcessing ? '#9ca3af' : '#2563eb',
            color: 'white',
            cursor: isProcessing ? 'not-allowed' : 'pointer'
          }}
        >
          {isProcessing ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Page navigation + canvas */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Thumbnail sidebar */}
        <div style={{ 
          width: '180px', 
          borderRight: '1px solid #e5e7eb',
          overflowY: 'auto',
          padding: '8px',
          background: '#f9fafb'
        }}>
          {pages.map((page, idx) => (
            <div
              key={idx}
              onClick={() => setCurrentPage(idx)}
              style={{
                padding: '8px',
                marginBottom: '8px',
                borderRadius: '6px',
                cursor: 'pointer',
                background: currentPage === idx ? '#dbeafe' : 'white',
                border: `1px solid ${currentPage === idx ? '#3b82f6' : '#e5e7eb'}`,
                fontSize: '12px',
                textAlign: 'center',
              }}
            >
              <canvas
                ref={el => { canvasRefs.current[idx] = el; }}
                style={{ 
                  width: '100%', 
                  height: 'auto',
                  display: idx === currentPage ? 'none' : 'block'
                }}
              />
              <div>Page {idx + 1}</div>
              {pages[idx]?.textItems.some(t => 
                editorState.textEdits.some(e => e.pageIndex === idx && e.textItem.x === t.x && e.textItem.y === t.y)
              ) && (
                <span style={{ color: '#2563eb', fontSize: '10px' }}>● edited</span>
              )}
            </div>
          ))}
        </div>

        {/* Main editing area */}
        <div 
          ref={containerRef}
          style={{ 
            flex: 1, 
            overflow: 'auto',
            background: '#e5e7eb',
            padding: '24px',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          {pages[currentPage] && (
            <div style={{ 
              position: 'relative',
              transform: `scale(${zoom})`,
              transformOrigin: 'top center',
              transition: 'transform 0.2s',
            }}>
              {/* Background canvas */}
              <canvas
                ref={el => { 
                  if (el && !canvasRefs.current[currentPage]) {
                    canvasRefs.current[currentPage] = el;
                    // Re-render when ref is set
                    setTimeout(() => loadPDF(), 0);
                  }
                }}
                width={pages[currentPage].width}
                height={pages[currentPage].height}
                style={{
                  display: 'block',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                  background: 'white',
                }}
              />

              {/* Text overlays */}
              {pages[currentPage].textItems.map((item, idx) => {
                const editKey = `${item.pageIndex}-${item.x}-${item.y}`;
                const isEditing = editingItem === editKey;
                const edited = isEdited(item);

                return (
                  <div
                    key={idx}
                    onClick={() => !isEditing && handleTextClick(item)}
                    style={{
                      position: 'absolute',
                      left: item.x,
                      top: item.y - item.height,
                      minWidth: item.width,
                      minHeight: item.height,
                      fontSize: item.fontSize,
                      fontFamily: item.fontName.includes('Bold') || item.fontName.includes('bold') 
                        ? 'Helvetica-Bold, sans-serif' 
                        : 'Helvetica, Arial, sans-serif',
                      lineHeight: '1.2',
                      cursor: isEditing ? 'text' : 'pointer',
                      background: isEditing ? '#fef3c7' : edited ? '#dbeafe' : 'transparent',
                      border: isEditing ? '2px solid #f59e0b' : edited ? '1px solid #3b82f6' : '1px solid transparent',
                      borderRadius: '2px',
                      padding: '1px 2px',
                      whiteSpace: 'pre',
                      zIndex: isEditing ? 100 : 10,
                    }}
                  >
                    {isEditing ? (
                      <textarea
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={handleEditConfirm}
                        autoFocus
                        style={{
                          background: 'transparent',
                          border: 'none',
                          outline: 'none',
                          font: 'inherit',
                          width: '100%',
                          minHeight: item.height * 2,
                          resize: 'both',
                          padding: 0,
                          margin: 0,
                        }}
                      />
                    ) : (
                      <span style={{ 
                        color: edited ? '#2563eb' : 'inherit',
                      }}>
                        {getEditedText(item)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const buttonStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: '6px',
  border: 'none',
  fontSize: '14px',
  fontWeight: 500,
  cursor: 'pointer',
};

const iconButtonStyle: React.CSSProperties = {
  width: '28px',
  height: '28px',
  borderRadius: '4px',
  border: '1px solid #d1d5db',
  background: 'white',
  cursor: 'pointer',
  fontSize: '16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
