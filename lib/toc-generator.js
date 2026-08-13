/**
 * Smart Table of Contents Generator
 * Auto-generates TOC from PDF headings using heuristics and font analysis
 */

class SmartTOCGenerator {
  constructor(options = {}) {
    this.options = {
      minHeadingSize: options.minHeadingSize || 12,
      headingSizeRatio: options.headingSizeRatio || 1.2,
      boldWeight: options.boldWeight || 700,
      maxDepth: options.maxDepth || 4,
      ignorePatterns: options.ignorePatterns || [
        /^page\s+\d+/i,
        /^copyright/i,
        /^all\s+rights/i,
        /^table\s+of\s+contents/i,
        /^index$/i,
        /^appendix$/i
      ]
    };
  }

  /**
   * Generate TOC from PDF document
   */
  async generate(document) {
    const headings = await this.extractHeadings(document);
    const toc = this.buildHierarchy(headings);

    return {
      entries: toc,
      flat: headings,
      stats: {
        totalHeadings: headings.length,
        maxDepth: this.getMaxDepth(toc),
        pagesCovered: new Set(headings.map(h => h.page)).size
      }
    };
  }

  /**
   * Extract potential headings from all pages
   */
  async extractHeadings(document) {
    const headings = [];
    const pageStats = await this.analyzePageFonts(document);

    for (let pageNum = 1; pageNum <= document.numPages; pageNum++) {
      const page = await document.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageStat = pageStats[pageNum];

      for (const item of textContent.items) {
        const heading = this.analyzeTextItem(item, pageNum, pageStat);
        if (heading && this.isValidHeading(heading)) {
          headings.push(heading);
        }
      }
    }

    // Post-process: deduplicate, sort, assign levels
    return this.postProcessHeadings(headings);
  }

  /**
   * Analyze text item to determine if it's a heading
   */
  analyzeTextItem(item, pageNum, pageStat) {
    const text = item.str?.trim();
    if (!text || text.length < 3 || text.length > 200) return null;

    const fontName = item.fontName || '';
    const fontSize = item.height || item.width / text.length || 12;
    const isBold = fontName.toLowerCase().includes('bold') || 
                   fontName.toLowerCase().includes('heavy') ||
                   fontName.toLowerCase().includes('black');
    const isItalic = fontName.toLowerCase().includes('italic') || 
                     fontName.toLowerCase().includes('oblique');

    // Calculate heading score
    let score = 0;
    const signals = [];

    // Size-based detection
    if (pageStat && fontSize > pageStat.avgSize * this.options.headingSizeRatio) {
      score += 0.3;
      signals.push('large_font');
    }
    if (fontSize >= this.options.minHeadingSize) {
      score += 0.1;
    }

    // Style-based detection
    if (isBold) {
      score += 0.2;
      signals.push('bold');
    }
    if (isItalic && !isBold) {
      score += 0.05;
    }

    // Position-based detection
    if (item.transform) {
      const y = item.transform[5];
      const pageHeight = pageStat?.height || 800;
      if (y > pageHeight * 0.85) {
        score += 0.1; // Top of page
        signals.push('top_position');
      }
    }

    // Content-based detection
    if (this.isNumberedHeading(text)) {
      score += 0.25;
      signals.push('numbered');
    }
    if (this.isAllCaps(text) && text.length < 50) {
      score += 0.15;
      signals.push('all_caps');
    }
    if (text.endsWith(':') || text.endsWith('.')) {
      score -= 0.1; // Less likely to be heading
    }

    // Structural patterns
    if (/^(chapter|section|part|appendix)\s+\d/i.test(text)) {
      score += 0.3;
      signals.push('structural_keyword');
    }

    if (score < 0.3) return null;

    return {
      text,
      page: pageNum,
      fontSize,
      isBold,
      isItalic,
      fontName,
      score,
      signals,
      level: null // Will be assigned in post-processing
    };
  }

  /**
   * Analyze fonts across all pages for baseline comparison
   */
  async analyzePageFonts(document) {
    const stats = {};

    for (let pageNum = 1; pageNum <= document.numPages; pageNum++) {
      const page = await document.getPage(pageNum);
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1.0 });

      let totalSize = 0;
      let count = 0;

      for (const item of textContent.items) {
        const size = item.height || 12;
        totalSize += size;
        count++;
      }

