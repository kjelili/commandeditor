/**
 * Document Fingerprinting — Invisible Leak Detection
 * Embeds recipient-specific steganographic watermarks in text spacing
 */
class DocumentFingerprinter {
  constructor() {
    this.fingerprints = new Map();
    this.alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  }

  generateFingerprint(docId, recipient, options = {}) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const recipientHash = this.hashCode(recipient).toString(36).toUpperCase();
    const payload = `${docId}:${recipientHash}:${timestamp}`;

    const binary = payload.split('').map(c => 
      c.charCodeAt(0).toString(2).padStart(8, '0')
    ).join('');

    const fingerprint = {
      id: `fp_${Date.now()}`,
      docId,
      recipient,
      payload,
      binaryPattern: binary,
      createdAt: new Date().toISOString(),
      method: options.method || 'word_spacing',
      strength: options.strength || 0.1
    };

    this.fingerprints.set(fingerprint.id, fingerprint);
    return fingerprint;
  }

  async applyFingerprint(document, fingerprint) {
    const bits = fingerprint.binaryPattern.split('');
    let bitIndex = 0;
    const modifications = [];

    for (let pageNum = 1; pageNum <= document.numPages; pageNum++) {
      const page = await document.getPage(pageNum);
      const textContent = await page.getTextContent();

      for (const item of textContent.items) {
        if (bitIndex >= bits.length) break;
        const bit = bits[bitIndex];
        const spacingAdjustment = bit === '1' ? fingerprint.strength : -fingerprint.strength;

        modifications.push({
          page: pageNum,
          text: item.str,
          originalSpacing: 0,
          adjustedSpacing: spacingAdjustment,
          bit
        });
        bitIndex++;
      }
    }

    return {
      fingerprint,
      modificationsApplied: modifications.length,
      coverage: `${(bitIndex / bits.length * 100).toFixed(1)}%`,
      modifications
    };
  }

  async extractFingerprint(document) {
    const spacingVariations = [];

    for (let pageNum = 1; pageNum <= document.numPages; pageNum++) {
      const page = await document.getPage(pageNum);
      const textContent = await page.getTextContent();

      for (let i = 0; i < textContent.items.length - 1; i++) {
        const current = textContent.items[i];
        const next = textContent.items[i + 1];
        const expectedGap = this.estimateExpectedGap(current, next);
        const actualGap = next.transform[4] - (current.transform[4] + current.width);
        const variance = actualGap - expectedGap;

        if (Math.abs(variance) > 0.01) {
          spacingVariations.push({
            page: pageNum,
            variance,
            bit: variance > 0 ? '1' : '0'
          });
        }
      }
    }

    const extractedBits = spacingVariations.map(v => v.bit).join('');
    const payload = this.bitsToString(extractedBits);
    const match = this.findMatchingFingerprint(payload);

    return {
      extracted: payload,
      confidence: match ? 0.95 : 0.3,
      match: match || null,
      variationCount: spacingVariations.length
    };
  }

  generateVisibleWatermark(text, options = {}) {
    const {
      opacity = 0.08,
      rotation = -45,
      density = 'medium',
      color = [128, 128, 128]
    } = options;

    const repeats = density === 'low' ? 1 : density === 'medium' ? 3 : 5;

    return {
      type: 'visible_watermark',
      text,
      opacity,
      rotation,
      color,
      repeats,
      render: (ctx, width, height) => {
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.fillStyle = `rgb(${color.join(',')})`;
        ctx.font = '48px sans-serif';
        ctx.rotate(rotation * Math.PI / 180);

        for (let i = 0; i < repeats; i++) {
          const y = (height / repeats) * i + height / (repeats * 2);
          for (let x = -width; x < width * 2; x += 300) {
            ctx.fillText(text, x, y);
          }
        }
        ctx.restore();
      }
    };
  }

  bitsToString(bits) {
    const chars = [];
    for (let i = 0; i < bits.length; i += 8) {
      const byte = bits.slice(i, i + 8);
      if (byte.length === 8) {
        chars.push(String.fromCharCode(parseInt(byte, 2)));
      }
    }
    return chars.join('');
  }

  findMatchingFingerprint(payload) {
    for (const fp of this.fingerprints.values()) {
      if (payload.includes(fp.payload) || fp.payload.includes(payload)) {
        return fp;
      }
    }
    return null;
  }

  estimateExpectedGap(item1, item2) {
    const fontSize = item1.height || 12;
    return fontSize * 0.25;
  }

  hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}

export { DocumentFingerprinter };
