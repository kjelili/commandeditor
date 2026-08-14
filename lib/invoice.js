/**
 * Client-side Financial Document Parser
 * Extracts line items, totals, vendor info without cloud APIs
 */
class InvoiceParser {
  constructor() {
    this.currencyPattern = /[$\u20AC\u00A3\u00A5]\s*[\d,]+\.?\d*|[\d,]+\.?\d*\s*[$\u20AC\u00A3\u00A5]/g;
    this.datePatterns = [
      /\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/g,
      /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}\b/gi
    ];
  }

  async parse(document) {
    const fullText = await this.extractFullText(document);
    const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    return {
      documentType: this.detectType(fullText),
      vendor: this.extractVendor(lines),
      invoiceNumber: this.extractInvoiceNumber(fullText),
      dates: this.extractDates(fullText),
      amounts: this.extractAmounts(fullText),
      lineItems: this.extractLineItems(lines),
      totals: this.extractTotals(fullText),
      tax: this.extractTax(fullText),
      confidence: this.calculateConfidence(fullText)
    };
  }

  detectType(text) {
    const lower = text.toLowerCase();
    if (lower.includes('invoice')) return 'invoice';
    if (lower.includes('receipt')) return 'receipt';
    if (lower.includes('bill')) return 'bill';
    if (lower.includes('statement')) return 'statement';
    return 'unknown';
  }

  extractVendor(lines) {
    const candidates = lines.slice(0, 10);
    for (const line of candidates) {
      if (line.length > 3 && line.length < 50 && !/^\d+$/.test(line)) {
        if (!line.match(/invoice|receipt|date|total|bill/i)) {
          return { name: line, confidence: 0.7 };
        }
      }
    }
    return null;
  }

  extractInvoiceNumber(text) {
    const patterns = [
      /invoice\s*(?:#|number|no\.?)\s*:?\s*([A-Z0-9\-]+)/i,
      /inv[.#]?\s*([A-Z0-9\-]+)/i,
      /order\s*(?:#|number)?\s*:?\s*([A-Z0-9\-]+)/i
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  extractDates(text) {
    const dates = [];
    for (const pattern of this.datePatterns) {
      const matches = text.match(pattern) || [];
      dates.push(...matches);
    }
    return {
      invoiceDate: dates[0] || null,
      dueDate: dates[1] || null,
      all: dates
    };
  }

  extractAmounts(text) {
    const matches = text.match(this.currencyPattern) || [];
    return matches.map(m => ({
      raw: m,
      value: this.parseCurrency(m)
    }));
  }

  extractLineItems(lines) {
    const items = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const itemMatch = line.match(/^(.+?)\s+(\d+)\s*[$\u20AC\u00A3]?([\d,]+\.?\d*)\s*$/);
      if (itemMatch) {
        items.push({
          description: itemMatch[1].trim(),
          quantity: parseInt(itemMatch[2]),
          unitPrice: parseFloat(itemMatch[3].replace(/,/g, '')),
          total: parseInt(itemMatch[2]) * parseFloat(itemMatch[3].replace(/,/g, ''))
        });
        continue;
      }
      const amountMatch = lines[i + 1]?.match(/^[$\u20AC\u00A3]?([\d,]+\.?\d*)$/);
      if (amountMatch && line.length > 5 && line.length < 100 && !line.match(/total|subtotal|tax/i)) {
        items.push({
          description: line,
          quantity: 1,
          unitPrice: parseFloat(amountMatch[1].replace(/,/g, '')),
          total: parseFloat(amountMatch[1].replace(/,/g, ''))
        });
        i++;
      }
    }
    return items;
  }

  extractTotals(text) {
    const patterns = {
      subtotal: /sub\s*total[:\s]*[$\u20AC\u00A3]?([\d,]+\.?\d*)/i,
      tax: /tax[:\s]*[$\u20AC\u00A3]?([\d,]+\.?\d*)/i,
      total: /(?:total|amount\s*due)[:\s]*[$\u20AC\u00A3]?([\d,]+\.?\d*)/i,
      discount: /discount[:\s]*[$\u20AC\u00A3]?([\d,]+\.?\d*)/i
    };
    const results = {};
    for (const [key, pattern] of Object.entries(patterns)) {
      const match = text.match(pattern);
      if (match) {
        results[key] = {
          raw: match[0],
          value: parseFloat(match[1].replace(/,/g, ''))
        };
      }
    }
    return results;
  }

  extractTax(text) {
    const match = text.match(/(?:tax|vat|gst)[:\s]*[$\u20AC\u00A3]?([\d,]+\.?\d*)\s*\(?(\d+\.?\d*)%\)?/i);
    if (match) {
      return {
        amount: parseFloat(match[1].replace(/,/g, '')),
        rate: parseFloat(match[2])
      };
    }
    return null;
  }

  parseCurrency(str) {
    return parseFloat(str.replace(/[$\u20AC\u00A3\u00A5,\s]/g, ''));
  }

  calculateConfidence(text) {
    let score = 0;
    const lower = text.toLowerCase();
    if (lower.includes('invoice') || lower.includes('receipt')) score += 0.3;
    if (this.extractInvoiceNumber(text)) score += 0.2;
    if (this.extractTotals(text).total) score += 0.2;
    if (this.extractDates(text).invoiceDate) score += 0.15;
    if (this.extractAmounts(text).length > 0) score += 0.15;
    return Math.min(score, 1.0);
  }

  async extractFullText(document) {
    let text = '';
    for (let i = 1; i <= document.numPages; i++) {
      const page = await document.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n';
    }
    return text;
  }

  exportToJSON(parseResult) {
    return JSON.stringify(parseResult, null, 2);
  }

  exportToCSV(parseResult) {
    let csv = 'Description,Quantity,Unit Price,Total\n';
    for (const item of parseResult.lineItems) {
      csv += `"${item.description}",${item.quantity},${item.unitPrice},${item.total}\n`;
    }
    csv += `\nSubtotal,${parseResult.totals.subtotal?.value || 0}\n`;
    csv += `Tax,${parseResult.totals.tax?.value || 0}\n`;
    csv += `Total,${parseResult.totals.total?.value || 0}\n`;
    return csv;
  }
}

export { InvoiceParser };
