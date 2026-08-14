/**
 * Legal & Academic Citation Extractor
 * Parses citations without cloud dependency
 */
class CitationExtractor {
  constructor() {
    this.patterns = {
      us_case: {
        regex: /(\d{1,3})\s+([A-Za-z.]+)\s+(\d{1,4})\s*\(\d{4}\)/g,
        type: 'us_case',
        fields: ['volume', 'reporter', 'page', 'year']
      },
      us_code: {
        regex: /(\d+)\s+U\.?S\.?C\.?\s+§?\s*(\d+[a-z]?)/gi,
        type: 'statute',
        fields: ['title', 'section']
      },
      cfr: {
        regex: /(\d+)\s+C\.?F\.?R\.?\s+§?\s*(\d+\.\d+)/gi,
        type: 'regulation',
        fields: ['title', 'section']
      },
      fed_reg: {
        regex: /(\d+)\s+Fed\.?\s*Reg\.?\s+(\d{1,5})/gi,
        type: 'federal_register',
        fields: ['volume', 'page']
      },
      doi: {
        regex: /10\.\d{4,}\/[^\s"<>]+/g,
        type: 'doi',
        fields: ['identifier']
      },
      url: {
        regex: /https?:\/\/[^\s"<>]+/g,
        type: 'url',
        fields: ['url']
      },
      eu_case: {
        regex: /Case\s+C-?(\d+)\/(\d+)/gi,
        type: 'eu_case',
        fields: ['number', 'year']
      }
    };
  }

  async extract(document, options = {}) {
    const { types = 'all', pages = 'all' } = options;
    const citations = [];
    const pageRange = pages === 'all' 
      ? Array.from({length: document.numPages}, (_, i) => i + 1)
      : pages;

    for (const pageNum of pageRange) {
      const page = await document.getPage(pageNum);
      const textContent = await page.getTextContent();
      const text = textContent.items.map(i => i.str).join(' ');

      for (const [key, pattern] of Object.entries(this.patterns)) {
        if (types !== 'all' && !types.includes(key)) continue;

        let match;
        while ((match = pattern.regex.exec(text)) !== null) {
          const citation = {
            id: `cite_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            type: pattern.type,
            raw: match[0],
            page: pageNum,
            context: this.getContext(text, match.index, match[0].length),
            parsed: {}
          };

          pattern.fields.forEach((field, idx) => {
            citation.parsed[field] = match[idx + 1]?.trim();
          });

          citation.normalized = this.normalize(citation);
          citations.push(citation);
        }
        pattern.regex.lastIndex = 0;
      }
    }

    return this.deduplicate(citations);
  }

  normalize(citation) {
    switch (citation.type) {
      case 'us_case':
        return `${citation.parsed.volume} ${citation.parsed.reporter} ${citation.parsed.page} (${citation.parsed.year})`;
      case 'statute':
        return `${citation.parsed.title} U.S.C. § ${citation.parsed.section}`;
      case 'doi':
        return `https://doi.org/${citation.parsed.identifier}`;
      default:
        return citation.raw;
    }
  }

  deduplicate(citations) {
    const seen = new Set();
    return citations.filter(c => {
      const key = `${c.normalized}_${c.page}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  getContext(text, index, length) {
    const before = text.slice(Math.max(0, index - 80), index);
    const after = text.slice(index + length, index + length + 80);
    return `${before}[CITATION]${after}`.replace(/\s+/g, ' ');
  }

  exportToBibTeX(citations) {
    let bibtex = '';
    for (const cite of citations) {
      if (cite.type === 'journal_article') {
        const key = `${cite.parsed.authors?.split(',')[0]?.toLowerCase() || 'unknown'}${cite.parsed.year}`;
        bibtex += `@article{${key},\n`;
        bibtex += `  author = {${cite.parsed.authors}},\n`;
        bibtex += `  title = {${cite.parsed.title}},\n`;
        bibtex += `  journal = {${cite.parsed.journal}},\n`;
        bibtex += `  year = {${cite.parsed.year}},\n`;
        bibtex += `  volume = {${cite.parsed.volume}},\n`;
        bibtex += `  number = {${cite.parsed.issue}},\n`;
        bibtex += `  pages = {${cite.parsed.pages}}\n`;
        bibtex += `}\n\n`;
      }
    }
    return bibtex;
  }
}

export { CitationExtractor };
