/**
 * Barcode & QR Code Suite for CommandEditor — completed implementation.
 * Generation: bwip-js (all major 1D/2D symbologies, client-side)
 * Reading:    jsqr (QR codes only — reading other symbologies would need a
 *             heavier decoder; noted in the UI)
 * All processing happens in the browser. Zero-knowledge preserved.
 */

import bwipjs from 'bwip-js';
import jsQR from 'jsqr';

class BarcodeSuite {
  constructor() {
    // label → bwip-js bcid
    this.supportedFormats = [
      { id: 'qrcode',            bcid: 'qrcode',              name: 'QR Code' },
      { id: 'datamatrix',        bcid: 'datamatrix',          name: 'Data Matrix' },
      { id: 'pdf417',            bcid: 'pdf417',              name: 'PDF417' },
      { id: 'azteccode',         bcid: 'azteccode',           name: 'Aztec Code' },
      { id: 'code128',           bcid: 'code128',             name: 'Code 128' },
      { id: 'code39',            bcid: 'code39',              name: 'Code 39' },
      { id: 'code93',            bcid: 'code93',              name: 'Code 93' },
      { id: 'ean13',             bcid: 'ean13',               name: 'EAN-13' },
      { id: 'ean8',              bcid: 'ean8',                name: 'EAN-8' },
      { id: 'upca',              bcid: 'upca',                name: 'UPC-A' },
      { id: 'upce',              bcid: 'upce',                name: 'UPC-E' },
      { id: 'interleaved2of5',   bcid: 'interleaved2of5',     name: 'ITF (Interleaved 2 of 5)' },
      { id: 'codabar',           bcid: 'rationalizedCodabar', name: 'Codabar' },
    ];
  }

  /**
   * Generate a barcode onto a canvas. Returns { canvas, dataUrl }.
   * options: { format, data, scale=3, height=10, includeText=true }
   */
  async generate(options) {
    const { format = 'qrcode', data, scale = 3, height = 10, includeText = true } = options;
    if (!data) throw new Error('No data to encode');
    const fmt = this.supportedFormats.find(f => f.id === format);
    if (!fmt) throw new Error(`Unsupported format: ${format}`);
    const validation = this.validateData(format, data);
    if (!validation.valid) throw new Error(validation.message);

    const canvas = document.createElement('canvas');
    bwipjs.toCanvas(canvas, {
      bcid: fmt.bcid,
      text: data,
      scale,
      height,
      includetext: includeText && !this.is2D(format),
      textxalign: 'center',
    });
    return { canvas, dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
  }

  is2D(format) {
    return ['qrcode', 'datamatrix', 'pdf417', 'azteccode'].includes(format);
  }

  /** Generate many barcodes: items = [{format, data, ...}] */
  async generateBatch(items) {
    const results = [];
    for (const item of items) {
      try { results.push({ ok: true, item, ...(await this.generate(item)) }) }
      catch (e) { results.push({ ok: false, item, error: e.message }) }
    }
    return results;
  }

  /** Read a QR code from raw ImageData. Returns { data, location } or null. */
  readQR(imageData) {
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    return code ? { data: code.data, location: code.location } : null;
  }

  /**
   * Scan one pdf.js page for QR codes. Renders at `scale` and runs jsqr.
   * Returns { page: n, data } or null.
   */
  async scanPDFPage(page, pageNumber, options = {}) {
    const { scale = 2 } = options;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = this.readQR(imageData);
    return result ? { page: pageNumber, data: result.data } : null;
  }

  /**
   * Insert a barcode into a pdf-lib document.
   * position: { xPct, yPct, widthPt } — x/y as % of page from top-left.
   */
  async insertIntoPDF(pdfDoc, pageNumber, barcodeConfig, position) {
    const { dataUrl, width, height } = await this.generate(barcodeConfig);
    const png = await pdfDoc.embedPng(await (await fetch(dataUrl)).arrayBuffer());
    const pages = pdfDoc.getPages();
    const page = pages[Math.min(pageNumber - 1, pages.length - 1)];
    const { width: pw, height: ph } = page.getSize();
    const drawW = position.widthPt || 120;
    const drawH = drawW * (height / width);
    const x = (position.xPct / 100) * pw;
    const y = ph - (position.yPct / 100) * ph - drawH; // top-left % → PDF bottom-left coords
    page.drawImage(png, { x, y, width: drawW, height: drawH });
    return pdfDoc;
  }

  validateData(format, data) {
    const numeric = /^\d+$/;
    switch (format) {
      case 'ean13': return numeric.test(data) && (data.length === 12 || data.length === 13)
        ? { valid: true } : { valid: false, message: 'EAN-13 needs 12–13 digits' };
      case 'ean8': return numeric.test(data) && (data.length === 7 || data.length === 8)
        ? { valid: true } : { valid: false, message: 'EAN-8 needs 7–8 digits' };
      case 'upca': return numeric.test(data) && (data.length === 11 || data.length === 12)
        ? { valid: true } : { valid: false, message: 'UPC-A needs 11–12 digits' };
      case 'upce': return numeric.test(data) && data.length >= 6 && data.length <= 8
        ? { valid: true } : { valid: false, message: 'UPC-E needs 6–8 digits' };
      case 'interleaved2of5': return numeric.test(data)
        ? { valid: true } : { valid: false, message: 'ITF accepts digits only' };
      case 'code39': return /^[0-9A-Z\-. $/+%]+$/.test(data)
        ? { valid: true } : { valid: false, message: 'Code 39: uppercase letters, digits, and -. $/+% only' };
      default: return data.length > 0 ? { valid: true } : { valid: false, message: 'Data is empty' };
    }
  }
}

export { BarcodeSuite };
export default BarcodeSuite;
