'use client';

/**
 * FormBuilder - Create interactive PDF forms with drag-and-drop
 * Generates PDF with AcroForm fields using pdf-lib
 * 
 * Integration: Add as "Create Form" tool in CommandEditor
 */

import React, { useState, useRef, useCallback } from 'react';
import { PDFDocument, PDFPage, PDFTextField, PDFCheckBox, PDFDropdown, PDFFont, StandardFonts, rgb } from 'pdf-lib';
import type { FormField, FormTemplate } from '../types';

interface Props {
  pdfBytes?: Uint8Array; // Optional: add fields to existing PDF
  onSave: (newBytes: Uint8Array, fileName: string) => void;
  onCancel: () => void;
}

const FIELD_TYPES: { type: FormField['type']; label: string; icon: string; defaultWidth: number; defaultHeight: number }[] = [
  { type: 'text', label: 'Text Field', icon: '📝', defaultWidth: 150, defaultHeight: 24 },
  { type: 'textarea', label: 'Text Area', icon: '📃', defaultWidth: 200, defaultHeight: 80 },
  { type: 'checkbox', label: 'Checkbox', icon: '☑️', defaultWidth: 20, defaultHeight: 20 },
  { type: 'radio', label: 'Radio Group', icon: '🔘', defaultWidth: 20, defaultHeight: 20 },
  { type: 'dropdown', label: 'Dropdown', icon: '🔽', defaultWidth: 150, defaultHeight: 24 },
  { type: 'date', label: 'Date Picker', icon: '📅', defaultWidth: 130, defaultHeight: 24 },
  { type: 'number', label: 'Number', icon: '🔢', defaultWidth: 100, defaultHeight: 24 },
  { type: 'signature', label: 'Signature', icon: '✍️', defaultWidth: 200, defaultHeight: 60 },
];

