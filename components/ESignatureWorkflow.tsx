'use client';

/**
 * ESignatureWorkflow - Zero-knowledge multi-party signing
 * Legally binding signatures with cryptographic audit trails
 * No server stores documents or signatures
 * 
 * Integration: Add as "E-Sign Document" tool in CommandEditor
 */

import React, { useState, useRef, useCallback } from 'react';
import { PDFDocument, PDFPage, rgb } from 'pdf-lib';
import { cryptoSigner } from '../utils/cryptoSign';
import type { 
  SignerIdentity, 
  SignatureField, 
  SigningCertificate,
  AuditEntry 
} from '../types';

interface Props {
  pdfBytes: Uint8Array;
  fileName: string;
  onSave: (newBytes: Uint8Array, certificate: SigningCertificate) => void;
  onCancel: () => void;
}

type WorkflowStep = 'setup' | 'place_fields' | 'sign' | 'complete' | 'verify';

export const ESignatureWorkflow: React.FC<Props> = ({ pdfBytes, fileName, onSave, onCancel }) => {
  const [step, setStep] = useState<WorkflowStep>('setup');
  const [signers, setSigners] = useState<SignerIdentity[]>([]);
  const [currentSigner, setCurrentSigner] = useState<SignerIdentity | null>(null);
  const [fields, setFields] = useState<SignatureField[]>([]);
  const [certificate, setCertificate] = useState<SigningCertificate | null>(null);
  const [auditTrail, setAuditTrail] = useState<AuditEntry[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureImage, setSignatureImage] = useState<string>('');
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [pageDimensions, setPageDimensions] = useState({ width: 612, height: 792 }); // Default letter
  const [currentPage, setCurrentPage] = useState(0);
  const [numPages, setNumPages] = useState(1);
  const [verifyResult, setVerifyResult] = useState<{ valid: boolean; details: string[] } | null>(null);
  const [verifyFile, setVerifyFile] = useState<Uint8Array | null>(null);
  const [verifyCert, setVerifyCert] = useState<SigningCertificate | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  // Initialize from PDF
  React.useEffect(() => {
    loadPDFInfo();
  }, []);

  const loadPDFInfo = async () => {
    const pdf = await PDFDocument.load(pdfBytes);
    setNumPages(pdf.getPageCount());
    if (pdf.getPageCount() > 0) {
      const page = pdf.getPage(0);
      const { width, height } = page.getSize();
      setPageDimensions({ width, height });
    }
  };

  // ===== SETUP STEP =====
  const handleAddSigner = async (name: string, email: string) => {
    const identity = await cryptoSigner.generateIdentity(name, email);
    setSigners(prev => [...prev, identity]);
    if (!currentSigner) setCurrentSigner(identity);
  };

  const handleRemoveSigner = (id: string) => {
    setSigners(prev => prev.filter(s => s.id !== id));
    if (currentSigner?.id === id) {
      setCurrentSigner(signers.find(s => s.id !== id) || null);
    }
  };

  // ===== PLACE FIELDS STEP =====
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (step !== 'place_fields' || !currentSigner) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = pageDimensions.width / rect.width;
    const scaleY = pageDimensions.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = pageDimensions.height - ((e.clientY - rect.top) * scaleY); // PDF coords

    const newField: SignatureField = {
      id: `field_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      pageIndex: currentPage,
      x: x - 75, // Center on click
      y: y - 25,
      width: 150,
      height: 50,
      signerId: currentSigner.id,
      signed: false,
    };

    setFields(prev => [...prev, newField]);
  };

  const handleRemoveField = (fieldId: string) => {
    setFields(prev => prev.filter(f => f.id !== fieldId));
  };

  // ===== SIGN STEP =====
  const handleStartDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDrawingRef.current = true;
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    lastPosRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleDraw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();

    lastPosRef.current = { x, y };
  };

  const handleEndDrawing = () => {
    isDrawingRef.current = false;
    const canvas = sigCanvasRef.current;
    if (canvas) {
      setSignatureImage(canvas.toDataURL('image/png'));
    }
  };

  const handleClearSignature = () => {
    const canvas = sigCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setSignatureImage('');
    }
  };

  const handleTypeSignature = (text: string) => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'italic 32px "Brush Script MT", cursive';
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    setSignatureImage(canvas.toDataURL('image/png'));
  };

  const handleSignField = async (fieldId: string) => {
    if (!signatureImage || !currentSigner) return;

    const field = fields.find(f => f.id === fieldId);
    if (!field || field.signerId !== currentSigner.id) return;

    // Update field
    const updatedField: SignatureField = {
      ...field,
      signed: true,
      signatureData: signatureImage,
      timestamp: Date.now(),
    };

    setFields(prev => prev.map(f => f.id === fieldId ? updatedField : f));
    setSignatureImage('');
    handleClearSignature();

    // Add audit entry
    const entry = await cryptoSigner.createAuditEntry(
      'signed',
      currentSigner,
      await hashBytes(pdfBytes),
      { fieldId, pageIndex: field.pageIndex }
    );
    setAuditTrail(prev => [...prev, entry]);
  };

  // ===== COMPLETE =====
  const handleFinalize = async () => {
    setIsProcessing(true);
    try {
      const pdfDoc = await PDFDocument.load(pdfBytes);

      // Embed signature images into PDF
      for (const field of fields) {
        if (field.signed && field.signatureData) {
          const page = pdfDoc.getPage(field.pageIndex);
          const imageData = field.signatureData.split(',')[1];
          const imageBytes = Uint8Array.from(atob(imageData), c => c.charCodeAt(0));
          const embeddedImage = await pdfDoc.embedPng(imageBytes);

          page.drawImage(embeddedImage, {
            x: field.x,
            y: field.y,
            width: field.width,
            height: field.height,
          });

          // Add signature metadata
          page.drawText(`Signed by ${signers.find(s => s.id === field.signerId)?.name || 'Unknown'}`, {
            x: field.x,
            y: field.y - 12,
            size: 8,
            color: rgb(0.4, 0.4, 0.4),
          });
        }
      }

      const signedBytes = await pdfDoc.save();

      // Create certificate
      const cert = await cryptoSigner.createCertificate(
        fileName,
        signedBytes,
        signers,
        fields,
        auditTrail
      );

      setCertificate(cert);
      setStep('complete');
      onSave(signedBytes, cert);
    } catch (error) {
      alert('Signing failed: ' + (error as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  // ===== VERIFY =====
  const handleVerify = async () => {
    if (!verifyFile || !verifyCert) return;
    const result = await cryptoSigner.verifyCertificate(verifyCert, verifyFile);
    setVerifyResult(result);
  };

  const hashBytes = async (data: Uint8Array): Promise<string> => {
    const hash = await crypto.subtle.digest('SHA-256', data as BufferSource);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  };

  const [isProcessing, setIsProcessing] = useState(false);

  // Render canvas for field placement
  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#d1d5db';
    ctx.strokeRect(0, 0, canvas.width, canvas.height);

    // Draw fields
    fields.filter(f => f.pageIndex === currentPage).forEach(field => {
      const signer = signers.find(s => s.id === field.signerId);
      const color = field.signed ? '#22c55e' : '#f59e0b';

      ctx.fillStyle = field.signed ? '#dcfce7' : '#fef3c7';
      ctx.fillRect(
        (field.x / pageDimensions.width) * canvas.width,
        ((pageDimensions.height - field.y - field.height) / pageDimensions.height) * canvas.height,
        (field.width / pageDimensions.width) * canvas.width,
        (field.height / pageDimensions.height) * canvas.height
      );

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(
        (field.x / pageDimensions.width) * canvas.width,
        ((pageDimensions.height - field.y - field.height) / pageDimensions.height) * canvas.height,
        (field.width / pageDimensions.width) * canvas.width,
        (field.height / pageDimensions.height) * canvas.height
      );

      ctx.fillStyle = '#374151';
      ctx.font = '12px sans-serif';
      ctx.fillText(
        signer?.name || 'Unknown',
        (field.x / pageDimensions.width) * canvas.width + 4,
        ((pageDimensions.height - field.y - field.height) / pageDimensions.height) * canvas.height + 16
      );

      if (field.signed) {
        ctx.fillStyle = '#22c55e';
        ctx.fillText(
          '✓ SIGNED',
          (field.x / pageDimensions.width) * canvas.width + 4,
          ((pageDimensions.height - field.y - field.height) / pageDimensions.height) * canvas.height + 32
        );
      }
    });
  };

  React.useEffect(() => {
    renderCanvas();
  }, [fields, currentPage, pageDimensions]);

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
      {/* Progress indicator */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        {(['setup', 'place_fields', 'sign', 'complete'] as WorkflowStep[]).map((s, idx) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: step === s ? '#2563eb' : 
                         ['setup', 'place_fields', 'sign', 'complete'].indexOf(step) > idx ? '#22c55e' : '#e5e7eb',
              color: step === s || ['setup', 'place_fields', 'sign', 'complete'].indexOf(step) > idx ? 'white' : '#6b7280',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              fontWeight: 600,
            }}>
              {['setup', 'place_fields', 'sign', 'complete'].indexOf(step) > idx ? '✓' : idx + 1}
            </div>
            <span style={{ fontSize: '13px', color: '#6b7280', textTransform: 'capitalize' }}>
              {s.replace('_', ' ')}
            </span>
            {idx < 3 && <div style={{ width: '24px', height: '2px', background: '#e5e7eb' }} />}
          </div>
        ))}
      </div>

      {/* STEP: SETUP */}
      {step === 'setup' && (
        <div>
          <h2 style={{ marginBottom: '16px' }}>Who needs to sign?</h2>

          <div style={{ marginBottom: '24px' }}>
            {signers.map(signer => (
              <div key={signer.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px',
                background: '#f9fafb',
                borderRadius: '8px',
                marginBottom: '8px',
              }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: '#2563eb',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                }}>
                  {signer.name[0].toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{signer.name}</div>
                  <div style={{ fontSize: '13px', color: '#6b7280' }}>{signer.email}</div>
                </div>
                <button
                  onClick={() => handleRemoveSigner(signer.id)}
                  style={{ ...iconBtnStyle, color: '#dc2626' }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <SignerForm onAdd={handleAddSigner} />

          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button onClick={onCancel} style={{ ...btnStyle, background: '#f3f4f6', color: '#374151' }}>
              Cancel
            </button>
            <button 
              onClick={() => setStep('place_fields')}
              disabled={signers.length === 0}
              style={{ ...btnStyle, background: signers.length === 0 ? '#e5e7eb' : '#2563eb', color: 'white' }}
            >
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* STEP: PLACE FIELDS */}
      {step === 'place_fields' && (
        <div>
          <h2 style={{ marginBottom: '8px' }}>Place signature fields</h2>
          <p style={{ color: '#6b7280', marginBottom: '16px', fontSize: '14px' }}>
            Select a signer, then click on the page where they should sign.
          </p>

          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
            {signers.map(signer => (
              <button
                key={signer.id}
                onClick={() => setCurrentSigner(signer)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '20px',
                  border: '1px solid',
                  borderColor: currentSigner?.id === signer.id ? '#2563eb' : '#e5e7eb',
                  background: currentSigner?.id === signer.id ? '#dbeafe' : 'white',
                  color: currentSigner?.id === signer.id ? '#2563eb' : '#374151',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                {signer.name}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '16px' }}>
            <div>
              <canvas
                ref={canvasRef}
                width={400}
                height={520}
                onClick={handleCanvasClick}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  cursor: 'crosshair',
                  background: 'white',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '8px' }}>
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
            </div>

            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: '14px', marginBottom: '8px' }}>Fields ({fields.length})</h3>
              {fields.length === 0 && (
                <p style={{ color: '#9ca3af', fontSize: '13px' }}>No fields placed yet. Click on the page to add.</p>
              )}
              {fields.map(field => {
                const signer = signers.find(s => s.id === field.signerId);
                return (
                  <div key={field.id} style={{
                    padding: '10px',
                    background: '#f9fafb',
                    borderRadius: '6px',
                    marginBottom: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                  }}>
                    <span style={{ 
                      width: '8px', 
                      height: '8px', 
                      borderRadius: '50%', 
                      background: field.signed ? '#22c55e' : '#f59e0b' 
                    }} />
                    <span style={{ flex: 1 }}>
                      {signer?.name} — Page {field.pageIndex + 1}
                    </span>
                    <button onClick={() => handleRemoveField(field.id)} style={{ ...iconBtnStyle, color: '#dc2626' }}>
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button onClick={() => setStep('setup')} style={{ ...btnStyle, background: '#f3f4f6', color: '#374151' }}>
              ← Back
            </button>
            <button 
              onClick={() => setStep('sign')}
              disabled={fields.length === 0}
              style={{ ...btnStyle, background: fields.length === 0 ? '#e5e7eb' : '#2563eb', color: 'white' }}
            >
              Continue to Sign →
            </button>
          </div>
        </div>
      )}

      {/* STEP: SIGN */}
      {step === 'sign' && (
        <div>
          <h2 style={{ marginBottom: '16px' }}>Sign the document</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            {/* Signature pad */}
            <div>
              <h3 style={{ fontSize: '14px', marginBottom: '8px' }}>Your Signature</h3>
              <div style={{ border: '2px dashed #d1d5db', borderRadius: '8px', padding: '8px' }}>
                <canvas
                  ref={sigCanvasRef}
                  width={350}
                  height={120}
                  onMouseDown={handleStartDrawing}
                  onMouseMove={handleDraw}
                  onMouseUp={handleEndDrawing}
                  onMouseLeave={handleEndDrawing}
                  style={{
                    background: 'white',
                    borderRadius: '4px',
                    cursor: 'crosshair',
                    display: 'block',
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button onClick={handleClearSignature} style={{ ...btnStyle, fontSize: '12px', padding: '6px 12px' }}>
                  Clear
                </button>
                <span style={{ fontSize: '12px', color: '#6b7280', alignSelf: 'center' }}>
                  Or type your name:
                </span>
                <input
                  type="text"
                  placeholder="Type to sign"
                  onChange={e => handleTypeSignature(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '4px',
                    border: '1px solid #d1d5db',
                    fontSize: '13px',
                    flex: 1,
                  }}
                />
              </div>
            </div>

            {/* Fields to sign */}
            <div>
              <h3 style={{ fontSize: '14px', marginBottom: '8px' }}>Your Fields</h3>
              {fields.filter(f => f.signerId === currentSigner?.id && !f.signed).length === 0 && (
                <p style={{ color: '#22c55e', fontSize: '14px' }}>✓ All your fields are signed!</p>
              )}
              {fields
                .filter(f => f.signerId === currentSigner?.id && !f.signed)
                .map(field => (
                  <div key={field.id} style={{
                    padding: '12px',
                    background: '#fef3c7',
                    borderRadius: '8px',
                    marginBottom: '8px',
                  }}>
                    <div style={{ fontSize: '13px', marginBottom: '8px' }}>
                      Page {field.pageIndex + 1}
                    </div>
                    <button
                      onClick={() => handleSignField(field.id)}
                      disabled={!signatureImage}
                      style={{
                        ...btnStyle,
                        background: signatureImage ? '#2563eb' : '#e5e7eb',
                        color: 'white',
                        fontSize: '13px',
                        width: '100%',
                      }}
                    >
                      {signatureImage ? 'Apply Signature' : 'Draw signature first'}
                    </button>
                  </div>
                ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button onClick={() => setStep('place_fields')} style={{ ...btnStyle, background: '#f3f4f6', color: '#374151' }}>
              ← Back
            </button>
            <button 
              onClick={handleFinalize}
              disabled={isProcessing || fields.some(f => !f.signed)}
              style={{ 
                ...btnStyle, 
                background: isProcessing || fields.some(f => !f.signed) ? '#e5e7eb' : '#22c55e', 
                color: 'white' 
              }}
            >
              {isProcessing ? 'Finalizing...' : 'Finalize Document'}
            </button>
          </div>
        </div>
      )}

      {/* STEP: COMPLETE */}
      {step === 'complete' && certificate && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '64px', marginBottom: '16px' }}>🎉</div>
          <h2 style={{ marginBottom: '8px' }}>Document Signed!</h2>
          <p style={{ color: '#6b7280', marginBottom: '24px' }}>
            Your document has been cryptographically signed with a complete audit trail.
          </p>

          <div style={{ 
            background: '#f0fdf4', 
            border: '1px solid #bbf7d0',
            borderRadius: '8px',
            padding: '16px',
            textAlign: 'left',
            marginBottom: '24px',
          }}>
            <h3 style={{ fontSize: '14px', marginBottom: '8px' }}>Certificate Details</h3>
            <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.8 }}>
              <div><strong>Certificate ID:</strong> {certificate.certificateId.slice(0, 16)}...</div>
              <div><strong>Document Hash:</strong> {certificate.documentHash.slice(0, 16)}...</div>
              <div><strong>Signers:</strong> {certificate.signers.map(s => s.name).join(', ')}</div>
              <div><strong>Signed:</strong> {new Date(certificate.createdAt).toLocaleString()}</div>
              <div><strong>Fields:</strong> {certificate.signatureFields.length}</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify(certificate, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${fileName.replace('.pdf', '')}_certificate.json`;
              a.click();
            }}
            style={{ ...btnStyle, background: '#2563eb', color: 'white' }}
          >
            Download Certificate
          </button>

          {/* v10: Qualified/eIDAS bridge — package the digest + signature so a
              Qualified Trust Service Provider can upgrade this to a legally
              qualified signature without ever seeing the document itself. */}
          <button
            onClick={async () => {
              try {
                const { buildSigningPackage } = await import('@/utils/enterprise');
                const file = new File([pdfBytes as unknown as BlobPart], fileName, { type: 'application/pdf' });
                const pkg = await buildSigningPackage(file, JSON.stringify({
                  algorithm: 'ECDSA-P256-SHA256',
                  signature: certificate.auditTrail.find(a => a.signature)?.signature || '',
                  publicKey: (certificate.auditTrail.find(a => a.signature) as any)?.publicKey || null,
                  signer: certificate.signers.map(s => s.name).join(', '),
                  timestamp: new Date(certificate.createdAt).toISOString(),
                  certificateId: certificate.certificateId,
                  documentHash: certificate.documentHash,
                }));
                const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${fileName.replace('.pdf', '')}_tsp-package.json`;
                a.click();
              } catch { /* package export is best-effort */ }
            }}
            style={{ ...btnStyle, background: '#0d9488', color: 'white' }}
            title="Export a TSP-ready package: document digest + signature, with instructions for a Qualified Trust Service Provider to countersign"
          >
            🏛 Export TSP-Ready Package
          </button>
          </div>
        </div>
      )}

      {/* VERIFY MODE */}
      {step === 'verify' && (
        <div>
          <h2 style={{ marginBottom: '16px' }}>Verify Signed Document</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 500 }}>Signed PDF</label>
              <input 
                type="file" 
                accept=".pdf"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) {
                    file.arrayBuffer().then(buf => setVerifyFile(new Uint8Array(buf)));
                  }
                }}
                style={{ display: 'block', marginTop: '4px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 500 }}>Certificate (.json)</label>
              <input 
                type="file" 
                accept=".json"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) {
                    file.text().then(text => setVerifyCert(JSON.parse(text)));
                  }
                }}
                style={{ display: 'block', marginTop: '4px' }}
              />
            </div>
            <button 
              onClick={handleVerify}
              disabled={!verifyFile || !verifyCert}
              style={{ ...btnStyle, background: '#2563eb', color: 'white', alignSelf: 'flex-start' }}
            >
              Verify
            </button>
          </div>

          {verifyResult && (
            <div style={{
              padding: '16px',
              borderRadius: '8px',
              background: verifyResult.valid ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${verifyResult.valid ? '#bbf7d0' : '#fecaca'}`,
            }}>
              <h3 style={{ 
                color: verifyResult.valid ? '#166534' : '#dc2626',
                marginBottom: '8px' 
              }}>
                {verifyResult.valid ? '✓ Document is valid' : '✗ Verification failed'}
              </h3>
              {verifyResult.details.map((d, i) => (
                <div key={i} style={{ fontSize: '13px', color: '#374151', lineHeight: 1.8 }}>{d}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Sub-component: Signer form
const SignerForm: React.FC<{ onAdd: (name: string, email: string) => void }> = ({ onAdd }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
      <div style={{ flex: 1 }}>
        <label style={{ fontSize: '13px', fontWeight: 500 }}>Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="John Doe"
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            fontSize: '14px',
            marginTop: '4px',
          }}
        />
      </div>
      <div style={{ flex: 1 }}>
        <label style={{ fontSize: '13px', fontWeight: 500 }}>Email</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="john@example.com"
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            fontSize: '14px',
            marginTop: '4px',
          }}
        />
      </div>
      <button
        onClick={() => {
          if (name && email) {
            onAdd(name, email);
            setName('');
            setEmail('');
          }
        }}
        disabled={!name || !email}
        style={{
          ...btnStyle,
          background: !name || !email ? '#e5e7eb' : '#2563eb',
          color: 'white',
          height: '38px',
        }}
      >
        Add Signer
      </button>
    </div>
  );
};

const btnStyle: React.CSSProperties = {
  padding: '10px 20px',
  borderRadius: '6px',
  border: 'none',
  fontSize: '14px',
  fontWeight: 500,
  cursor: 'pointer',
};

const iconBtnStyle: React.CSSProperties = {
  width: '28px',
  height: '28px',
  borderRadius: '4px',
  border: '1px solid #e5e7eb',
  background: 'white',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
