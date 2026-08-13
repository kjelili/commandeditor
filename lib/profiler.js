/**
 * Smart Document Profiler
 * Auto-detects document type and suggests optimal tools/settings
 * Uses heuristics, keyword analysis, and structural detection
 */

class DocumentProfiler {
  constructor() {
    this.profiles = new Map();
    this.registerDefaultProfiles();
  }

  registerDefaultProfiles() {
    this.profiles.set('invoice', {
      name: 'Invoice / Receipt',
      keywords: ['invoice', 'receipt', 'bill to', 'ship to', 'total', 'subtotal', 'tax', 'amount due', 'payment due', 'po number', 'invoice #'],
      patterns: [
        /invoice\s*#?\s*:?\s*\d+/i,
        /total\s*[:\-]?\s*[$€£]?\s*[\d,]+\.?\d*/i,
        /amount\s*due/i,
        /bill\s*to/i
      ],
      suggestedTools: ['invoice-parser', 'ocr-enhance', 'table-extract', 'redaction'],
      suggestedSettings: { dpi: 300, colorMode: 'auto', compression: 'lossless' },
      confidenceThreshold: 0.6
    });

    this.profiles.set('contract', {
      name: 'Legal Contract',
      keywords: ['agreement', 'contract', 'party', 'parties', 'hereby', 'whereas', 'witnesseth', 'termination', 'liability', 'indemnification', 'governing law'],
      patterns: [
        /this\s+agreement\s+is\s+made/i,
        /between\s+.+\s+and\s+.+/i,
        /witnesseth/i,
        /in\s+witness\s+whereof/i,
        /governing\s+law/i
      ],
      suggestedTools: ['clause-extractor', 'redaction', 'comparison', 'annotation-layers', 'fingerprinting'],
      suggestedSettings: { dpi: 400, colorMode: 'bw', compression: 'zip' },
      confidenceThreshold: 0.65
    });

    this.profiles.set('academic', {
      name: 'Academic Paper',
      keywords: ['abstract', 'introduction', 'methodology', 'results', 'discussion', 'conclusion', 'references', 'doi', 'fig.', 'table', 'et al'],
      patterns: [
        /doi:\s*10\.\d+\//i,
        /abstract\s*\n/i,
        /references?\s*\n/i,
        /et\s+al\.?/i,
        /fig(ure)?\.?\s*\d+/i
      ],
      suggestedTools: ['citation-extractor', 'smart-toc', 'annotation-layers', 'ocr-enhance'],
      suggestedSettings: { dpi: 300, colorMode: 'auto', compression: 'jpeg-medium' },
      confidenceThreshold: 0.55
    });

    this.profiles.set('form', {
      name: 'Fillable Form',
      keywords: ['form', 'field', 'checkbox', 'signature', 'date', 'ssn', 'social security', 'application'],
      patterns: [
        /\[\s*\]/g,
        /signature\s*[:\-]?/i,
        /date\s*[:\-]?\s*[_\s]+/i,
        /print\s+name/i
      ],
      suggestedTools: ['form-autofill', 'field-detection', 'signature-pad'],
      suggestedSettings: { dpi: 200, colorMode: 'auto', compression: 'jpeg-low' },
      confidenceThreshold: 0.5
    });

    this.profiles.set('brochure', {
      name: 'Marketing Brochure',
      keywords: ['brochure', 'catalog', 'product', 'features', 'benefits', 'contact us', 'learn more', 'call now'],
      patterns: [
        /www\.[a-z0-9.-]+\.[a-z]{2,}/i,
        /1-\d{3}-\d{3}-\d{4}/,
        /©\s*\d{4}/
      ],
      suggestedTools: ['image-extract', 'link-detection', 'color-analysis'],
      suggestedSettings: { dpi: 150, colorMode: 'color', compression: 'jpeg-high' },
      confidenceThreshold: 0.45
    });

    this.profiles.set('scan', {
      name: 'Scanned Document',
      keywords: [],
      patterns: [],
      suggestedTools: ['ocr', 'deskew', 'denoise', 'contrast-enhance'],
      suggestedSettings: { dpi: 300, colorMode: 'auto', compression: 'jpeg-medium' },
      confidenceThreshold: 0.0,
      isScanned: true
    });
  }

  /**
   * Analyze a PDF document and return detected profiles with confidence scores
   */
  async analyze(document) {
    const textContent = await this.extractText(document);
    const metadata = await this.getMetadata(document);
    const pageCount = document.numPages || 1;

    const results = [];

    for (const [type, profile] of this.profiles) {
      if (type === 'scan') continue; // Handle separately

      const score = this.calculateScore(textContent, metadata, profile);
      if (score >= profile.confidenceThreshold) {
        results.push({
          type,
          name: profile.name,
          confidence: Math.min(score, 1.0),
          suggestedTools: profile.suggestedTools,
          suggestedSettings: profile.suggestedSettings,
          matchedKeywords: this.getMatchedKeywords(textContent, profile),
          matchedPatterns: this.getMatchedPatterns(textContent, profile)
        });
      }
    }

    // Detect if scanned
    const isScanned = await this.detectScanned(document, textContent);
    if (isScanned) {
      const scanProfile = this.profiles.get('scan');
      results.push({
        type: 'scan',
        name: scanProfile.name,
        confidence: isScanned.confidence,
        suggestedTools: scanProfile.suggestedTools,
        suggestedSettings: scanProfile.suggestedSettings,
        reason: isScanned.reason
      });
    }

    // Sort by confidence
    results.sort((a, b) => b.confidence - a.confidence);

    return {
      primary: results[0] || null,
      all: results,
      metadata: {
        pageCount,
        hasText: textContent.length > 100,
        textLength: textContent.length,
        estimatedWordCount: textContent.split(/\s+/).length
      }
    };
  }