export const FormBuilder: React.FC<Props> = ({ pdfBytes, onSave, onCancel }) => {
  const [fields, setFields] = useState<FormField[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [numPages, setNumPages] = useState(1);
  const [pageDimensions, setPageDimensions] = useState({ width: 612, height: 792 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [formTitle, setFormTitle] = useState('');

  const canvasRef = useRef<HTMLDivElement>(null);

  // Load existing PDF or create blank
  React.useEffect(() => {
    if (pdfBytes) {
      loadExistingPDF();
    }
  }, [pdfBytes]);

  const loadExistingPDF = async () => {
    if (!pdfBytes) return;
    const pdf = await PDFDocument.load(pdfBytes);
    setNumPages(pdf.getPageCount());
    if (pdf.getPageCount() > 0) {
      const page = pdf.getPage(0);
      const { width, height } = page.getSize();
      setPageDimensions({ width, height });
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = pageDimensions.width / rect.width;
    const scaleY = pageDimensions.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = pageDimensions.height - ((e.clientY - rect.top) * scaleY);

    // Check if clicked on existing field
    const clickedField = fields.find(f => 
      f.pageIndex === currentPage &&
      x >= f.x && x <= f.x + f.width &&
      y >= f.y && y <= f.y + f.height
    );

    if (clickedField) {
      setSelectedFieldId(clickedField.id);
      return;
    }

    // If a field type is "selected" from toolbar (you'd track this in state)
    // For now, default to text field
    const fieldType = (window as any).__selectedFieldType || 'text';
    const typeConfig = FIELD_TYPES.find(t => t.type === fieldType) || FIELD_TYPES[0];

    const newField: FormField = {
      id: `field_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      type: fieldType,
      name: `field_${fields.length + 1}`,
      label: `Field ${fields.length + 1}`,
      pageIndex: currentPage,
      x: x - typeConfig.defaultWidth / 2,
      y: y - typeConfig.defaultHeight / 2,
      width: typeConfig.defaultWidth,
      height: typeConfig.defaultHeight,
      required: false,
      fontSize: 12,
      fontColor: '#000000',
    };

    setFields(prev => [...prev, newField]);
    setSelectedFieldId(newField.id);
  };

  const handleFieldDragStart = (e: React.MouseEvent, fieldId: string) => {
    e.stopPropagation();
    setIsDragging(true);
    setSelectedFieldId(fieldId);

    const field = fields.find(f => f.id === fieldId);
    if (!field) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = pageDimensions.width / rect.width;

    setDragOffset({
      x: (e.clientX - rect.left) * scaleX - field.x,
      y: (e.clientY - rect.top) * scaleX - (pageDimensions.height - field.y - field.height),
    });
  };

  const handleFieldDrag = (e: React.MouseEvent) => {
    if (!isDragging || !selectedFieldId) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = pageDimensions.width / rect.width;

    const x = (e.clientX - rect.left) * scaleX - dragOffset.x;
    const y = pageDimensions.height - ((e.clientY - rect.top) * scaleX) - dragOffset.y;

    setFields(prev => prev.map(f => 
      f.id === selectedFieldId 
        ? { ...f, x: Math.max(0, x), y: Math.max(0, y) }
        : f
    ));
  };

  const handleFieldDragEnd = () => {
    setIsDragging(false);
  };

  const updateField = (id: string, updates: Partial<FormField>) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const deleteField = (id: string) => {
    setFields(prev => prev.filter(f => f.id !== id));
    if (selectedFieldId === id) setSelectedFieldId(null);
  };

  const handleGeneratePDF = async () => {
    try {
      let pdfDoc: PDFDocument;

      if (pdfBytes) {
        pdfDoc = await PDFDocument.load(pdfBytes);
      } else {
        pdfDoc = await PDFDocument.create();
        pdfDoc.addPage([pageDimensions.width, pageDimensions.height]);
      }

      const form = pdfDoc.getForm();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

      for (const field of fields) {
        const page = pdfDoc.getPage(field.pageIndex);

        switch (field.type) {
          case 'text':
          case 'number':
          case 'date': {
            const textField = form.createTextField(field.name);
            textField.addToPage(page, {
              x: field.x,
              y: field.y,
              width: field.width,
              height: field.height,
              borderWidth: 1,
              borderColor: rgb(0.7, 0.7, 0.7),
              backgroundColor: rgb(0.95, 0.95, 0.95),
            });
            if (field.defaultValue) textField.setText(field.defaultValue);
            if (field.required) {
              // pdf-lib doesn't have built-in required, but we can add JS
            }
            break;
          }

          case 'textarea': {
            const textArea = form.createTextField(field.name);
            textArea.addToPage(page, {
              x: field.x,
              y: field.y,
              width: field.width,
              height: field.height,
              borderWidth: 1,
              borderColor: rgb(0.7, 0.7, 0.7),
              backgroundColor: rgb(0.95, 0.95, 0.95),
            });
            textArea.enableMultiline();
            break;
          }

          case 'checkbox': {
            const checkBox = form.createCheckBox(field.name);
            checkBox.addToPage(page, {
              x: field.x,
              y: field.y,
              width: field.width,
              height: field.height,
              borderWidth: 1,
              borderColor: rgb(0.7, 0.7, 0.7),
            });
            break;
          }

          case 'dropdown': {
            const dropdown = form.createDropdown(field.name);
            dropdown.addToPage(page, {
              x: field.x,
              y: field.y,
              width: field.width,
              height: field.height,
              borderWidth: 1,
              borderColor: rgb(0.7, 0.7, 0.7),
              backgroundColor: rgb(0.95, 0.95, 0.95),
            });
            if (field.options) {
              dropdown.addOptions(field.options);
            }
            break;
          }

          case 'signature': {
            // Create a signature field (placeholder)
            const sigField = form.createTextField(`${field.name}_sig`);
            sigField.addToPage(page, {
              x: field.x,
              y: field.y,
              width: field.width,
              height: field.height,
              borderWidth: 1,
              borderColor: rgb(0.7, 0.7, 0.7),
              backgroundColor: rgb(0.98, 0.98, 0.98),
            });
            // Add label
            page.drawText('Signature:', {
              x: field.x,
              y: field.y + field.height + 4,
              size: 10,
              color: rgb(0.4, 0.4, 0.4),
            });
            break;
          }
        }

        // Draw field label
        if (field.label && field.type !== 'signature') {
          page.drawText(field.label + (field.required ? ' *' : ''), {
            x: field.x,
            y: field.y + field.height + 4,
            size: 10,
            color: rgb(0.3, 0.3, 0.3),
          });
        }
      }

      const newBytes = await pdfDoc.save();
      onSave(newBytes, formTitle ? `${formTitle}.pdf` : 'form.pdf');
    } catch (error) {
      console.error('Form generation failed:', error);
      alert('Failed to generate form: ' + (error as Error).message);
    }
  };

  const selectedField = fields.find(f => f.id === selectedFieldId);

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Sidebar */}
      <div style={{
        width: '280px',
        borderRight: '1px solid #e5e7eb',
        background: '#f9fafb',
        padding: '16px',
        overflowY: 'auto',
      }}>
        <h3 style={{ marginBottom: '16px', fontSize: '16px' }}>Form Builder</h3>

        {/* Form title */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>Form Title</label>
          <input
            type="text"
            value={formTitle}
            onChange={e => setFormTitle(e.target.value)}
            placeholder="My Form"
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              fontSize: '13px',
              marginTop: '4px',
            }}
          />
        </div>

        {/* Field type palette */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '8px', display: 'block' }}>
            Field Types
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {FIELD_TYPES.map(ft => (
              <button
                key={ft.type}
                onClick={() => { (window as any).__selectedFieldType = ft.type; }}
                style={{
                  padding: '8px',
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb',
                  background: 'white',
                  cursor: 'pointer',
                  fontSize: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span>{ft.icon}</span>
                <span>{ft.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Field properties */}
        {selectedField && (
          <div style={{
            background: 'white',
            borderRadius: '8px',
            padding: '12px',
            border: '1px solid #e5e7eb',
          }}>
            <h4 style={{ fontSize: '13px', marginBottom: '10px' }}>Field Properties</h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#6b7280' }}>Label</label>
                <input
                  type="text"
                  value={selectedField.label}
                  onChange={e => updateField(selectedField.id, { label: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '6px',
                    borderRadius: '4px',
                    border: '1px solid #d1d5db',
                    fontSize: '12px',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#6b7280' }}>Name</label>
                <input
                  type="text"
                  value={selectedField.name}
                  onChange={e => updateField(selectedField.id, { name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '6px',
                    borderRadius: '4px',
                    border: '1px solid #d1d5db',
                    fontSize: '12px',
                  }}
                />
              </div>

              {selectedField.type === 'dropdown' && (
                <div>
                  <label style={{ fontSize: '11px', color: '#6b7280' }}>Options (comma-separated)</label>
                  <input
                    type="text"
                    value={selectedField.options?.join(', ') || ''}
                    onChange={e => updateField(selectedField.id, { options: e.target.value.split(',').map(s => s.trim()) })}
                    style={{
                      width: '100%',
                      padding: '6px',
                      borderRadius: '4px',
                      border: '1px solid #d1d5db',
                      fontSize: '12px',
                    }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  checked={selectedField.required}
                  onChange={e => updateField(selectedField.id, { required: e.target.checked })}
                  id="required"
                />
                <label htmlFor="required" style={{ fontSize: '12px' }}>Required</label>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => deleteField(selectedField.id)}
                  style={{
                    flex: 1,
                    padding: '6px',
                    background: '#fef2f2',
                    color: '#dc2626',
                    border: '1px solid #fecaca',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Field list */}
        <div style={{ marginTop: '16px' }}>
          <h4 style={{ fontSize: '13px', marginBottom: '8px' }}>Fields ({fields.length})</h4>
          {fields.map(field => (
            <div
              key={field.id}
              onClick={() => setSelectedFieldId(field.id)}
              style={{
                padding: '8px',
                borderRadius: '4px',
                marginBottom: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                background: selectedFieldId === field.id ? '#dbeafe' : 'white',
                border: `1px solid ${selectedFieldId === field.id ? '#3b82f6' : '#e5e7eb'}`,
              }}
            >
              <div style={{ fontWeight: 500 }}>{field.label}</div>
              <div style={{ color: '#6b7280', fontSize: '11px' }}>
                {field.type} • Page {field.pageIndex + 1}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Canvas area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Toolbar */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button 
              onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
              style={iconBtnStyle}
            >
              ←
            </button>
            <span style={{ fontSize: '14px', padding: '4px 12px' }}>
              Page {currentPage + 1} of {numPages}
            </span>
            <button 
              onClick={() => setCurrentPage(Math.min(numPages - 1, currentPage + 1))}
              disabled={currentPage === numPages - 1}
              style={iconBtnStyle}
            >
              →
            </button>
          </div>

          <div style={{ flex: 1 }} />

          <button 
            onClick={onCancel}
            style={{ ...btnStyle, background: '#f3f4f6', color: '#374151' }}
          >
            Cancel
          </button>
          <button 
            onClick={handleGeneratePDF}
            disabled={fields.length === 0}
            style={{ 
              ...btnStyle, 
              background: fields.length === 0 ? '#e5e7eb' : '#2563eb', 
              color: 'white' 
            }}
          >
            Generate PDF Form
          </button>
        </div>

        {/* Page canvas */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          background: '#e5e7eb',
          padding: '24px',
          display: 'flex',
          justifyContent: 'center',
        }}>
          <div
            ref={canvasRef}
            onClick={handleCanvasClick}
            onMouseMove={handleFieldDrag}
            onMouseUp={handleFieldDragEnd}
            style={{
              width: `${pageDimensions.width * 0.6}px`,
              height: `${pageDimensions.height * 0.6}px`,
              background: 'white',
              position: 'relative',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
              cursor: isDragging ? 'grabbing' : 'crosshair',
            }}
          >
            {fields.filter(f => f.pageIndex === currentPage).map(field => (
              <div
                key={field.id}
                onMouseDown={e => handleFieldDragStart(e, field.id)}
                style={{
                  position: 'absolute',
                  left: `${(field.x / pageDimensions.width) * 100}%`,
                  top: `${((pageDimensions.height - field.y - field.height) / pageDimensions.height) * 100}%`,
                  width: `${(field.width / pageDimensions.width) * 100}%`,
                  height: `${(field.height / pageDimensions.height) * 100}%`,
                  background: selectedFieldId === field.id ? '#dbeafe' : 'rgba(255,255,255,0.9)',
                  border: `2px dashed ${selectedFieldId === field.id ? '#3b82f6' : '#9ca3af'}`,
                  borderRadius: '4px',
                  cursor: 'grab',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  color: '#6b7280',
                  userSelect: 'none',
                }}
              >
                {field.label}
                {field.required && <span style={{ color: '#dc2626' }}>*</span>}
              </div>
            ))}
          </div>
        </div>
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