      stats[pageNum] = {
        avgSize: count > 0 ? totalSize / count : 12,
        height: viewport.height,
        width: viewport.width
      };
    }

    return stats;
  }

  /**
   * Post-process headings: deduplicate, sort, assign levels
   */
  postProcessHeadings(headings) {
    // Remove duplicates (same text, same page)
    const unique = [];
    const seen = new Set();

    for (const h of headings) {
      const key = `${h.text.toLowerCase()}_${h.page}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(h);
      }
    }

    // Sort by page, then by vertical position (top to bottom)
    unique.sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page;
      return (b.fontSize || 0) - (a.fontSize || 0);
    });

    // Assign levels based on font size hierarchy
    const sizeGroups = this.groupBySize(unique);
    const sortedSizes = Object.keys(sizeGroups)
      .map(Number)
      .sort((a, b) => b - a);

    const sizeToLevel = new Map();
    sortedSizes.forEach((size, idx) => {
      sizeToLevel.set(size, Math.min(idx + 1, this.options.maxDepth));
    });

    for (const h of unique) {
      h.level = sizeToLevel.get(h.fontSize) || this.options.maxDepth;

      // Override level for structural keywords
      if (/^chapter\s+\d+/i.test(h.text)) h.level = 1;
      else if (/^part\s+[ivx\d]+/i.test(h.text)) h.level = 1;
      else if (/^section\s+\d+\.0/i.test(h.text)) h.level = 1;
      else if (/^\d+\.\d+\.\d+\.\d+/.test(h.text)) h.level = 4;
      else if (/^\d+\.\d+\.\d+/.test(h.text)) h.level = 3;
      else if (/^\d+\.\d+/.test(h.text)) h.level = 2;
      else if (/^\d+\./.test(h.text)) h.level = 1;
    }

    return unique;
  }

  /**
   * Build hierarchical tree from flat headings
   */
  buildHierarchy(headings) {
    const root = [];
    const stack = [];

    for (const heading of headings) {
      const entry = {
        ...heading,
        children: [],
        id: `toc_${heading.page}_${heading.text.slice(0, 20).replace(/\W/g, '_')}`
      };

      // Find parent
      while (stack.length > 0 && stack[stack.length - 1].level >= entry.level) {
        stack.pop();
      }

      if (stack.length === 0) {
        root.push(entry);
      } else {
        stack[stack.length - 1].children.push(entry);
      }

      stack.push(entry);
    }

    return root;
  }

  /**
   * Validate heading against ignore patterns
   */
  isValidHeading(heading) {
    for (const pattern of this.options.ignorePatterns) {
      if (pattern.test(heading.text)) return false;
    }
    return true;
  }

  isNumberedHeading(text) {
    return /^\d+\.?\d*\s+/.test(text) || 
           /^chapter\s+\d+/i.test(text) ||
           /^part\s+[ivx\d]+/i.test(text) ||
           /^section\s+\d+/i.test(text);
  }

  isAllCaps(text) {
    return text === text.toUpperCase() && /[A-Z]{3,}/.test(text);
  }

  groupBySize(headings) {
    const groups = {};
    for (const h of headings) {
      const size = Math.round(h.fontSize * 2) / 2; // Round to nearest 0.5
      groups[size] = (groups[size] || 0) + 1;
    }
    return groups;
  }

  getMaxDepth(entries, currentDepth = 1) {
    let max = currentDepth;
    for (const entry of entries) {
      if (entry.children?.length > 0) {
        max = Math.max(max, this.getMaxDepth(entry.children, currentDepth + 1));
      }
    }
    return max;
  }

  /**
   * Export TOC to various formats
   */
  export(toc, format = 'json') {
    switch (format) {
      case 'json':
        return JSON.stringify(toc, null, 2);
      case 'html':
        return this.toHTML(toc.entries);
      case 'markdown':
        return this.toMarkdown(toc.entries);
      case 'pdf-outline':
        return this.toPDFOutline(toc.entries);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  toHTML(entries, level = 1) {
    if (!entries.length) return '';
    let html = `<ul class="toc-level-${level}">`;
    for (const entry of entries) {
      html += `<li><a href="#page-${entry.page}">${this.escapeHtml(entry.text)}</a>`;
      if (entry.children?.length > 0) {
        html += this.toHTML(entry.children, level + 1);
      }
      html += '</li>';
    }
    html += '</ul>';
    return html;
  }

  toMarkdown(entries, level = 1) {
    if (!entries.length) return '';
    let md = '';
    for (const entry of entries) {
      md += `${'#'.repeat(level)} ${entry.text}\n`;
      md += `> Page ${entry.page}\n\n`;
      if (entry.children?.length > 0) {
        md += this.toMarkdown(entry.children, level + 1);
      }
    }
    return md;
  }

  toPDFOutline(entries) {
    // Returns structure compatible with PDF outline tree
    return entries.map(entry => ({
      title: entry.text,
      page: entry.page,
      children: entry.children?.length > 0 ? this.toPDFOutline(entry.children) : []
    }));
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

export { SmartTOCGenerator };
export default SmartTOCGenerator;
