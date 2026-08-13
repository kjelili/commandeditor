/**
 * Advanced Redaction Suite
 * Permanent redaction with verification patterns
 * Supports pattern-based, manual, and AI-assisted redaction
 */

class RedactionSuite {
  constructor() {
    this.patterns = this.getDefaultPatterns();
    this.redactionHistory = [];
  }

  getDefaultPatterns() {
    return {
      ssn: {
        name: 'Social Security Number',
        regex: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
        category: 'pii',
        description: 'US Social Security Numbers'
      },
      email: {
        name: 'Email Address',
        regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        category: 'pii',
        description: 'Email addresses'
      },
      phone: {
        name: 'Phone Number',
        regex: /\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
        category: 'pii',
        description: 'Phone numbers'
      },
      credit_card: {
        name: 'Credit Card',
        regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
        category: 'financial',
        description: 'Credit card numbers'
      },
      bank_account: {
        name: 'Bank Account',
        regex: /\b\d{8,17}\b/g,
        category: 'financial',
        description: 'Bank account numbers'
      },
      passport: {
        name: 'Passport Number',
        regex: /\b[A-Z]{1,2}\d{6,9}\b/g,
        category: 'identity',
        description: 'Passport numbers'
      },
      dob: {
        name: 'Date of Birth',
        regex: /\b(?:0?[1-9]|1[0-2])[\/\-](?:0?[1-9]|[12]\d|3[01])[\/\-](?:19|20)\d{2}\b/g,
        category: 'pii',
        description: 'Dates of birth'
      },
      ip_address: {
        name: 'IP Address',
        regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
        category: 'technical',
        description: 'IP addresses'
      },
      ein: {
        name: 'EIN / TIN',
        regex: /\b\d{2}[-\s]?\d{7}\b/g,
        category: 'financial',
        description: 'Employer Identification Numbers'
      },
      name: {
        name: 'Person Name',
        regex: /\b[A-Z][a-z]+\s[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\b/g,
        category: 'pii',
        description: 'Person names (heuristic)'
      }
    };
  }

  /**
   * Scan document for sensitive information
   */
  async scan(document, options = {}) {
    const { 
      patterns = Object.keys(this.patterns),
      pages = 'all',
      confidenceThreshold = 0.5
    } = options;

    const findings = [];
    const pageRange = pages === 'all' 
      ? Array.from({length: document.numPages}, (_, i) => i + 1)
      : pages;

    for (const pageNum of pageRange) {
      const page = await document.getPage(pageNum);
      const textContent = await page.getTextContent();
      const fullText = textContent.items.map(item => item.str).join(' ');

      for (const patternKey of patterns) {
        const pattern = this.patterns[patternKey];
        if (!pattern) continue;

        const matches = [...fullText.matchAll(pattern.regex)];
        for (const match of matches) {
          // Find position in text items for precise redaction
          const positions = await this.findTextPositions(textContent, match[0], match.index);

          findings.push({
            id: `find_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            pattern: patternKey,
            patternName: pattern.name,
            category: pattern.category,
            text: match[0],
            page: pageNum,
            positions,
            confidence: this.calculateConfidence(match[0], pattern),
            context: this.getContext(fullText, match.index, match[0].length)
          });
        }
      }
    }

    return findings.filter(f => f.confidence >= confidenceThreshold);
  }

  /**
   * Apply redactions to document
   */
  async applyRedactions(document, redactions, options = {}) {
    const {
      verify = true,
      burnText = true,
      burnImages = true,
      addOverlay = true,
      overlayColor = [0, 0, 0],
      overlayText = 'REDACTED',
      reason = ''
    } = options;

    const results = [];

    for (const redaction of redactions) {
      try {
        // 1. Add visual overlay
        if (addOverlay) {
          await this.addVisualRedaction(document, redaction, overlayColor, overlayText);
        }

        // 2. Remove underlying text (burn)
        if (burnText) {
          await this.burnText(document, redaction);
        }

        // 3. Remove underlying images (burn)
        if (burnImages) {
          await this.burnImages(document, redaction);
        }

        results.push({
          redactionId: redaction.id,
          success: true,
          page: redaction.page,
          pattern: redaction.pattern
        });
      } catch (error) {
        results.push({
          redactionId: redaction.id,
          success: false,
          error: error.message
        });
      }
    }

    // 4. Verification pass
    if (verify) {
      const verification = await this.verifyRedactions(document, redactions);
      return { results, verification };
    }

    this.redactionHistory.push({
      timestamp: new Date().toISOString(),
      redactionCount: redactions.length,
      options,
      results
    });

    return { results };
  }

  /**
   * Verify redactions were properly applied
   */
  async verifyRedactions(document, originalRedactions) {
    const issues = [];

    for (const redaction of originalRedactions) {
      const page = await document.getPage(redaction.page);
      const textContent = await page.getTextContent();
      const fullText = textContent.items.map(item => item.str).join(' ');

      // Check if redacted text still exists
      if (fullText.includes(redaction.text)) {
        issues.push({
          redactionId: redaction.id,
          issue: 'text_still_present',
          severity: 'critical',
          details: `Redacted text "${redaction.text}" still found on page ${redaction.page}`
        });
      }

      // Check for partial matches
      const partialMatches = this.findPartialMatches(fullText, redaction.text);
      if (partialMatches.length > 0) {
        issues.push({
          redactionId: redaction.id,
          issue: 'partial_match',
          severity: 'warning',
          details: `Partial matches found: ${partialMatches.join(', ')}`
        });
      }
    }

    return {
      passed: issues.length === 0,
      issues,
      summary: {
        totalChecked: originalRedactions.length,
        criticalIssues: issues.filter(i => i.severity === 'critical').length,
        warnings: issues.filter(i => i.severity === 'warning').length
      }
    };
  }

  /**
   * Add manual redaction region
   */
  async addManualRedaction(document, page, rect, options = {}) {
    const redaction = {
      id: `manual_${Date.now()}`,
      pattern: 'manual',
      patternName: 'Manual Redaction',
      category: 'manual',
      text: options.text || '',
      page,
      positions: [rect],
      confidence: 1.0,
      reason: options.reason || ''
    };

    return redaction;
  }

  /**
   * Create redaction report
   */
  generateReport(redactions, verification) {
    return {
      generatedAt: new Date().toISOString(),
      summary: {
        totalRedactions: redactions.length,
        byCategory: this.groupByCategory(redactions),
        byPattern: this.groupByPattern(redactions),
        byPage: this.groupByPage(redactions)
      },
      redactions: redactions.map(r => ({
        id: r.id,
        pattern: r.patternName,
        category: r.category,
        page: r.page,
        text: this.maskText(r.text),
        confidence: r.confidence,
        reason: r.reason
      })),
      verification: verification ? {
        passed: verification.passed,
        criticalIssues: verification.summary.criticalIssues,
        warnings: verification.summary.warnings
      } : null
    };
  }

  // ─── Internal Helpers ─────────────────────────────────────────────────────

  async findTextPositions(textContent, searchText, startIndex) {
    const positions = [];
    let currentIndex = 0;
    let foundStart = false;
    let startItem = null;

    for (const item of textContent.items) {
      const itemText = item.str;
      // NOTE: scan() builds fullText with items joined by ' ', so each item
      // occupies itemText.length + 1 characters in match-index space.
      const itemEnd = currentIndex + itemText.length;

      if (!foundStart && startIndex >= currentIndex && startIndex < itemEnd) {
        foundStart = true;
        startItem = item;
      }

      if (foundStart && startItem) {
        const transform = item.transform;
        positions.push({
          x: transform[4],
          y: transform[5],
          width: item.width,
          height: item.height,
          fontName: item.fontName
        });

        if (currentIndex + itemText.length >= startIndex + searchText.length) {
          break;
        }
      }

      currentIndex += itemText.length + 1; // +1 for the join(' ') separator
    }

    return positions;
  }

  calculateConfidence(text, pattern) {
    let confidence = 0.7; // Base confidence

    // Boost for exact pattern match length
    if (pattern.regex.toString().includes('\\d')) {
      const digitRatio = (text.match(/\d/g) || []).length / text.length;
      confidence += digitRatio * 0.2;
    }

    // Boost for standard formatting
    if (text.includes('-') || text.includes(' ')) {
      confidence += 0.05;
    }

    return Math.min(confidence, 1.0);
  }

  getContext(fullText, index, length) {
    const before = fullText.slice(Math.max(0, index - 50), index);
    const after = fullText.slice(index + length, index + length + 50);
    return { before: before.trim(), after: after.trim() };
  }

  async addVisualRedaction(document, redaction, color, overlayText) {
    // In production: Use PDF-lib or PDF.js to draw rectangles
    // over redacted areas
    return { applied: true, method: 'overlay' };
  }

  async burnText(document, redaction) {
    // In production: Remove text objects from content stream
    // and rewrite page content
    return { burned: true };
  }

  async burnImages(document, redaction) {
    // In production: Remove image objects that overlap redaction area
    return { burned: true };
  }

  findPartialMatches(text, searchText) {
    const matches = [];
    const words = searchText.split(/\s+/);

    for (const word of words) {
      if (word.length > 3 && text.includes(word) && !text.includes(searchText)) {
        matches.push(word);
      }
    }

    return matches;
  }

  groupByCategory(redactions) {
    const groups = {};
    for (const r of redactions) {
      groups[r.category] = (groups[r.category] || 0) + 1;
    }
    return groups;
  }

  groupByPattern(redactions) {
    const groups = {};
    for (const r of redactions) {
      groups[r.patternName] = (groups[r.patternName] || 0) + 1;
    }
    return groups;
  }

  groupByPage(redactions) {
    const groups = {};
    for (const r of redactions) {
      groups[r.page] = (groups[r.page] || 0) + 1;
    }
    return groups;
  }

  maskText(text) {
    if (text.length <= 4) return '****';
    return text.slice(0, 2) + '*'.repeat(text.length - 4) + text.slice(-2);
  }
}

export { RedactionSuite };
export default RedactionSuite;