  calculateScore(text, metadata, profile) {
    let score = 0;
    const textLower = text.toLowerCase();

    // Keyword matching
    let keywordMatches = 0;
    for (const keyword of profile.keywords) {
      if (textLower.includes(keyword.toLowerCase())) {
        keywordMatches++;
      }
    }
    score += (keywordMatches / Math.max(profile.keywords.length, 1)) * 0.4;

    // Pattern matching
    let patternMatches = 0;
    for (const pattern of profile.patterns) {
      if (pattern.test(text)) {
        patternMatches++;
      }
    }
    score += (patternMatches / Math.max(profile.patterns.length, 1)) * 0.4;

    // Metadata hints
    if (metadata.title) {
      const titleLower = metadata.title.toLowerCase();
      for (const keyword of profile.keywords) {
        if (titleLower.includes(keyword.toLowerCase())) {
          score += 0.1;
          break;
        }
      }
    }

    // File name hints
    if (metadata.filename) {
      const fileLower = metadata.filename.toLowerCase();
      for (const keyword of profile.keywords) {
        if (fileLower.includes(keyword.toLowerCase())) {
          score += 0.1;
          break;
        }
      }
    }

    return Math.min(score, 1.0);
  }

  getMatchedKeywords(text, profile) {
    const textLower = text.toLowerCase();
    return profile.keywords.filter(k => textLower.includes(k.toLowerCase()));
  }

  getMatchedPatterns(text, profile) {
    return profile.patterns
      .filter(p => p.test(text))
      .map(p => p.toString());
  }

  async detectScanned(document, textContent) {
    // Heuristics for scanned documents
    const reasons = [];
    let confidence = 0;

    // Very little extractable text
    if (textContent.length < 200) {
      confidence += 0.4;
      reasons.push('Minimal extractable text');
    }

    // Check for image-heavy pages
    const imageRatio = await this.getImageToTextRatio(document);
    if (imageRatio > 0.8) {
      confidence += 0.3;
      reasons.push('Image-dominant pages');
    }

    // Check for common scan artifacts
    if (textContent.includes('Scan') || textContent.includes('Scanner')) {
      confidence += 0.2;
      reasons.push('Scanner metadata detected');
    }

    // Noise in text extraction
    const noiseRatio = this.calculateNoiseRatio(textContent);
    if (noiseRatio > 0.3) {
      confidence += 0.1;
      reasons.push('High OCR noise ratio');
    }

    return confidence > 0.3 
      ? { confidence: Math.min(confidence, 1.0), reason: reasons.join('; ') }
      : null;
  }

  async extractText(document) {
    // Integration with PDF.js or similar
    let fullText = '';
    try {
      for (let i = 1; i <= (document.numPages || 1); i++) {
        const page = await document.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map(item => item.str).join(' ') + ' ';
      }
    } catch (e) {
      console.warn('Text extraction failed:', e);
    }
    return fullText;
  }

  async getMetadata(document) {
    return {
      title: document.info?.Title || '',
      author: document.info?.Author || '',
      subject: document.info?.Subject || '',
      filename: document._filename || 'unknown.pdf'
    };
  }

  async getImageToTextRatio(document) {
    // Placeholder - in production, analyze page content streams
    return 0.5;
  }

  calculateNoiseRatio(text) {
    const totalChars = text.length;
    if (totalChars === 0) return 0;

    // Count non-printable and garbled characters
    const noiseChars = (text.match(/[^\x20-\x7E\s\n\r\t]/g) || []).length;
    return noiseChars / totalChars;
  }

  /**
   * Get quick action recommendations based on profile
   */
  getQuickActions(analysis) {
    const actions = [];
    const primary = analysis.primary;

    if (!primary) {
      actions.push({ id: 'generic-ocr', label: 'Run OCR', icon: 'scan' });
      actions.push({ id: 'generic-compress', label: 'Compress', icon: 'compress' });
      return actions;
    }

    switch (primary.type) {
      case 'invoice':
        actions.push({ id: 'parse-invoice', label: 'Parse Invoice Data', icon: 'table' });
        actions.push({ id: 'extract-totals', label: 'Extract Totals', icon: 'calculator' });
        actions.push({ id: 'redact-sensitive', label: 'Redact Sensitive Info', icon: 'shield' });
        break;
      case 'contract':
        actions.push({ id: 'extract-clauses', label: 'Extract Clauses', icon: 'file-text' });
        actions.push({ id: 'compare-versions', label: 'Compare Versions', icon: 'git-compare' });
        actions.push({ id: 'fingerprint', label: 'Add Fingerprint', icon: 'fingerprint' });
        break;
      case 'academic':
        actions.push({ id: 'extract-citations', label: 'Extract Citations', icon: 'book' });
        actions.push({ id: 'generate-toc', label: 'Generate TOC', icon: 'list' });
        actions.push({ id: 'annotate', label: 'Add Annotations', icon: 'pen-tool' });
        break;
      case 'form':
        actions.push({ id: 'detect-fields', label: 'Detect Fields', icon: 'layout' });
        actions.push({ id: 'autofill', label: 'Auto-Fill Form', icon: 'zap' });
        break;
    }

    // Universal actions
    if (analysis.metadata.hasText) {
      actions.push({ id: 'search-text', label: 'Search Text', icon: 'search' });
    }

    return actions;
  }
}

export { DocumentProfiler };
export default DocumentProfiler;
